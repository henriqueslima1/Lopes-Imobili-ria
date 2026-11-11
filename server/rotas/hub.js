// Ações do hub (public_html chama api.php?acao=...): tela inicial, colaboradores e a própria senha.
// Colaboradores (corretores e equipe) só o administrador vê e mexe (soAdmin).
// As vendas de cada corretor saem dos leads do CRM: etapa "venda", com o nome dele em Responsável.
import { q, transacao } from '../db.js';
import { hashSenha, confereHash, fecharSessoesDe, SENHA_MIN } from '../auth.js';
import { numerosCrm, vendasDoMes, inicioDoMes, instante, inicioDoDia } from './crm.js';

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const idNum = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw erro('Colaborador inválido.'); return n; };

export const CARGOS = ['Corretor', 'Gerente', 'Captador', 'Secretária', 'Financeiro', 'Outro'];
// etapas "em andamento" no CRM (as mesmas ABERTAS de public_html/crm/nucleo.js)
const ABERTAS = ['novo', 'primeiro_contato', 'respondeu', 'nao_respondeu', 'visita_agendada', 'proposta'];

// Período das vendas: este mês, últimos 90 dias, este ano ou desde sempre
function inicioPeriodo(periodo) {
  if (periodo === '90') return inicioDoDia(-90);
  if (periodo === 'ano') { const ano = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date())); return instante(ano, 1, 1); }
  if (periodo === 'tudo') return new Date(0);
  return inicioDoMes();
}

// O que a tela pode ver de cada pessoa (nunca a senha)
const publico = u => ({
  id: u.id, nome: u.nome, cargo: u.cargo, telefone: u.telefone, email: u.email, creci: u.creci,
  ativo: u.ativo, acesso: u.acesso, usuario: u.usuario || '', ultimo_acesso: u.ultimo_acesso, criado_em: u.criado_em
});

