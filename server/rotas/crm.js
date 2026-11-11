// Ações do CRM (public_html/crm chama crm/api.php?acao=...): leads, etapas do funil, ficha, follow-ups,
// ajustes (empreendimentos e metas) e a agenda do Google (link iCal) no Dashboard.
// As telas calculam os números a partir de "dados"; aqui ficam as gravações e o histórico de cada lead.
// Os corretores (campo Responsável) são os colaboradores ativos cadastrados no hub (tabela usuarios).
// Cada ação recebe "eu": quem está logado (nome e papel). Os testes chamam sem "eu".
import { q, transacao, lerConfig, gravarConfig } from '../db.js';

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const idNum = (v, nome = 'Lead') => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw erro(nome + ' inválido.'); return n; };
const data = v => { const d = new Date(String(v || '')); if (isNaN(d)) throw erro('Data inválida.'); return d; };

// Etapas do funil (as mesmas de public_html/crm/nucleo.js)
export const ETAPAS = {
  novo: 'Novo', primeiro_contato: 'Primeiro contato', respondeu: 'Respondeu', nao_respondeu: 'Não respondeu',
  visita_agendada: 'Visita agendada', proposta: 'Proposta', venda: 'Venda', perdido: 'Perdido', sem_intencao: 'Sem intenção'
};
const TEMPERATURAS = { quente: 'Quente', morno: 'Morno', frio: 'Frio' };
const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' };
const AJUSTES_PADRAO = { empreendimentos: [], metas: { respondeu: 50, visita_agendada: 20, venda: 5 } };

// ---------- horário de Brasília (o servidor roda em UTC) ----------
export const FUSO = 'America/Sao_Paulo';
const formatos = new Map();
function partes(d, fuso = FUSO) {
  if (!formatos.has(fuso)) formatos.set(fuso, new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const p = Object.fromEntries(formatos.get(fuso).formatToParts(d).map(x => [x.type, x.value]));
  return { Y: +p.year, M: +p.month, D: +p.day, h: +p.hour, m: +p.minute, s: +p.second };
}
// Data e hora "de relógio" num fuso → instante (o dia pode passar do fim do mês: 32 vira o dia 1 seguinte)
export function instante(Y, M, D, h = 0, m = 0, s = 0, fuso = FUSO) {
  const chute = Date.UTC(Y, M - 1, D, h, m, s);
  const p = partes(new Date(chute), fuso);
  return new Date(chute - (Date.UTC(p.Y, p.M - 1, p.D, p.h, p.m, p.s) - chute));
}
// 00:00 de hoje em Brasília, mais n dias
export function inicioDoDia(n = 0, agora = new Date()) { const p = partes(agora); return instante(p.Y, p.M, p.D + n); }
const p2 = n => String(n).padStart(2, '0');
const diaHora = d => { const p = partes(d); return `${p2(p.D)}/${p2(p.M)} ${p2(p.h)}:${p2(p.m)}`; };
const dinheiro = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

// ---------- ajustes ----------
async function lerAjustes() {
  const a = await lerConfig('crm_ajustes', {}) || {};
  return { empreendimentos: Array.isArray(a.empreendimentos) ? a.empreendimentos : [], metas: { ...AJUSTES_PADRAO.metas, ...(a.metas || {}) } };
}
// Corretores e equipe ativos (aparecem em "Responsável")
async function lerResponsaveis() {
  const r = await q("SELECT nome FROM usuarios WHERE ativo AND papel = 'colaborador' ORDER BY lower(nome)");
  return r.rows.map(x => x.nome);
}
const autorDe = eu => (eu && eu.nome) || null;
const lista = (v, max) => [...new Set((Array.isArray(v) ? v : []).map(x => texto(x, max)).filter(Boolean))].slice(0, 60);

// ---------- linhas para a tela (sem campos vazios, para a lista ir mais leve) ----------
const CAMPOS_LEAD = 'id, nome, telefone, instagram, objetivo, tipologia, empreendimento, notas, etapa, origem, campanha, conjunto, criativo, valor, responsavel, prioridade, temperatura, nao_contatar, visita_em, vendido_em, criado_em, atualizado_em';
const enxuto = r => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== '' && v !== false));

