// Servidor do Hub Lopes: entrega os arquivos de public_html e responde às ações das telas.
//   /api.php       o hub (tela inicial, colaboradores, senha)
//   /crm/api.php   o CRM (leads, etapas, follow-ups, ajustes)
// O login (usuário + senha) vale para os dois: mesmo endereço, mesmo cookie.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrar, temBanco } from './db.js';
import * as auth from './auth.js';
import * as hub from './rotas/hub.js';
import * as crm from './rotas/crm.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public_html');
const PORTA = Number(process.env.PORT) || 8080;
const LIMITE_CORPO = 3 * 1024 * 1024;

const ROTAS = {
  '/api.php': hub,
  '/crm/api.php': crm
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

function cabecalhosSeguranca(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}
function json(res, status, obj) {
  let corpo = Buffer.from(JSON.stringify(obj));
  const cab = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  // respostas grandes (a lista de leads) vão compactadas
  if (corpo.length > 8192 && /gzip/.test((res.req && res.req.headers['accept-encoding']) || '')) { corpo = gzipSync(corpo); cab['Content-Encoding'] = 'gzip'; cab.Vary = 'Accept-Encoding'; }
  res.writeHead(status, cab);
  res.end(corpo);
}
const ipDe = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    const partes = []; let tam = 0;
    req.on('data', c => { tam += c.length; if (tam > LIMITE_CORPO) { falha(Object.assign(new Error('Envio grande demais.'), { status: 413 })); req.destroy(); } else partes.push(c); });
    req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
    req.on('error', falha);
  });
}

async function api(req, res, url, rota) {
  const acao = url.searchParams.get('acao') || '';
  const fn = Object.hasOwn(rota.acoes, acao) ? rota.acoes[acao] : (acao === 'entrar' || acao === 'sair') ? null : undefined;
  if (fn === undefined) return json(res, 404, { erro: 'Ação desconhecida.' });
  if (!temBanco()) return json(res, 503, { erro: 'O servidor está sem banco de dados (DATABASE_URL).' });

  let corpo = {};
  if (req.method === 'POST') {
    if (!/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { erro: 'Envie em JSON.' });
    const bruto = await lerCorpo(req);
    try { corpo = bruto ? JSON.parse(bruto) : {}; } catch (e) { return json(res, 400, { erro: 'JSON inválido.' }); }
    if (!corpo || typeof corpo !== 'object') corpo = {};
  } else if (req.method !== 'GET') return json(res, 405, { erro: 'Método não permitido.' });
  // só a consulta da sessão pode vir por GET
  if (req.method === 'GET' && acao !== 'sessao') return json(res, 405, { erro: 'Use POST.' });

  const ip = ipDe(req);
  if (acao === 'entrar') {
    if (auth.bloqueado(ip)) return json(res, 429, { erro: 'Muitas tentativas. Espere 15 minutos e tente de novo.' });
    const pessoa = await auth.conferirLogin(corpo.usuario, corpo.senha);
    if (!pessoa) { auth.errouSenha(ip); return json(res, 401, { erro: 'Usuário ou senha incorretos.' }); }
    auth.acertouSenha(ip);
    await auth.abrirSessao(req, res, pessoa.id);
    return json(res, 200, { ok: true, logado: true, usuario: { nome: pessoa.nome, usuario: pessoa.usuario, papel: pessoa.papel } });
  }
  if (acao === 'sair') { await auth.fecharSessao(req, res); return json(res, 200, { ok: true }); }

  const eu = await auth.quemEsta(req);
  if (!eu && !rota.publicas.has(acao)) return json(res, 401, { erro: 'Entre de novo com seu usuário e senha.' });
  if (rota.soAdmin && rota.soAdmin.has(acao) && (!eu || eu.papel !== 'admin')) return json(res, 403, { erro: 'Só o administrador pode fazer isso.' });

  const r = await fn({ corpo, req, res, url, ip, eu });
  return json(res, 200, r || { ok: true });
}

const cacheGzip = new Map();
const naoEncontrado = res => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); };
async function arquivo(req, res, url) {
  let caminho;
  try { caminho = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  const alvo = path.resolve(RAIZ, '.' + caminho);
  // nada fora de public_html, nada escondido (.algo) e nenhum .php como arquivo
  if ((alvo !== RAIZ && !alvo.startsWith(RAIZ + path.sep)) || /\/\./.test(caminho) || /\.php$/i.test(alvo) || caminho.includes('\0')) return naoEncontrado(res);
  let info, final = alvo;
  try {
    info = await stat(final);
    if (info.isDirectory()) {
      if (!caminho.endsWith('/')) { res.writeHead(301, { Location: caminho + '/' + url.search }); return res.end(); }
      final = path.join(alvo, 'index.html'); info = await stat(final);
    }
  } catch (e) { return naoEncontrado(res); }

  const tipo = TIPOS[path.extname(final).toLowerCase()] || 'application/octet-stream';
  const modificado = info.mtime.toUTCString();
  if (req.headers['if-modified-since'] === modificado) { res.writeHead(304); return res.end(); }
  const cab = { 'Content-Type': tipo, 'Last-Modified': modificado, 'Cache-Control': 'no-cache' };
  let corpo = await readFile(final);
  if (/text|javascript|json|svg/.test(tipo) && /gzip/.test(req.headers['accept-encoding'] || '') && corpo.length > 1024) {
    const chave = final + info.mtimeMs;
    if (!cacheGzip.has(chave)) cacheGzip.set(chave, gzipSync(corpo));
    corpo = cacheGzip.get(chave); cab['Content-Encoding'] = 'gzip'; cab.Vary = 'Accept-Encoding';
  }
  res.writeHead(200, cab);
  res.end(req.method === 'HEAD' ? undefined : corpo);
}

const servidor = http.createServer(async (req, res) => {
  cabecalhosSeguranca(res);
  let url;
  try { url = new URL(req.url, 'http://local'); } catch (e) { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname === '/saude') return json(res, 200, { ok: true, banco: temBanco() });
    const rota = ROTAS[url.pathname];
    if (rota) return await api(req, res, url, rota);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erro: 'Método não permitido.' });
    return await arquivo(req, res, url);
  } catch (e) {
    const status = e.status || (e.code === '23505' ? 409 : 500); // 23505: nome ou usuário repetido
    if (status >= 500) console.error(`[erro] ${req.method} ${url.pathname}?${url.searchParams.get('acao') || ''}:`, e);
    const msg = status === 409 && !e.status ? 'Já existe um cadastro com esse nome ou usuário.' : status >= 500 && !e.status ? 'Erro no servidor. Tente de novo em instantes.' : e.message;
    if (!res.headersSent) json(res, status, { erro: msg });
    else res.end();
  }
});

async function iniciar() {
  if (temBanco()) { await migrar(); await auth.prepararAdmin(); }
  else console.warn('[aviso] sem DATABASE_URL: o site abre, mas login e dados não funcionam.');
  servidor.listen(PORTA, () => console.log(`Hub Lopes no ar na porta ${PORTA}`));
}
iniciar().catch(e => { console.error('[erro] não consegui iniciar:', e); process.exit(1); });
