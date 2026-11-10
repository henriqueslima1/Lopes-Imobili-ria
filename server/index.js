// Servidor do Hub Lopes: entrega os arquivos de public_html.
// Por enquanto não tem login nem banco: api.php responde "Não encontrado" e o hub abre em modo exemplo.
// Login, Postgres, CRM e assinatura (Asaas) entram aqui depois, reaproveitando o server/ do hub-ferramentas.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public_html');
const PORTA = Number(process.env.PORT) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

function texto(res, status, msg, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(msg);
}

const servidor = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 404, 'Não encontrado');

  let caminho;
  try { caminho = decodeURIComponent(new URL(req.url, 'http://hub').pathname); } catch (e) { return texto(res, 400, 'Endereço inválido'); }
  if (caminho.includes('\0')) return texto(res, 400, 'Endereço inválido');
  const arquivo = path.join(RAIZ, path.normalize(caminho.endsWith('/') ? caminho + 'index.html' : caminho));
  if (arquivo !== RAIZ && !arquivo.startsWith(RAIZ + path.sep)) return texto(res, 404, 'Não encontrado');

  try {
    const info = await stat(arquivo);
    if (info.isDirectory()) return texto(res, 301, '', { Location: caminho + '/' });
    const corpo = await readFile(arquivo);
    const ext = path.extname(arquivo).toLowerCase();
    // HTML sempre confere a versão nova; o resto pode ficar 5 minutos no navegador
    res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300', 'Content-Length': corpo.length });
    res.end(req.method === 'HEAD' ? undefined : corpo);
  } catch (e) {
    texto(res, 404, 'Não encontrado');
  }
});

servidor.listen(PORTA, () => console.log(`Hub Lopes no ar na porta ${PORTA}`));