async function historico(exec, lead, tipo, txt, autor = null) {
  await exec('INSERT INTO lead_historico (lead_id, tipo, texto, autor) VALUES ($1, $2, $3, $4)', [lead, tipo, txt, autor]);
}
async function existeLead(id) {
  const r = await q('SELECT etapa FROM leads WHERE id = $1', [id]);
  if (!r.rows[0]) throw erro('Lead não encontrado. Recarregue a página.', 404);
  return r.rows[0];
}

// Campos que a ficha do lead pode mudar um a um, com o que fica escrito no histórico
const CAMPOS = {
  valor: { ler: v => { const s = String(v ?? '').replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'); return s === '' ? null : Math.min(Number(s) || 0, 1e11); },
    hist: v => 'Valor: ' + (v === null ? 'removido' : dinheiro(v)) },
  responsavel: { ler: v => texto(v, 80), hist: v => 'Responsável: ' + (v || 'ninguém') },
  prioridade: { ler: v => Object.hasOwn(PRIORIDADES, v) ? v : 'normal', hist: v => 'Prioridade: ' + PRIORIDADES[v] },
  temperatura: { ler: v => Object.hasOwn(TEMPERATURAS, v) ? v : '', hist: v => 'Temperatura: ' + (TEMPERATURAS[v] || 'nenhuma') },
  nao_contatar: { ler: v => [true, 1, '1', 'true'].includes(v), hist: v => v ? 'Marcado como "não contatar"' : 'Liberado para contato' },
  visita_em: { ler: v => (v === '' || v == null) ? null : data(v), hist: v => v ? 'Visita marcada para ' + diaHora(v) : 'Visita desmarcada' },
  ficha: { ler: v => {
      let f = v;
      if (typeof f === 'string') { try { f = JSON.parse(f || '{}'); } catch (e) { throw erro('Ficha inválida.'); } }
      if (!f || typeof f !== 'object' || Array.isArray(f) || JSON.stringify(f).length > 20000) throw erro('Ficha inválida.');
      return JSON.stringify(f);
    }, hist: () => 'Ficha de qualificação preenchida' },
  notas: { ler: v => texto(v, 10000), hist: () => 'Observações editadas' },
  origem: { ler: v => texto(v, 40) }, campanha: { ler: v => texto(v, 190) }, conjunto: { ler: v => texto(v, 190) }, criativo: { ler: v => texto(v, 190) },
  empreendimento: { ler: v => texto(v, 120) }, tipologia: { ler: v => texto(v, 40) }, objetivo: { ler: v => texto(v, 40) }
};
const ROTULO = { origem: 'Origem', campanha: 'Campanha', conjunto: 'Conjunto', criativo: 'Criativo', empreendimento: 'Empreendimento', tipologia: 'Tipologia', objetivo: 'Objetivo' };

// ---------- agenda (Google Agenda pelo link iCal) ----------
const cacheAgenda = new Map(); // guarda uma cópia por 10 minutos para não buscar no Google a cada página aberta
const limpar = s => s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();

// Compromissos de hoje e dos próximos dias. Eventos repetidos (toda semana etc.) aparecem só na primeira data.
export function lerIcs(ics, { dias = 2, agora = new Date() } = {}) {
  ics = String(ics).replace(/\r?\n[ \t]/g, ''); // junta linhas quebradas
  const ini = inicioDoDia(0, agora), fim = inicioDoDia(dias, agora), amanha = inicioDoDia(1, agora);
  const eventos = [];
  for (const [, ev] of ics.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)) {
    const d = /^DTSTART([^:\r\n]*):(\d{8}(T\d{6}Z?)?)/m.exec(ev);
    if (/^STATUS:CANCELLED/m.test(ev) || !d) continue;
    const v = d[2], diaInteiro = v.length === 8;
    const [Y, M, D] = [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8)].map(Number);
    const [h, m, s] = diaInteiro ? [0, 0, 0] : [v.slice(9, 11), v.slice(11, 13), v.slice(13, 15)].map(Number);
    let t;
    if (diaInteiro) t = instante(Y, M, D);
    else if (v.endsWith('Z')) t = new Date(Date.UTC(Y, M - 1, D, h, m, s));
    else {
      const tz = /TZID=([^;:]+)/.exec(d[1]);
      try { t = instante(Y, M, D, h, m, s, tz ? tz[1].replace(/"/g, '') : FUSO); } catch (e) { t = instante(Y, M, D, h, m, s); } // fuso desconhecido: Brasília
    }
    if (t < ini || t >= fim) continue;
    const titulo = /^SUMMARY[^:]*:(.*)$/m.exec(ev), local = /^LOCATION[^:]*:(.*)$/m.exec(ev);
    const p = partes(t);
    eventos.push({ t: t.getTime(), hoje: t < amanha, hora: diaInteiro ? 'dia todo' : `${p2(p.h)}:${p2(p.m)}`, titulo: limpar(titulo ? titulo[1] : '') || 'Compromisso', local: limpar(local ? local[1] : '') });
  }
  return eventos.sort((a, b) => a.t - b.t).map(({ t, ...e }) => e);
}

async function buscarIcs(url) {
  const c = cacheAgenda.get(url);
  if (c && c.em > Date.now() - 600000) return c.ics;
  let ics = '';
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'follow' });
    if (r.ok) ics = await r.text();
  } catch (e) { /* sem resposta */ }
  if (!ics.includes('BEGIN:VCALENDAR')) return null;
  cacheAgenda.set(url, { em: Date.now(), ics });
  return ics;
}

