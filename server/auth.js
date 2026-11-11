// Login do hub: usuário + senha, para o administrador (a imobiliária) e para os colaboradores.
// O administrador é criado sozinho na primeira vez, com ADMIN_USUARIO e ADMIN_SENHA (variáveis do Railway).
// Esqueceu a senha do administrador: ADMIN_REDEFINIR_SENHA=1 no Railway volta a senha para ADMIN_SENHA
// na próxima vez que o servidor subir (depois apague essa variável).
// A sessão vale para o hub e para o CRM (mesmo endereço, mesmo cookie).
import crypto from 'node:crypto';
import { q } from './db.js';

const COOKIE = 'lopes_sessao';
const DIAS_SESSAO = 30; // fica logado: o hub é usado todo dia
const MAX_TENTATIVAS = 8, JANELA_MS = 15 * 60 * 1000;
export const SENHA_MIN = 6;

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 32);
  return `scrypt:${sal.toString('hex')}:${h.toString('hex')}`;
}
export function confereHash(senha, guardado) {
  const [tipo, sal, h] = String(guardado || '').split(':');
  if (tipo !== 'scrypt' || !sal || !h) return false;
  const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'hex'), 32);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}
// para usuário que não existe gastar o mesmo tempo (não entrega quais usuários existem)
const HASH_FALSO = hashSenha(crypto.randomBytes(8).toString('hex'));

// Quem pode entrar: ativo, com acesso liberado e com senha
export async function conferirLogin(usuario, senha) {
  const u = String(usuario || '').trim();
  if (!u || !senha) return null;
  const r = await q('SELECT id, nome, usuario, papel, senha_hash FROM usuarios WHERE lower(usuario) = lower($1) AND ativo AND acesso AND senha_hash IS NOT NULL', [u]);
  const pessoa = r.rows[0];
  const ok = confereHash(senha, pessoa ? pessoa.senha_hash : HASH_FALSO);
  return pessoa && ok ? pessoa : null;
}

// Cria o administrador na primeira vez (ou redefine a senha dele, se pedido)
export async function prepararAdmin() {
  const usuario = String(process.env.ADMIN_USUARIO || 'Lopes').trim();
  const senha = String(process.env.ADMIN_SENHA || '');
  const r = await q("SELECT id FROM usuarios WHERE papel = 'admin' ORDER BY id LIMIT 1");
  if (!r.rows[0]) {
    if (senha.length < SENHA_MIN) { console.warn(`[aviso] defina ADMIN_SENHA (mínimo ${SENHA_MIN} caracteres) no Railway para criar o acesso de administrador.`); return; }
    await q("INSERT INTO usuarios (nome, usuario, senha_hash, papel, cargo, acesso) VALUES ($1, $1, $2, 'admin', 'Administrador', true)", [usuario, hashSenha(senha)]);
    console.log(`[ok] administrador "${usuario}" criado.`);
    return;
  }
  if (process.env.ADMIN_REDEFINIR_SENHA === '1' && senha.length >= SENHA_MIN) {
    await q('UPDATE usuarios SET usuario = $1, senha_hash = $2, ativo = true, acesso = true, atualizado_em = now() WHERE id = $3', [usuario, hashSenha(senha), r.rows[0].id]);
    await q('DELETE FROM sessoes WHERE usuario_id = $1', [r.rows[0].id]);
    console.log('[ok] senha do administrador redefinida. Apague a variável ADMIN_REDEFINIR_SENHA no Railway.');
  }
}

// ---------- limite de tentativas de senha, por IP ----------
const tentativas = new Map();
export function bloqueado(ip) {
  const t = tentativas.get(ip);
  if (t && t.ate < Date.now()) { tentativas.delete(ip); return false; }
  return !!t && t.n >= MAX_TENTATIVAS;
}
export function errouSenha(ip) {
  const t = tentativas.get(ip) || { n: 0, ate: Date.now() + JANELA_MS };
  t.n++; tentativas.set(ip, t);
}
export const acertouSenha = ip => tentativas.delete(ip);

// ---------- sessão (cookie com token aleatório; o banco guarda só o hash) ----------
function lerCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* cookie estranho */ } }
  });
  return out;
}
const seguro = req => (req.headers['x-forwarded-proto'] || '').includes('https');
function cookie(req, valor, maxAge) {
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro(req) ? '; Secure' : ''}`;
}

// Quem está logado (ou null). Desativar a pessoa ou tirar o acesso derruba a sessão na hora.
export async function quemEsta(req) {
  const token = lerCookies(req)[COOKIE];
  if (!token || token.length !== 64) return null;
  const r = await q(`SELECT u.id, u.nome, u.usuario, u.papel, u.cargo FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = $1 AND s.expira > now() AND u.ativo AND u.acesso`, [sha256(token)]);
  return r.rows[0] || null;
}
export async function abrirSessao(req, res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await q(`INSERT INTO sessoes (token_hash, usuario_id, expira) VALUES ($1, $2, now() + interval '${DIAS_SESSAO} days')`, [sha256(token), usuarioId]);
  await q('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [usuarioId]);
  res.setHeader('Set-Cookie', cookie(req, token, DIAS_SESSAO * 86400));
}
export async function fecharSessao(req, res) {
  const token = lerCookies(req)[COOKIE];
  if (token) await q('DELETE FROM sessoes WHERE token_hash = $1', [sha256(token)]);
  res.setHeader('Set-Cookie', cookie(req, '', 0));
}
// todas as sessões de uma pessoa, menos a atual (trocar senha) ou todas (tirar acesso)
export async function fecharSessoesDe(usuarioId, req = null) {
  const atual = req && lerCookies(req)[COOKIE];
  if (atual) await q('DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2', [usuarioId, sha256(atual)]);
  else await q('DELETE FROM sessoes WHERE usuario_id = $1', [usuarioId]);
}