export const publicas = new Set(['sessao', 'entrar']);
export const soAdmin = new Set(['colaboradores', 'colaborador', 'colaborador_salvar', 'colaborador_excluir']);
export const acoes = {
  async sessao({ eu }) { return { logado: !!eu, usuario: eu ? { nome: eu.nome, usuario: eu.usuario, papel: eu.papel, cargo: eu.cargo } : null }; },

  // Tela inicial: quem está logado e os números do CRM
  async dados({ eu }) {
    const [crm, vendas] = await Promise.all([numerosCrm(), vendasDoMes()]);
    return { usuario: { nome: eu.nome, usuario: eu.usuario, papel: eu.papel, cargo: eu.cargo }, numeros: { crm, vendas } };
  },

  // Lista de colaboradores com as vendas de cada um no período
  async colaboradores({ corpo }) {
    const periodo = ['mes', '90', 'ano', 'tudo'].includes(corpo.periodo) ? corpo.periodo : 'mes';
    const desde = inicioPeriodo(periodo);
    const [pessoas, numeros] = await Promise.all([
      q("SELECT * FROM usuarios WHERE papel = 'colaborador' ORDER BY ativo DESC, lower(nome)"),
      q(`SELECT lower(COALESCE(NULLIF(responsavel, ''), '')) AS chave,
           COUNT(*) FILTER (WHERE etapa = 'venda' AND COALESCE(vendido_em, atualizado_em) >= $1)::int AS vendas,
           COALESCE(SUM(valor) FILTER (WHERE etapa = 'venda' AND COALESCE(vendido_em, atualizado_em) >= $1), 0)::float AS vendido,
           COUNT(*) FILTER (WHERE etapa = ANY($2))::int AS andamento,
           COUNT(*) FILTER (WHERE etapa = 'visita_agendada')::int AS visitas,
           COUNT(*) FILTER (WHERE criado_em >= $1)::int AS recebidos
         FROM leads GROUP BY 1`, [desde, ABERTAS])
    ]);
    const por = new Map(numeros.rows.map(r => [r.chave, r]));
    const vazio = { vendas: 0, vendido: 0, andamento: 0, visitas: 0, recebidos: 0 };
    const lista = pessoas.rows.map(u => { const n = por.get(u.nome.toLowerCase()) || vazio; return { ...publico(u), vendas: n.vendas, vendido: n.vendido, andamento: n.andamento, visitas: n.visitas, recebidos: n.recebidos }; });
    const sem = por.get('') || vazio; // vendas sem responsável no CRM
    const total = numeros.rows.reduce((t, r) => ({ vendas: t.vendas + r.vendas, vendido: t.vendido + r.vendido, andamento: t.andamento + r.andamento }), { vendas: 0, vendido: 0, andamento: 0 });
    return { periodo, colaboradores: lista, resumo: { ...total, sem_responsavel: { vendas: sem.vendas, vendido: sem.vendido } }, cargos: CARGOS };
  },

  // Ficha de um colaborador: dados e as últimas vendas
  async colaborador({ corpo }) {
    const id = idNum(corpo.id);
    const r = await q("SELECT * FROM usuarios WHERE id = $1 AND papel = 'colaborador'", [id]);
    if (!r.rows[0]) throw erro('Colaborador não encontrado. Recarregue a página.', 404);
    const vendas = await q(`SELECT id, nome, valor, empreendimento, COALESCE(vendido_em, atualizado_em) AS em FROM leads
      WHERE etapa = 'venda' AND lower(responsavel) = lower($1) ORDER BY em DESC LIMIT 10`, [r.rows[0].nome]);
    return { colaborador: publico(r.rows[0]), vendas: vendas.rows };
  },

  // Novo colaborador ou editar. O acesso (usuário e senha) é opcional: sem ele a pessoa só aparece no CRM.
  async colaborador_salvar({ corpo }) {
    const v = {
      nome: texto(corpo.nome, 80), cargo: CARGOS.includes(corpo.cargo) ? corpo.cargo : 'Corretor',
      telefone: texto(corpo.telefone, 40), email: texto(corpo.email, 120), creci: texto(corpo.creci, 30),
      ativo: corpo.ativo !== false, acesso: !!corpo.acesso
    };
    if (!v.nome) throw erro('Informe o nome do colaborador.');
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw erro('O e-mail não parece válido.');
    const usuario = texto(corpo.usuario, 40).toLowerCase();
    const senha = String(corpo.senha || '');
    if (v.acesso) {
      if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw erro('O usuário precisa ter de 3 a 40 letras, números, ponto, hífen ou sublinhado (sem espaço nem acento).');
      if (senha && senha.length < SENHA_MIN) throw erro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
    }
    const id = corpo.id ? idNum(corpo.id) : null;

    return transacao(async exec => {
      // nome e usuário não podem repetir (o nome é o que liga a pessoa aos leads do CRM)
      const nomeIgual = await exec('SELECT 1 FROM usuarios WHERE lower(nome) = lower($1) AND id <> $2', [v.nome, id || 0]);
      if (nomeIgual.rowCount) throw erro('Já existe alguém cadastrado com esse nome. Use o nome completo para diferenciar.');
      if (v.acesso) {
        const loginIgual = await exec('SELECT 1 FROM usuarios WHERE lower(usuario) = lower($1) AND id <> $2', [usuario, id || 0]);
        if (loginIgual.rowCount) throw erro('Esse usuário já está em uso. Escolha outro.');
      }

      if (!id) {
        if (v.acesso && !senha) throw erro('Crie uma senha para o acesso.');
        const r = await exec(`INSERT INTO usuarios (nome, cargo, telefone, email, creci, ativo, acesso, usuario, senha_hash, papel)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'colaborador') RETURNING id`,
        [v.nome, v.cargo, v.telefone, v.email, v.creci, v.ativo, v.acesso, v.acesso ? usuario : null, v.acesso ? hashSenha(senha) : null]);
        return { id: r.rows[0].id };
      }

      const antes = (await exec("SELECT nome, senha_hash, usuario FROM usuarios WHERE id = $1 AND papel = 'colaborador' FOR UPDATE", [id])).rows[0];
      if (!antes) throw erro('Colaborador não encontrado. Recarregue a página.', 404);
      if (v.acesso && !senha && !antes.senha_hash) throw erro('Crie uma senha para o acesso.');
      const hash = v.acesso && senha ? hashSenha(senha) : antes.senha_hash;
      await exec(`UPDATE usuarios SET nome = $1, cargo = $2, telefone = $3, email = $4, creci = $5, ativo = $6, acesso = $7,
        usuario = $8, senha_hash = $9, atualizado_em = now() WHERE id = $10`,
      [v.nome, v.cargo, v.telefone, v.email, v.creci, v.ativo, v.acesso, v.acesso ? usuario : antes.usuario, hash, id]);
      // trocou o nome: os leads dele no CRM acompanham
      if (antes.nome !== v.nome) await exec('UPDATE leads SET responsavel = $1 WHERE lower(responsavel) = lower($2)', [v.nome, antes.nome]);
      // sem acesso, desativado ou senha nova: quem estava logado com essa conta sai
      if (!v.acesso || !v.ativo || senha) await exec('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
      return { id };
    });
  },

  // Excluir de vez (cadastro feito por engano). Os leads continuam com o nome em Responsável.
  async colaborador_excluir({ corpo }) {
    const r = await q("DELETE FROM usuarios WHERE id = $1 AND papel = 'colaborador'", [idNum(corpo.id)]);
    if (!r.rowCount) throw erro('Colaborador não encontrado. Recarregue a página.', 404);
    return { ok: true };
  },

  // Trocar a própria senha (administrador ou colaborador)
  async senha_trocar({ corpo, eu, req }) {
    const atual = String(corpo.atual || ''), nova = String(corpo.nova || '');
    if (nova.length < SENHA_MIN) throw erro(`A senha nova precisa ter pelo menos ${SENHA_MIN} caracteres.`);
    const r = await q('SELECT senha_hash FROM usuarios WHERE id = $1', [eu.id]);
    if (!r.rows[0] || !confereHash(atual, r.rows[0].senha_hash)) throw erro('A senha atual não confere.');
    await q('UPDATE usuarios SET senha_hash = $1, atualizado_em = now() WHERE id = $2', [hashSenha(nova), eu.id]);
    await fecharSessoesDe(eu.id, req); // sai dos outros aparelhos, continua neste
    return { ok: true };
  }
};
