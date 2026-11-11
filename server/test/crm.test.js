// CRM: horário de Brasília, leitura da agenda (iCal) e, com TESTE_DATABASE_URL definida, as ações no banco.
// Os do banco: TESTE_DATABASE_URL=postgres://... npm test   (um banco vazio só para teste: as tabelas do CRM são limpas)
// Nunca usa a DATABASE_URL, que no Railway é o banco de verdade.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TESTE_DATABASE_URL || '';
const { instante, inicioDoDia, lerIcs, acoes, numerosCrm, vendasDoMes } = await import('../rotas/crm.js');
const { migrar, pool, q } = await import('../db.js');

test('horário de Brasília: meia-noite local é 03:00 UTC e o dia 32 vira o dia 1 seguinte', () => {
  assert.equal(instante(2026, 10, 24, 0, 0).toISOString(), '2026-10-24T03:00:00.000Z');
  assert.equal(instante(2026, 1, 32, 10).toISOString(), '2026-02-01T13:00:00.000Z');
  // 23:30 de Brasília ainda é "hoje" lá, mesmo já sendo amanhã em UTC
  assert.equal(inicioDoDia(0, new Date('2026-10-25T02:30:00Z')).toISOString(), '2026-10-24T03:00:00.000Z');
});

test('agenda: hoje e amanhã, com fuso, dia inteiro, cancelado e texto escapado', () => {
  const agora = new Date('2026-10-24T12:00:00Z'); // 09:00 em Brasília
  const ics = ['BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'DTSTART:20261024T170000Z', 'SUMMARY:Visita\\, apartamento 302', 'LOCATION:Rua A\\, 10', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;TZID=America/Sao_Paulo:20261025T093000', 'SUMMARY:Reunião com a constru', ' tora', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261024', 'SUMMARY:Plantão', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART:20261024T150000Z', 'STATUS:CANCELLED', 'SUMMARY:Cancelado', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART:20261027T150000Z', 'SUMMARY:Daqui a três dias', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART;TZID=Fuso Inventado:20261024T200000', 'SUMMARY:Fuso desconhecido', 'END:VEVENT',
    'END:VCALENDAR'].join('\r\n');
  assert.deepEqual(lerIcs(ics, { agora }), [
    { hoje: true, hora: 'dia todo', titulo: 'Plantão', local: '' },
    { hoje: true, hora: '14:00', titulo: 'Visita, apartamento 302', local: 'Rua A, 10' },
    { hoje: true, hora: '20:00', titulo: 'Fuso desconhecido', local: '' },
    { hoje: false, hora: '09:30', titulo: 'Reunião com a construtora', local: '' }
  ]);
});

// ---------- no banco ----------
const semBanco = !process.env.TESTE_DATABASE_URL;
after(() => pool && pool.end());

test('lead: criar, mudar de etapa, campos com histórico e excluir', { skip: semBanco }, async () => {
  await migrar();
  await q('TRUNCATE leads RESTART IDENTITY CASCADE');
  await q("DELETE FROM config WHERE chave LIKE 'crm_%'");
  await assert.rejects(acoes.lead_salvar({ corpo: {} }), /nome ou o telefone/);
  const { id } = await acoes.lead_salvar({ corpo: { nome: 'Ana Souza', telefone: '(34) 99999-0000', empreendimento: 'Empreendimento A' } });
  let d = await acoes.dados();
  assert.equal(d.leads.length, 1);
  assert.equal(d.leads[0].origem, 'Cadastro manual');
  assert.equal(d.leads[0].etapa, 'novo');
  assert.equal(d.leads[0].nao_contatar, undefined); // campos vazios não vão para a tela
  assert.deepEqual(d.ajustes.metas, { respondeu: 50, visita_agendada: 20, venda: 5 });

  await acoes.etapa({ corpo: { id, etapa: 'respondeu' } });
  await acoes.etapa({ corpo: { id, etapa: 'respondeu' } }); // mesma etapa: não repete no histórico
  await assert.rejects(acoes.etapa({ corpo: { id, etapa: 'inventada' } }), /Etapa inválida/);
  await acoes.lead_campo({ corpo: { id, campo: 'valor', valor: '350.000' } });
  await acoes.lead_campo({ corpo: { id, campo: 'nao_contatar', valor: 1 } });
  await acoes.lead_campo({ corpo: { id, campo: 'ficha', valor: JSON.stringify({ finalidade: 'Morar', tipos: ['Casa'] }) } });
  await acoes.lead_campo({ corpo: { id, campo: 'visita_em', valor: '2026-10-25T13:00:00.000Z' } });
  await assert.rejects(acoes.lead_campo({ corpo: { id, campo: 'etapa', valor: 'venda' } }), /não pode ser mudado/);
  await acoes.historico({ corpo: { id, tipo: 'msg', texto: 'Oi Ana!' } });

  const f = await acoes.lead({ corpo: { id } });
  assert.equal(f.lead.valor, 350000);
  assert.equal(f.lead.nao_contatar, true);
  assert.deepEqual(f.lead.ficha, { finalidade: 'Morar', tipos: ['Casa'] });
  assert.deepEqual(f.historico.map(h => h.texto), ['Oi Ana!', 'Visita marcada para 25/10 10:00', 'Ficha de qualificação preenchida', 'Marcado como "não contatar"', 'Valor: R$ 350.000', 'Novo → Respondeu']);

  await acoes.lead_excluir({ corpo: { id } });
  d = await acoes.dados();
  assert.equal(d.leads.length, 0);
  assert.equal((await q('SELECT count(*)::int AS n FROM lead_historico')).rows[0].n, 0);
});

