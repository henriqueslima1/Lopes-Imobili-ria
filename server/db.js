// Banco de dados (Postgres do Railway). As tabelas são criadas sozinhas na primeira vez.
// usuarios: o administrador (a conta da imobiliária) e os colaboradores (corretores e equipe).
// leads, lead_historico e followups: o CRM (mesmo formato do CRM do Hub de Ferramentas).
import pg from 'pg';

const url = process.env.DATABASE_URL || '';
// Dentro do Railway (postgres.railway.internal) a conexão é sem SSL; pela rede pública (proxy) é com SSL.
const ssl = /sslmode=require|rlwy\.net/.test(url) ? { rejectUnauthorized: false } : false;

export const pool = url ? new pg.Pool({ connectionString: url, ssl, max: 5 }) : null;
export const temBanco = () => !!pool;

export async function q(sql, params) {
  if (!pool) throw Object.assign(new Error('Banco de dados não configurado (falta DATABASE_URL).'), { status: 503 });
  return pool.query(sql, params);
}

// Várias consultas que precisam ir juntas (ou nenhuma)
export async function transacao(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn((sql, params) => c.query(sql, params));
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function migrar() {
  await q(`
    CREATE TABLE IF NOT EXISTS config (chave text PRIMARY KEY, valor jsonb NOT NULL);
    -- quem entra no hub: papel 'admin' (a imobiliária) ou 'colaborador' (corretores e equipe).
    -- Sem acesso (acesso = false) a pessoa continua cadastrada e aparece no CRM como responsável, mas não entra.
    CREATE TABLE IF NOT EXISTS usuarios (
      id serial PRIMARY KEY, nome text NOT NULL, usuario text, senha_hash text,
      papel text NOT NULL DEFAULT 'colaborador', cargo text NOT NULL DEFAULT 'Corretor',
      telefone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', creci text NOT NULL DEFAULT '',
      ativo boolean NOT NULL DEFAULT true, acesso boolean NOT NULL DEFAULT false, ultimo_acesso timestamptz,
      criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login ON usuarios (lower(usuario)) WHERE usuario IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_nome ON usuarios (lower(nome));
    CREATE TABLE IF NOT EXISTS sessoes (
      token_hash text PRIMARY KEY, usuario_id int NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE, expira timestamptz NOT NULL
    );
    -- leads (formulários e anúncios podem gravar direto aqui, com etapa 'novo'), histórico de cada lead e follow-ups
    CREATE TABLE IF NOT EXISTS leads (
      id serial PRIMARY KEY, nome text NOT NULL DEFAULT '', telefone text NOT NULL DEFAULT '', instagram text NOT NULL DEFAULT '',
      objetivo text NOT NULL DEFAULT '', tipologia text NOT NULL DEFAULT '', empreendimento text NOT NULL DEFAULT '', notas text,
      etapa text NOT NULL DEFAULT 'novo', origem text, campanha text, conjunto text, criativo text,
      valor double precision, responsavel text, prioridade text, temperatura text, nao_contatar boolean NOT NULL DEFAULT false,
      visita_em timestamptz, ficha jsonb, criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
    );
    -- quando virou venda (vendas por corretor no período)
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS vendido_em timestamptz;
    CREATE INDEX IF NOT EXISTS leads_etapa ON leads (etapa);
    CREATE INDEX IF NOT EXISTS leads_criado ON leads (criado_em);
    CREATE INDEX IF NOT EXISTS leads_responsavel ON leads (lower(responsavel));
    CREATE TABLE IF NOT EXISTS lead_historico (id serial PRIMARY KEY, lead_id int NOT NULL REFERENCES leads (id) ON DELETE CASCADE, tipo text NOT NULL, texto text, criado_em timestamptz NOT NULL DEFAULT now());
    -- quem fez cada coisa no lead
    ALTER TABLE lead_historico ADD COLUMN IF NOT EXISTS autor text;
    CREATE INDEX IF NOT EXISTS lead_historico_lead ON lead_historico (lead_id);
    CREATE TABLE IF NOT EXISTS followups (
      id serial PRIMARY KEY, lead_id int NOT NULL REFERENCES leads (id) ON DELETE CASCADE, quando timestamptz NOT NULL,
      canal text NOT NULL DEFAULT '', nota text, feito_em timestamptz, criado_em timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS followups_lead ON followups (lead_id);
    CREATE INDEX IF NOT EXISTS followups_quando ON followups (quando);
  `);
  await q('DELETE FROM sessoes WHERE expira < now()');
}

export async function lerConfig(chave, padrao = null) {
  const r = await q('SELECT valor FROM config WHERE chave = $1', [chave]);
  return r.rows.length ? r.rows[0].valor : padrao;
}
export async function gravarConfig(chave, valor) {
  await q('INSERT INTO config (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor', [chave, JSON.stringify(valor)]);
}