// ---------- números do CRM para a tela inicial do Hub ADM ----------
export async function numerosCrm() {
  const [l, f] = await Promise.all([
    q(`SELECT COUNT(*) FILTER (WHERE etapa = 'novo')::int AS novos, COUNT(*) FILTER (WHERE etapa = 'respondeu')::int AS responderam FROM leads`),
    q('SELECT COUNT(*) FILTER (WHERE quando < $1)::int AS atrasados, COUNT(*) FILTER (WHERE quando >= $1 AND quando < $2)::int AS hoje FROM followups WHERE feito_em IS NULL', [inicioDoDia(0), inicioDoDia(1)])
  ]);
  return { ...l.rows[0], ...f.rows[0] };
}
// Vendas do mês (horário de Brasília) para a tela inicial do hub
export function inicioDoMes(agora = new Date()) { const p = partes(agora); return instante(p.Y, p.M, 1); }
export async function vendasDoMes() {
  const r = await q(`SELECT COUNT(*)::int AS vendas, COALESCE(SUM(valor), 0)::float AS total FROM leads
    WHERE etapa = 'venda' AND COALESCE(vendido_em, atualizado_em) >= $1`, [inicioDoMes()]);
  return r.rows[0];
}

export const publicas = new Set(['sessao', 'entrar']);
export const soAdmin = new Set(['ajustes_salvar']);
export const acoes = {
  async sessao({ eu }) { return { logado: !!eu, usuario: eu ? { nome: eu.nome, papel: eu.papel } : null }; },

  // Tudo o que as telas precisam: leads (sem a ficha), follow-ups em aberto e dos últimos 120 dias, ajustes
  async dados({ eu } = {}) {
    const [leads, fus, ajustes, ical, responsaveis] = await Promise.all([
      q(`SELECT ${CAMPOS_LEAD} FROM leads ORDER BY atualizado_em DESC, id DESC`),
      q(`SELECT id, lead_id, quando, canal, nota, feito_em, criado_em FROM followups
         WHERE feito_em IS NULL OR feito_em >= now() - interval '120 days' OR quando >= now() - interval '120 days' ORDER BY quando, id`),
      lerAjustes(), lerConfig('crm_agenda_ical', ''), lerResponsaveis()
    ]);
    return { leads: leads.rows.map(enxuto), followups: fus.rows.map(enxuto), ajustes: { ...ajustes, responsaveis, agenda: !!ical },
      usuario: eu ? { nome: eu.nome, papel: eu.papel } : null };
  },

  // Ficha do lead: dados completos, follow-ups e histórico
  async lead({ corpo }) {
    const id = idNum(corpo.id);
    const [l, f, h] = await Promise.all([
      q(`SELECT ${CAMPOS_LEAD}, ficha FROM leads WHERE id = $1`, [id]),
      q('SELECT id, quando, canal, nota, feito_em FROM followups WHERE lead_id = $1 ORDER BY feito_em IS NOT NULL, quando', [id]),
      q('SELECT tipo, texto, autor, criado_em FROM lead_historico WHERE lead_id = $1 ORDER BY criado_em DESC, id DESC LIMIT 200', [id])
    ]);
    if (!l.rows[0]) throw erro('Lead não encontrado.', 404);
    return { lead: l.rows[0], followups: f.rows, historico: h.rows };
  },

  // Novo lead ("+ Novo lead") ou editar os dados básicos
  async lead_salvar({ corpo, eu }) {
    const v = { nome: texto(corpo.nome, 190), telefone: texto(corpo.telefone, 40), instagram: texto(corpo.instagram, 80), objetivo: texto(corpo.objetivo, 40),
      tipologia: texto(corpo.tipologia, 40), empreendimento: texto(corpo.empreendimento, 120), notas: texto(corpo.notas, 10000) };
    if (!v.nome && !v.telefone) throw erro('Informe o nome ou o telefone do lead.');
    const cols = Object.keys(v), vals = Object.values(v);
    if (corpo.id) {
      const id = idNum(corpo.id);
      const r = await q(`UPDATE leads SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, atualizado_em = now() WHERE id = $${cols.length + 1}`, [...vals, id]);
      if (!r.rowCount) throw erro('Lead não encontrado. Recarregue a página.', 404);
      return { id };
    }
    // cadastrado à mão: origem "Cadastro manual" e etapa Novo; o corretor que cadastra já fica como responsável
    const resp = eu && eu.papel === 'colaborador' ? eu.nome : null;
    const r = await q(`INSERT INTO leads (${cols.join(', ')}, etapa, origem, responsavel) VALUES (${cols.map((c, i) => '$' + (i + 1)).join(', ')}, 'novo', 'Cadastro manual', $${cols.length + 1}) RETURNING id`, [...vals, resp]);
    return { id: r.rows[0].id };
  },
  async lead_excluir({ corpo }) { await q('DELETE FROM leads WHERE id = $1', [idNum(corpo.id)]); return { ok: true }; },

  // Mudar de etapa (arrastar no quadro, botões da ficha, mover em massa) e registrar no histórico
  async etapa({ corpo, eu }) {
    const id = idNum(corpo.id), etapa = String(corpo.etapa || '');
    if (!Object.hasOwn(ETAPAS, etapa)) throw erro('Etapa inválida.');
    return transacao(async exec => {
      const r = await exec('SELECT etapa FROM leads WHERE id = $1 FOR UPDATE', [id]);
      if (!r.rows[0]) throw erro('Lead não encontrado. Recarregue a página.', 404);
      const de = r.rows[0].etapa;
      if (de === etapa) return { ok: true };
      // virou venda: guarda quando (vendas por corretor no período); saiu de venda: apaga
      await exec(`UPDATE leads SET etapa = $1, atualizado_em = now(), vendido_em = CASE WHEN $1 = 'venda' THEN now() ELSE NULL END WHERE id = $2`, [etapa, id]);
      await historico(exec, id, 'etapa', `${ETAPAS[de] || de} → ${ETAPAS[etapa]}`, autorDe(eu));
      return { ok: true };
    });
  },

  async lead_campo({ corpo, eu }) {
    const id = idNum(corpo.id), campo = String(corpo.campo || '');
    if (!Object.hasOwn(CAMPOS, campo)) throw erro('Campo que não pode ser mudado por aqui.');
    const c = CAMPOS[campo], v = c.ler(corpo.valor);
    return transacao(async exec => {
      const r = await exec(`UPDATE leads SET ${campo} = $1, atualizado_em = now() WHERE id = $2`, [v, id]);
      if (!r.rowCount) throw erro('Lead não encontrado. Recarregue a página.', 404);
      await historico(exec, id, 'sistema', c.hist ? c.hist(v) : `${ROTULO[campo]}: ${v}`, autorDe(eu));
      return { ok: true };
    });
  },

  // Mensagem enviada pelo WhatsApp ou anotação
  async historico({ corpo, eu }) {
    const id = idNum(corpo.id), txt = texto(corpo.texto, 4000);
    if (!txt) throw erro('Escreva o texto.');
    await existeLead(id);
    await historico(q, id, ['msg', 'nota'].includes(corpo.tipo) ? corpo.tipo : 'nota', txt, autorDe(eu));
    return { ok: true };
  },

  // ---------- follow-ups (as datas chegam prontas da tela, no horário de quem usa) ----------
  async fu_salvar({ corpo }) {
    const quando = data(corpo.quando), canal = texto(corpo.canal, 30), nota = texto(corpo.nota, 2000);
    if (corpo.id) {
      const r = await q('UPDATE followups SET quando = $1, canal = $2, nota = $3 WHERE id = $4', [quando, canal, nota, idNum(corpo.id, 'Follow-up')]);
      if (!r.rowCount) throw erro('Follow-up não encontrado. Recarregue a página.', 404);
      return { ok: true };
    }
    const lead = idNum(corpo.lead_id);
    await existeLead(lead);
    const r = await q('INSERT INTO followups (lead_id, quando, canal, nota) VALUES ($1, $2, $3, $4) RETURNING id', [lead, quando, canal, nota]);
    return { id: r.rows[0].id };
  },
  async fu_concluir({ corpo }) {
    const id = idNum(corpo.id, 'Follow-up'), proximo = corpo.proximo ? data(corpo.proximo) : null;
    return transacao(async exec => {
      const r = await exec('UPDATE followups SET feito_em = now() WHERE id = $1 AND feito_em IS NULL RETURNING lead_id, canal', [id]);
      // já marcar o próximo contato com o mesmo lead
      if (r.rows[0] && proximo) await exec('INSERT INTO followups (lead_id, quando, canal, nota) VALUES ($1, $2, $3, $4)', [r.rows[0].lead_id, proximo, r.rows[0].canal, 'Próximo contato']);
      return { ok: true };
    });
  },
  async fu_adiar({ corpo }) {
    await q('UPDATE followups SET quando = $1 WHERE id = $2 AND feito_em IS NULL', [data(corpo.quando), idNum(corpo.id, 'Follow-up')]);
    return { ok: true };
  },
  async fu_excluir({ corpo }) { await q('DELETE FROM followups WHERE id = $1', [idNum(corpo.id, 'Follow-up')]); return { ok: true }; },

  // ---------- ajustes: empreendimentos, metas e agenda (só o administrador) ----------
  async ajustes_salvar({ corpo }) {
    const metas = {};
    for (const k of Object.keys(AJUSTES_PADRAO.metas)) {
      const n = Math.round(Number(corpo.metas && corpo.metas[k]));
      if (!(n >= 0 && n <= 100)) throw erro('As metas são porcentagens de 0 a 100.');
      metas[k] = n;
    }
    await gravarConfig('crm_ajustes', { empreendimentos: lista(corpo.empreendimentos, 120), metas });
    if (corpo.agenda_remover) await gravarConfig('crm_agenda_ical', '');
    else if (corpo.agenda_ical) {
      const url = String(corpo.agenda_ical).trim().replace(/^webcal:\/\//i, 'https://');
      if (!/^https:\/\/\S+$/i.test(url) || url.length > 1000) throw erro('Cole o endereço iCal completo, começando com https://');
      await gravarConfig('crm_agenda_ical', url);
    }
    cacheAgenda.clear();
    return { ok: true };
  },
  async agenda() {
    const url = await lerConfig('crm_agenda_ical', '');
    if (!url) return { configurada: false };
    const ics = await buscarIcs(url);
    return ics ? { configurada: true, eventos: lerIcs(ics).slice(0, 6) } : { configurada: true, erro: true };
  }
};
