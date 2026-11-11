// Leads: todos os leads em tabela, com filtros, ordem, seleção em massa e exportar planilha (CSV que abre no Excel)
const g = k => (new URLSearchParams(location.search).get(k) || '').trim();
const FILTROS = { origem: 'Origem', campanha: 'Campanha', conjunto: 'Conjunto', criativo: 'Criativo', etapa: 'Etapa', responsavel: 'Responsável' };
let filtrados = []; // todos os leads com os filtros da tela (a tabela mostra os 1000 primeiros)

registrarTela('leads', { titulo: 'Leads', desenhar(main) {
  const PERIODOS = [['', 'Período'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias']];
  const ORDENS = { nome: 'nome', entrada: 'criado_em', atividade: 'atualizado_em' };
  const semOrigem = g('aba') === 'sem_origem', todos = g('todos') === '1';
  const ordem = ORDENS[g('ordem')] ? g('ordem') : 'entrada', dir = g('dir') === 'asc' ? 'asc' : 'desc';

  // Monta o filtro a partir da URL
  const busca = g('q').toLowerCase(), fora = [...GANHOS, ...PERDIDOS];
  const dias = PERIODOS.some(([v]) => v && v === g('dias')) ? Number(g('dias')) : 0, desde = dias ? meiaNoite(-(dias - 1)) : null;
  const ids = g('ids') ? new Set(g('ids').split(',').map(Number).filter(Boolean)) : null;
  filtrados = CRM.leads.filter(l => (!busca || [l.nome, l.telefone].some(v => String(v || '').toLowerCase().includes(busca))) &&
    Object.keys(FILTROS).every(col => !g(col) || String(l[col] ?? '') === g(col)) &&
    (!semOrigem || !l.origem) && (todos || !fora.includes(l.etapa)) && (!desde || l.criado_em >= desde) && (!ids || ids.has(l.id)));
  const col = ORDENS[ordem], sinal = dir === 'asc' ? 1 : -1;
  filtrados.sort((a, b) => sinal * (col === 'nome' ? String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR') : a[col] - b[col]));
  const leads = filtrados.slice(0, 1000), total = filtrados.length;
  const nSemOrigem = CRM.leads.filter(l => !l.origem).length;

  // Links mantendo os filtros
  const atuais = Object.fromEntries([...new URLSearchParams(location.search)].filter(([k, v]) => v !== '' && !['exportar', 'ids', 'lead'].includes(k)));
  const link = mudar => '?' + new URLSearchParams(Object.entries({ ...atuais, ...mudar }).filter(([, v]) => v !== '' && v != null)).toString();
  const ordenar = k => link({ ordem: k, dir: ordem === k && dir === 'desc' ? 'asc' : 'desc' });
  const seta = k => ordem === k ? (dir === 'desc' ? ' ↓' : ' ↑') : ' ↕';
  const valoresFiltro = c => c === 'etapa' ? Object.entries(ETAPAS) : (c === 'origem' ? [...new Set([...ORIGENS, ...valoresDe('origem')])] : valoresDe(c)).map(v => [v, v]);
  const algumFiltro = [...Object.keys(FILTROS), 'q', 'dias'].some(k => g(k));

  main.innerHTML = `
<header class="pg-topo">
  <div>
    <p class="eyebrow">Todos os contatos</p>
    <h1>Leads</h1>
    <p class="sub">Os que chegaram sozinhos pelas campanhas e os que vocês cadastraram.</p>
  </div>
  <div class="ferramentas">
    <button class="btn-claro" type="button" id="exportar">${ico('download')}Exportar planilha</button>
    <button class="btn" type="button" onclick="abrirNovo()">${ico('mais1')}Novo lead</button>
  </div>
</header>

<nav class="seg abas-leads">
  <a href="${esc(link({ aba: '' }))}" class="${semOrigem ? '' : 'on'}">Leads</a>
  <a href="${esc(link({ aba: 'sem_origem' }))}" class="${semOrigem ? 'on' : ''}">Sem origem <b class="badge-azul">${nSemOrigem}</b></a>
</nav>

<form class="leads-filtros" method="get">
  ${semOrigem ? '<input type="hidden" name="aba" value="sem_origem">' : ''}
  <input type="hidden" name="ordem" value="${esc(ordem)}"><input type="hidden" name="dir" value="${esc(dir)}">
  <label class="busca larga">${ico('busca')}<input name="q" value="${esc(g('q'))}" placeholder="Nome ou telefone" data-busca-viva></label>
  <div class="pilulas">
    ${Object.entries(FILTROS).map(([c, rotulo]) => `<select name="${c}" class="pilula${g(c) ? ' on' : ''}" onchange="enviarFiltro(this.form)">
      <option value="">${rotulo}</option>${valoresFiltro(c).map(([v, t]) => `<option value="${esc(v)}"${String(v) === g(c) ? ' selected' : ''}>${esc(t)}</option>`).join('')}
    </select>`).join('')}
    <select name="dias" class="pilula${g('dias') ? ' on' : ''}" onchange="enviarFiltro(this.form)">${PERIODOS.map(([v, t]) => `<option value="${v}"${v === g('dias') ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <label class="chave"><input type="checkbox" name="todos" value="1"${todos ? ' checked' : ''} onchange="enviarFiltro(this.form)"><i></i>Incluir ganhos e perdidos</label>
  </div>
</form>

<div class="leads-info">
  <b>${plural(total, 'lead', 'leads')}</b>
  ${algumFiltro ? `<a href="?${semOrigem ? 'aba=sem_origem' : ''}">Limpar filtros</a>` : ''}
  <div class="massa" id="massa" hidden>
    <span id="massa-n"></span>
    <select id="massa-etapa"><option value="">Mover para…</option>${Object.entries(ETAPAS).map(([k, nome]) => `<option value="${k}">${esc(nome)}</option>`).join('')}</select>
    <button class="btn-claro" type="button" id="massa-exportar">${ico('download')}Exportar selecionados</button>
  </div>
</div>

<div class="card tabela-card">
  <table class="tabela">
    <thead><tr>
      <th class="ck"><input type="checkbox" id="todos" aria-label="Selecionar todos"></th>
      <th><a href="${esc(ordenar('nome'))}">Nome${seta('nome')}</a></th>
      <th>Telefone</th><th>Origem</th><th>Campanha</th><th>Etapa</th><th>Responsável</th>
      <th><a href="${esc(ordenar('entrada'))}">Entrada${seta('entrada')}</a></th>
      <th><a href="${esc(ordenar('atividade'))}">Última atividade${seta('atividade')}</a></th>
      <th></th>
    </tr></thead>
    <tbody>
    ${leads.map(l => { const o = l.origem || ''; return `<tr data-abrir-lead="${l.id}" data-id="${l.id}" data-etapa="${esc(l.etapa)}">
        <td class="ck"><input type="checkbox" class="sel" value="${l.id}" aria-label="Selecionar"></td>
        <td class="t-nome">${esc(l.nome || 'Sem nome')}</td>
        <td class="t-tel">${esc(l.telefone)}</td>
        <td class="t-origem">${o ? ico(ICO_ORIGEM[o] || 'form') + esc(o) : '<span class="cinza">—</span>'}</td>
        <td class="t-camp">${l.campanha ? `<b>${esc(l.campanha)}</b><small>${esc(l.conjunto)}</small><small>${esc(l.criativo)}</small>` : `<span class="cinza">${esc(l.empreendimento || '—')}</span>`}</td>
        <td><span class="chip etapa" style="--c:${cor(l.etapa)}">${esc(nomeEtapa(l.etapa))}</span></td>
        <td class="cinza">${esc(l.responsavel || 'Sem responsável')}</td>
        <td class="t-data">${dmy(l.criado_em)}<small>${hm(l.criado_em)}</small></td>
        <td class="t-data">${dmy(l.atualizado_em)}<small>${hm(l.atualizado_em)}</small></td>
        <td class="t-mais"><button type="button" class="mais-btn" title="Abrir ficha" data-ficha="${l.id}">${ico('mais')}</button></td>
      </tr>`; }).join('')}
    ${leads.length ? '' : '<tr><td colspan="10" class="vazio-t">Nenhum lead com esses filtros.</td></tr>'}
    </tbody>
  </table>
  ${total > leads.length ? `<p class="rodape-card">Mostrando os ${leads.length} primeiros. Use os filtros ou exporte a planilha para ver todos.</p>` : ''}
</div>`;

  // Seleção em massa: mover de etapa ou exportar só os marcados
  const sels = $$('.sel'), massa = $('#massa');
  const marcados = () => sels.filter(s => s.checked).map(s => Number(s.value));
  const atualizar = () => {
    const n = marcados().length;
    massa.hidden = !n;
    $('#massa-n').textContent = n + ' selecionado' + (n > 1 ? 's' : '');
  };
  sels.forEach(s => s.addEventListener('change', atualizar));
  $('#todos').addEventListener('change', e => { sels.forEach(s => s.checked = e.target.checked); atualizar(); });
  $('#massa-etapa').addEventListener('change', async e => {
    const etapa = e.target.value, lista = marcados();
    if (!etapa || !confirm(`Mover ${lista.length} lead(s) para "${e.target.selectedOptions[0].text}"?`)) { e.target.value = ''; return; }
    try {
      for (const id of lista) { const de = CRM.porId.get(id)?.etapa; if (de !== etapa) await mudarEtapa(id, etapa, de, { perguntar: false }); }
    } catch (x) { /* o erro já apareceu na tela */ }
    sels.forEach(s => { s.checked = false; });
    await atualizar();
  });
  $('#exportar').addEventListener('click', () => exportar(filtrados));
  $('#massa-exportar').addEventListener('click', () => { const s = new Set(marcados()); exportar(filtrados.filter(l => s.has(l.id))); });
  $$('[data-ficha]').forEach(b => b.addEventListener('click', () => abrirLead(b.dataset.ficha)));
} });

// ---------- Exportar planilha (CSV com ; e acentos certos no Excel) ----------
function exportar(lista) {
  const cols = { nome: 'Nome', telefone: 'Telefone', instagram: 'Instagram', origem: 'Origem', campanha: 'Campanha', conjunto: 'Conjunto', criativo: 'Criativo',
    empreendimento: 'Empreendimento', objetivo: 'Objetivo', tipologia: 'Tipologia', etapa: 'Etapa', responsavel: 'Responsável', valor: 'Valor',
    criado_em: 'Entrada', atualizado_em: 'Última atividade', notas: 'Observações' };
  const valor = (l, c) => c === 'etapa' ? nomeEtapa(l.etapa) : c === 'valor' ? (l.valor != null ? String(l.valor).replace('.', ',') : '')
    : (c === 'criado_em' || c === 'atualizado_em') ? dmy(l[c]) + ' ' + hm(l[c]) : (l[c] ?? '');
  // aspas quando precisa; texto que começa com = + - @ vira texto (o Excel não roda como fórmula)
  const celula = v => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const linhas = [Object.values(cols), ...lista.map(l => Object.keys(cols).map(c => valor(l, c)))].map(r => r.map(celula).join(';'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'leads-' + diaLocal(new Date()) + '.csv';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