test('follow-ups: agendar, concluir marcando o próximo, adiar e contar para o Hub ADM', { skip: semBanco }, async () => {
  await migrar();
  await q('TRUNCATE leads RESTART IDENTITY CASCADE');
  const { id: lead } = await acoes.lead_salvar({ corpo: { nome: 'Bruno' } });
  await assert.rejects(acoes.fu_salvar({ corpo: { lead_id: 999, quando: new Date().toISOString() } }), /não encontrado/);
  const ontem = new Date(Date.now() - 86400000).toISOString();
  const { id } = await acoes.fu_salvar({ corpo: { lead_id: lead, quando: ontem, canal: 'WhatsApp', nota: 'Retomar' } });
  let n = await numerosCrm();
  assert.equal(n.atrasados, 1);
  assert.equal(n.novos, 1);

  const amanha = new Date(Date.now() + 86400000).toISOString();
  await acoes.fu_concluir({ corpo: { id, proximo: amanha } });
  await acoes.fu_concluir({ corpo: { id, proximo: amanha } }); // de novo: não cria outro
  const { followups } = await acoes.dados();
  assert.equal(followups.length, 2);
  const prox = followups.find(f => !f.feito_em);
  assert.equal(prox.nota, 'Próximo contato');
  assert.equal(prox.canal, 'WhatsApp');

  const depois = new Date(Date.now() + 2 * 86400000);
  await acoes.fu_adiar({ corpo: { id: prox.id, quando: depois.toISOString() } });
  assert.equal((await acoes.lead({ corpo: { id: lead } })).followups.find(f => f.id === prox.id).quando.getTime(), depois.getTime());
  n = await numerosCrm();
  assert.equal(n.atrasados, 0);
});

test('ajustes: listas sem repetir, metas de 0 a 100 e o link da agenda nunca volta para a tela', { skip: semBanco }, async () => {
  await migrar();
  await q("DELETE FROM usuarios WHERE papel = 'colaborador'");
  await assert.rejects(acoes.ajustes_salvar({ corpo: { metas: { respondeu: 150, visita_agendada: 20, venda: 5 } } }), /0 a 100/);
  await assert.rejects(acoes.ajustes_salvar({ corpo: { metas: { respondeu: 50, visita_agendada: 20, venda: 5 }, agenda_ical: 'http://inseguro' } }), /https/);
  await acoes.ajustes_salvar({ corpo: { empreendimentos: ['Torre Sul', ' Torre Sul ', '', 'Vila Norte'], responsaveis: ['Bárbara'], metas: { respondeu: 40, visita_agendada: 15, venda: 3 }, agenda_ical: 'webcal://calendar.google.com/x/basic.ics' } });
  const { ajustes } = await acoes.dados();
  // os corretores (responsáveis) vêm dos colaboradores do hub, não dos ajustes
  assert.deepEqual(ajustes, { empreendimentos: ['Torre Sul', 'Vila Norte'], responsaveis: [], metas: { respondeu: 40, visita_agendada: 15, venda: 3 }, agenda: true });
  assert.equal(JSON.stringify(ajustes).includes('calendar.google'), false);
  await acoes.ajustes_salvar({ corpo: { ...ajustes, agenda_remover: true } });
  assert.equal((await acoes.dados()).ajustes.agenda, false);
  assert.deepEqual(await acoes.agenda(), { configurada: false });
});

test('venda: guarda quando virou venda, apaga ao sair, conta no mês e registra quem fez', { skip: semBanco }, async () => {
  await migrar();
  await q('TRUNCATE leads RESTART IDENTITY CASCADE');
  const eu = { nome: 'Ana Paula', papel: 'colaborador' };
  const { id } = await acoes.lead_salvar({ corpo: { nome: 'Carla' }, eu });
  assert.equal((await acoes.lead({ corpo: { id } })).lead.responsavel, 'Ana Paula'); // quem cadastra já fica como responsável
  await acoes.lead_campo({ corpo: { id, campo: 'valor', valor: '420.000' }, eu });
  await acoes.etapa({ corpo: { id, etapa: 'venda' }, eu });
  let f = await acoes.lead({ corpo: { id } });
  assert.ok(f.lead.vendido_em instanceof Date);
  assert.equal(f.historico[0].autor, 'Ana Paula');
  assert.deepEqual(await vendasDoMes(), { vendas: 1, total: 420000 });
  await acoes.etapa({ corpo: { id, etapa: 'proposta' } });
  f = await acoes.lead({ corpo: { id } });
  assert.equal(f.lead.vendido_em, null);
  assert.deepEqual(await vendasDoMes(), { vendas: 0, total: 0 });
});
