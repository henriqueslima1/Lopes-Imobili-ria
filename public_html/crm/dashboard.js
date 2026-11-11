// Dashboard: o período em 4 números (com a comparação), o funil com as metas, o que está esperando você,
// os leads por dia, de onde vêm (origem e campanha, com quanto vira visita e venda) e o que procuram.
// Cores dos gráficos: funil = rampa do roxo (ordem das etapas, --f1..--f6); demais barras = uma cor só (--serie).
const CAM = ['novo', 'primeiro_contato', 'respondeu', 'visita_agendada', 'proposta', 'venda'];
// Quem está numa etapa de saída conta até onde certamente chegou antes de sair
const SAIDA = { nao_respondeu: 'primeiro_contato', perdido: 'primeiro_contato', sem_intencao: 'respondeu' };
const alcance = l => Math.max(0, CAM.indexOf(SAIDA[l.etapa] || l.etapa));
const VISITA = CAM.indexOf('visita_agendada');
let abaProcura = 'emp';

function funil(lista) {
  const chegou = Object.fromEntries(CAM.map(k => [k, 0])), saiu = Object.fromEntries(Object.keys(SAIDA).map(k => [k, 0]));
  for (const l of lista) {
    if (l.etapa in saiu) saiu[l.etapa]++;
    for (let i = 0; i <= alcance(l); i++) chegou[CAM[i]]++;
  }
  return { chegou, saiu };
}
const pct = (n, de) => de ? Math.round(n * 100 / de) : 0;
const moedaCurta = v => v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  : v >= 1e3 ? 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil' : dinheiro(v);
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Variação: seta + número; verde quando sobe, vermelho quando desce (sempre com a seta, nunca só a cor)
function delta(v, sufixo, rotulo) {
  if (v === null) return '<small class="delta-rot">primeiro período com dados</small>';
  const tipo = v > 0 ? 'sobe' : v < 0 ? 'desce' : 'igual';
  return `<span class="delta ${tipo}">${tipo === 'sobe' ? '▲' : tipo === 'desce' ? '▼' : '='} ${Math.abs(v)}${sufixo}</span><small class="delta-rot">${esc(rotulo)}</small>`;
}
// Escala do eixo: 0 até um número redondo, com 2 a 4 marcas inteiras
function escala(max) {
  const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(p => max / p <= 4) || Math.ceil(max / 4);
  const topo = Math.max(passo * Math.ceil(max / passo), passo * 2);
  return { topo, marcas: Array.from({ length: topo / passo + 1 }, (_, i) => i * passo) };
}
// Agrupa leads por um campo, com quantos chegaram à visita e à venda
function agrupar(lista, chave) {
  const g = new Map();
  for (const l of lista) {
    const k = chave(l), x = g.get(k) || { nome: k, n: 0, visita: 0, venda: 0 };
    x.n++; if (alcance(l) >= VISITA) x.visita++; if (l.etapa === 'venda') x.venda++;
    g.set(k, x);
  }
  return [...g.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
}
// Linhas "nome · barra · visita · vendas" (cada linha abre a lista de leads já filtrada)
function linhasConversao(grupos, link) {
  const max = Math.max(1, ...grupos.map(x => x.n));
  return `<div class="tb">
    <div class="tb-cab"><span></span><span>Leads</span><span>Visita</span><span>Vendas</span></div>
    ${grupos.map(x => { const href = link(x); return `<${href ? `a href="${esc(href)}"` : 'div'} class="tb-linha" data-dica="${esc(plural(x.n, 'lead', 'leads'))}|${esc(x.nome)}: ${x.visita} na visita (${pct(x.visita, x.n)}%), ${plural(x.venda, 'venda', 'vendas')}">
      <span class="tb-nome">${esc(x.nome)}</span>
      <span class="tb-barra"><i style="width:${Math.max(4, x.n * 100 / max)}%"></i><b>${x.n}</b></span>
      <span class="tb-num">${pct(x.visita, x.n)}%</span>
      <span class="tb-num${x.venda ? ' forte' : ''}">${x.venda}</span>
    </${href ? 'a' : 'div'}>`; }).join('')}
  </div>`;
}

registrarTela('dashboard', { titulo: 'Dashboard', desenhar(main) {
  const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']];
  const { dias, emp, url } = filtros(PERIODOS, 30);
  const ini = meiaNoite(-(dias - 1)), iniAnt = meiaNoite(-(2 * dias - 1));
  const doEmp = l => !emp || l.empreendimento === emp;
  const METAS = CRM.ajustes.metas || {};

  // ---------- leads que entraram no período e no período anterior (para comparar) ----------
  const atual = [], antes = [];
  for (const l of CRM.leads) if (doEmp(l) && l.criado_em >= iniAnt) (l.criado_em >= ini ? atual : antes).push(l);
  const total = atual.length, fa = funil(atual), fb = funil(antes), ch = fa.chegou;
  const crescimento = antes.length ? Math.round((total - antes.length) * 100 / antes.length) : null;
  const taxaVisita = pct(ch.visita_agendada, total), taxaVisitaAntes = antes.length ? pct(fb.chegou.visita_agendada, antes.length) : null;
  const vendido = atual.filter(l => l.etapa === 'venda').reduce((s, l) => s + (Number(l.valor) || 0), 0);

  // ---------- o que está esperando você agora (independe do período) ----------
  const agora = {};
  for (const l of CRM.leads) if (doEmp(l)) {
    const a = agora[l.etapa] || (agora[l.etapa] = { n: 0, antigo: null, valor: 0 });
    a.n++; a.valor += Number(l.valor) || 0;
    if (!a.antigo || l.atualizado_em < a.antigo) a.antigo = l.atualizado_em;
  }
  const n = k => agora[k]?.n || 0, antigo = k => agora[k]?.antigo || null;
  const negociando = n('visita_agendada') + n('proposta'), valorNegociando = (agora.visita_agendada?.valor || 0) + (agora.proposta?.valor || 0);
  const tres = Date.now() - 3 * 86400000;
  const parados = CRM.leads.filter(l => doEmp(l) && ['novo', 'primeiro_contato', 'respondeu', 'visita_agendada', 'proposta'].includes(l.etapa) && l.atualizado_em < tres).length;
  const fu = fuContagem();
  const novoVelho = antigo('novo') && antigo('novo') < Date.now() - 86400000;
  // [número, título, status, explicação, link, botão, ícone]
  const acoes = [
    [n('respondeu'), 'Responderam e esperam você', n('respondeu') ? 'urgente' : 'emdia',
      n('respondeu') ? 'o mais antigo espera há ' + tempoDesde(antigo('respondeu')) : 'ninguém esperando resposta', 'quadro.html#col-respondeu', 'Responder', 'whats'],
    [n('visita_agendada'), 'Visitas para confirmar', n('visita_agendada') ? 'atencao' : 'emdia',
      n('visita_agendada') ? 'confirme dia e horário com cada lead' : 'nenhuma visita marcada', 'quadro.html#col-visita_agendada', 'Ver visitas', 'calendario'],
    [n('novo'), 'Sem primeiro contato', n('novo') ? (novoVelho ? 'urgente' : 'atencao') : 'emdia',
      n('novo') ? 'o mais antigo chegou há ' + tempoDesde(antigo('novo')) : 'todos já foram chamados', 'quadro.html#col-novo', 'Chamar', 'pessoas'],
    [fu.atrasados + fu.hoje, 'Follow-ups para hoje', fu.atrasados ? 'atencao' : 'emdia',
      fu.atrasados ? plural(fu.atrasados, 'atrasado', 'atrasados') + (fu.hoje ? ' e ' + fu.hoje + ' para hoje' : '') : fu.hoje ? 'nenhum atrasado' : 'nada marcado para hoje', 'followups.html', 'Ver follow-ups', 'tarefa'],
    [parados, 'Parados', parados ? 'atencao' : 'emdia',
      parados ? 'sem atividade há mais de 3 dias' : 'nenhum sem atividade há 3 dias', 'quadro.html', 'Ver no CRM', 'relogio']
  ];

  // ---------- leads por dia (por semana em 90 dias) ----------
  const semanal = dias > 31, baldes = [];
  if (!semanal) for (let i = dias - 1; i >= 0; i--) { const d = meiaNoite(-i); baldes.push({ d, n: 0, dica: `${DIAS_SEM[d.getDay()]}, ${dm(d)}${i ? '' : ' (hoje)'}`, rot: dias <= 7 ? (i ? DIAS_SEM[d.getDay()] : 'hoje') : (i ? dm(d) : 'hoje') }); }
  else for (let w = Math.ceil(dias / 7) - 1; w >= 0; w--) { const d = meiaNoite(-7 * w - 6), f = meiaNoite(-7 * w); baldes.push({ d, n: 0, dica: `semana de ${dm(d)} a ${dm(f)}`, rot: w ? dm(d) : 'atual' }); }
  for (const l of atual) {
    const atras = Math.round((meiaNoite(0) - meiaNoite(0, l.criado_em)) / 86400000);
    const i = baldes.length - 1 - (semanal ? Math.floor(atras / 7) : atras);
    if (baldes[i]) baldes[i].n++;
  }
  const maxB = Math.max(0, ...baldes.map(b => b.n)), esc0 = escala(Math.max(maxB, 1));
  const iPico = maxB ? baldes.findIndex(b => b.n === maxB) : -1;
  const media = total / baldes.length;
  const passoRot = baldes.length <= 8 ? 1 : Math.ceil(baldes.length / 6);
  const mediaTxt = media.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + (semanal ? ' por semana' : ' por dia');
  // minigráfico do cartão: as mesmas contagens, o período atual em destaque
  const spark = baldes.map((b, i) => `<i class="${i === baldes.length - 1 ? 'agora' : ''}" style="height:${maxB ? Math.max(6, b.n * 100 / maxB) : 6}%"></i>`).join('');

  // ---------- gargalo: a passagem com a menor taxa (abaixo de 50%) entre etapas com pelo menos 3 leads ----------
  let gargalo = null;
  for (let i = 1; i < CAM.length; i++) {
    const de = ch[CAM[i - 1]];
    if (de < 3) continue;
    const taxa = ch[CAM[i]] / de;
    if (taxa < 0.5 && (!gargalo || taxa < gargalo.taxa)) gargalo = { i, taxa, de, parou: de - ch[CAM[i]] };
  }
  const totalSaiu = Object.values(fa.saiu).reduce((s, v) => s + v, 0);
  const linkEtapa = k => k === 'venda' ? 'quadro.html?aba=ganhos#col-venda' : 'quadro.html#col-' + k;

  // ---------- de onde vêm ----------
  const origens = agrupar(atual, l => l.origem || 'Sem origem');
  const comCampanha = atual.filter(l => l.campanha);
  let campanhas = agrupar(comCampanha, l => l.campanha);
  if (campanhas.length > 6) {
    const resto = campanhas.slice(5);
    campanhas = [...campanhas.slice(0, 5), { nome: `Outras ${resto.length} campanhas`, outras: true, n: resto.reduce((s, x) => s + x.n, 0), visita: resto.reduce((s, x) => s + x.visita, 0), venda: resto.reduce((s, x) => s + x.venda, 0) }];
  }
  const qs = o => 'leads.html?' + new URLSearchParams({ todos: '1', dias: String(dias), ...o });

  // ---------- o que procuram ----------
  const contarPor = campo => { const c = {}; for (const l of atual) if (l[campo]) c[l[campo]] = (c[l[campo]] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  const PROCURA = { emp: ['Empreendimento', emp ? [] : contarPor('empreendimento')], tipologia: ['Tipologia', contarPor('tipologia')], objetivo: ['Objetivo', contarPor('objetivo')] };
  const abasProcura = Object.entries(PROCURA).filter(([, [, l]]) => l.length);
  if (!abasProcura.some(([k]) => k === abaProcura) && abasProcura.length) abaProcura = abasProcura[0][0];
  const listaProcura = k => { const l = PROCURA[k]?.[1] || [], max = Math.max(1, ...l.map(([, v]) => v));
    return `<div class="hbarras">${l.map(([nome, v]) => `<div class="hb" data-dica="${esc(plural(v, 'lead', 'leads'))}|${esc(nome)} · ${pct(v, total)}% do período"><span>${k === 'emp' ? `<a href="${esc(url({ emp: nome }))}">${esc(nome)}</a>` : esc(nome)}</span><i><s style="width:${Math.round(v * 100 / max)}%"></s></i><b>${v}</b></div>`).join('')}</div>`; };

  const hora = new Date().getHours();
  const saudacao = (hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite') + (MARCA_CRM.saudacao ? ', ' + MARCA_CRM.saudacao : '');
  const rotAntes = `vs. ${dias} dias antes`;

  main.innerHTML = `
<header class="pg-topo">
  <div>
    <p class="eyebrow">Dashboard · últimos ${dias} dias${emp ? ' · ' + esc(emp) : ''}</p>
    <h1>${esc(saudacao)}</h1>
    <p class="sub">${total ? `${total === 1 ? 'Chegou' : 'Chegaram'} <b>${plural(total, 'lead', 'leads')}</b> no período${crescimento !== null ? ` — ${crescimento >= 0 ? crescimento + '% a mais' : Math.abs(crescimento) + '% a menos'} que nos ${dias} dias anteriores` : ''}.` : `Nenhum lead novo nos últimos ${dias} dias.`}
      ${n('respondeu') ? ` <b>${plural(n('respondeu'), 'lead espera', 'leads esperam')}</b> sua resposta.` : ' Ninguém esperando resposta agora.'}</p>
  </div>
</header>
<div class="filtros-linha">${seletorPeriodo(PERIODOS, dias, url)}${formFiltros(emp, dias)}</div>

<section class="kpis">
  <div class="card kpi destaque">
    <small>Leads novos</small>
    <div class="kpi-linha"><b data-conta>${total}</b>${delta(crescimento, '%', rotAntes)}</div>
    <div class="spark" aria-hidden="true">${spark}</div>
  </div>
  <div class="card kpi">
    <small>Chegaram à visita</small>
    <div class="kpi-linha"><b data-conta>${taxaVisita}%</b>${delta(taxaVisitaAntes === null ? null : taxaVisita - taxaVisitaAntes, ' p.p.', rotAntes)}</div>
    <div class="medidor" data-dica="${taxaVisita}%|${ch.visita_agendada} de ${total} leads chegaram à visita${METAS.visita_agendada != null ? ' · meta ' + METAS.visita_agendada + '%' : ''}">
      <i style="width:${Math.min(taxaVisita, 100)}%"></i>${METAS.visita_agendada != null ? `<s style="left:${Math.min(METAS.visita_agendada, 100)}%"></s>` : ''}
    </div>
    <p>${METAS.visita_agendada != null ? (taxaVisita >= METAS.visita_agendada ? `<span class="ok-txt">✓ meta de ${METAS.visita_agendada}% batida</span>` : `meta ${METAS.visita_agendada}% · faltam ${Math.max(0, Math.ceil(METAS.visita_agendada * total / 100) - ch.visita_agendada)} visitas`) : `${ch.visita_agendada} de ${total} leads`}</p>
  </div>
  <div class="card kpi">
    <small>Vendas</small>
    <div class="kpi-linha"><b data-conta>${ch.venda}</b>${delta(antes.length ? ch.venda - fb.chegou.venda : null, '', rotAntes)}</div>
    <p>${pct(ch.venda, total)}% dos leads novos${vendido ? ' · <b>' + moedaCurta(vendido) + '</b>' : ''}</p>
  </div>
  <div class="card kpi">
    <small>Em negociação agora</small>
    <div class="kpi-linha"><b${valorNegociando ? ' class="longo"' : ' data-conta'}>${valorNegociando ? moedaCurta(valorNegociando) : negociando}</b></div>
    <p>${valorNegociando ? plural(negociando, 'lead', 'leads') + ' · ' : ''}${plural(n('visita_agendada'), 'visita', 'visitas')} · ${plural(n('proposta'), 'proposta', 'propostas')}</p>
  </div>
</section>

<div class="grade-2">
  <section class="card">
    <div class="card-topo"><div><h2>Funil do período</h2><p>Até onde chegaram os ${plural(total, 'lead que entrou', 'leads que entraram')}</p></div>${Object.keys(METAS).length ? '<small class="legenda"><i class="chave-meta"></i>meta</small>' : ''}</div>
    <div class="funil2">${CAM.map((k, i) => {
      const v = ch[k], meta = METAS[k], travou = gargalo && gargalo.i === i, passo = i ? pct(v, ch[CAM[i - 1]]) : null;
      return `${i ? `<div class="f2-passo${travou ? ' trava' : ''}">${travou ? ico('alerta') + `<span>${passo}% seguiram · gargalo</span>` : `<span>↓ ${passo}% seguiram</span>`}</div>` : ''}
      <a class="f2-linha" href="${linkEtapa(k)}" data-dica="${esc(plural(v, 'lead', 'leads'))}|${esc(nomeEtapa(k))} · ${pct(v, total)}% dos que entraram${meta != null ? ' · meta ' + meta + '%' : ''}">
        <span class="f2-nome">${esc(nomeEtapa(k))}</span>
        <span class="f2-pista"><i style="width:${v ? Math.max(1.5, v * 100 / Math.max(1, total)) : 0}%;background:var(--f${i + 1})"></i>${meta != null ? `<s style="left:${Math.min(meta, 100)}%"></s>` : ''}</span>
        <b class="f2-num">${v}</b>
        <span class="f2-pct"><span class="f2-p">${i ? pct(v, total) + '%' : ''}</span>${meta != null && total ? `<em class="meta ${pct(v, total) >= meta ? 'ok' : 'baixo'}" title="meta ${meta}%">${pct(v, total) >= meta ? '✓ ' : ''}<span>meta </span>${meta}%</em>` : ''}</span>
      </a>`; }).join('')}
    </div>
    ${totalSaiu ? `<div class="saidas"><span>Saíram sem fechar <b>${totalSaiu}</b></span>${Object.entries(fa.saiu).filter(([, v]) => v).map(([k, v]) => `<span class="pilula-s">${esc(nomeEtapa(k))} · ${v}</span>`).join('')}</div>` : ''}
    ${gargalo ? `<div class="aviso">${ico('alerta')}<p>O funil trava em <b>${esc(nomeEtapa(CAM[gargalo.i - 1]))}</b>: ${gargalo.parou} dos ${gargalo.de} leads que chegaram lá não seguiram para ${esc(nomeEtapa(CAM[gargalo.i]))}.</p>
      <a href="${linkEtapa(CAM[gargalo.i - 1])}">Ver esses leads →</a></div>` : ''}
  </section>

  <section class="card">
    <div class="card-topo"><h2>Para agir agora</h2><small class="ao-vivo">agora</small></div>
    <ul class="acoes-r">${acoes.map(([num, titulo, tipo, sub, link, botao, icone]) => `
      <li class="${tipo}">
        <span class="bolha-ico">${ico(icone)}</span>
        <div><p>${esc(titulo)} ${tag(tipo)}</p><small>${esc(sub)}</small></div>
        <b class="num" data-conta>${num}</b>
        ${num ? `<a class="${tipo === 'urgente' ? 'btn' : 'btn-borda'}" href="${esc(link)}">${botao} →</a>` : ''}
      </li>`).join('')}
    </ul>
    <div class="agenda-sofia">
      <h3>${ico('calendario')}Agenda · hoje e amanhã</h3>
      <div id="agenda-crm"><p class="agenda-dica">Carregando a agenda…</p></div>
    </div>
  </section>
</div>

<div class="grade-2 larga">
  <section class="card">
    <div class="card-topo">
      <div><h2>Leads novos por ${semanal ? 'semana' : 'dia'}</h2><p>${total ? `média de ${mediaTxt} · pico de ${maxB} em ${baldes[iPico].dica.replace(' (hoje)', '')}` : 'nenhum lead no período'}</p></div>
      <div class="topo-graf">${total ? '<small class="legenda"><i class="chave-media"></i>média</small>' : ''}<button type="button" class="mini" id="ver-numeros" aria-pressed="false">Ver números</button></div>
    </div>
    <div class="colunas" id="graf-dias">
      <div class="col-eixo" aria-hidden="true">${esc0.marcas.map(t => `<span style="bottom:${t * 100 / esc0.topo}%">${t}</span>`).join('')}</div>
      <div class="col-area">
        ${esc0.marcas.map(t => `<i class="col-grade" style="bottom:${t * 100 / esc0.topo}%"></i>`).join('')}
        ${total ? `<i class="col-media" style="bottom:${media * 100 / esc0.topo}%"></i>` : ''}
        <div class="col-barras" style="--n:${baldes.length}">${baldes.map((b, i) => `<span class="col${i === baldes.length - 1 ? ' agora' : ''}" tabindex="0" data-dica="${esc(plural(b.n, 'lead', 'leads'))}|${esc(b.dica)}">${i === iPico ? `<em style="bottom:${b.n * 100 / esc0.topo}%">${b.n}</em>` : ''}<i style="height:${b.n * 100 / esc0.topo}%"></i></span>`).join('')}</div>
      </div>
      <div class="col-rotulos" aria-hidden="true">${baldes.map((b, i) => `<span>${(baldes.length - 1 - i) % passoRot === 0 ? esc(b.rot) : ''}</span>`).join('')}</div>
    </div>
    <div class="tabela-dias" id="tab-dias" hidden>${baldes.map(b => `<span><small>${esc(b.dica)}</small><b>${b.n}</b></span>`).join('')}</div>
  </section>

  <section class="card">
    <div class="card-topo"><div><h2>De onde vêm</h2><p>Origem dos leads do período e quanto vira visita e venda</p></div></div>
    ${origens.length ? linhasConversao(origens, x => x.nome === 'Sem origem' ? 'leads.html?aba=sem_origem&todos=1&dias=' + dias : qs({ origem: x.nome })) : '<p class="vazio">Nenhum lead no período.</p>'}
  </section>
</div>

<div class="grade-2">
  <section class="card">
    <div class="card-topo"><div><h2>Campanhas</h2><p>Quais anúncios trazem lead que vira visita e venda</p></div></div>
    ${campanhas.length ? linhasConversao(campanhas, x => x.outras ? null : qs({ campanha: x.nome }))
      : '<p class="vazio-dica">Nenhum lead do período chegou com o nome da campanha. Quando o formulário ou o anúncio gravar a campanha no lead, cada uma aparece aqui com a taxa de visita e as vendas.</p>'}
  </section>

  <section class="card">
    <div class="card-topo"><div><h2>O que procuram</h2><p>Leads novos no período</p></div>
      ${abasProcura.length > 1 ? `<nav class="seg seg-mini" id="aba-procura">${abasProcura.map(([k, [nome]]) => `<button type="button" data-procura="${k}" class="${k === abaProcura ? 'on' : ''}">${nome}</button>`).join('')}</nav>` : ''}</div>
    <div id="lista-procura">${abasProcura.length ? listaProcura(abaProcura) : '<p class="vazio">Nenhum lead novo no período.</p>'}</div>
  </section>
</div>`;

  // ver os números do gráfico em lista (para quem não usa o mouse, ou para copiar)
  $('#ver-numeros').addEventListener('click', e => {
    const tabela = $('#tab-dias'), ver = tabela.hidden;
    tabela.hidden = !ver; $('#graf-dias').hidden = ver;
    e.currentTarget.textContent = ver ? 'Ver gráfico' : 'Ver números'; e.currentTarget.setAttribute('aria-pressed', String(ver));
  });
  // trocar Empreendimento / Tipologia / Objetivo na hora
  $('#aba-procura')?.addEventListener('click', e => {
    const b = e.target.closest('[data-procura]'); if (!b) return;
    abaProcura = b.dataset.procura;
    $$('#aba-procura button').forEach(x => x.classList.toggle('on', x === b));
    $('#lista-procura').innerHTML = listaProcura(abaProcura);
  });
  pintarAgenda();
} });

// Compromissos de hoje e amanhã da agenda do Google (link iCal nos Ajustes); a resposta vale 5 minutos
let agendaGuardada = null;
async function pintarAgenda(forcar = false) {
  let r = !forcar && agendaGuardada && Date.now() - agendaGuardada.em < 300e3 ? agendaGuardada.r : null;
  if (!r) {
    try { r = await api('agenda'); } catch (e) { r = { configurada: true, erro: true }; }
    agendaGuardada = { em: Date.now(), r };
  }
  const el = $('#agenda-crm');
  if (!el) return;
  const dica = t => `<p class="agenda-dica">${t}</p>`;
  if (r.exemplo) el.innerHTML = dica('No modo exemplo a agenda não aparece. Com o servidor, cole o link iCal da agenda do Google em <button type="button" class="lnk" data-abrir-ajustes>Ajustes</button>.');
  else if (!r.configurada) el.innerHTML = dica('Para ver os compromissos aqui, cole o link iCal da agenda do Google em <button type="button" class="lnk" data-abrir-ajustes>Ajustes</button>.');
  else if (r.erro) el.innerHTML = dica('Não consegui ler a agenda agora. Confira se o link iCal está certo em <button type="button" class="lnk" data-abrir-ajustes>Ajustes</button>.');
  else if (!r.eventos.length) el.innerHTML = dica('Nenhum compromisso hoje nem amanhã.');
  else el.innerHTML = '<ul class="agenda-lista">' + r.eventos.map(ev => `<li><span class="ag-hora${ev.hoje ? ' hoje' : ''}"><b>${ev.hoje ? 'Hoje' : 'Amanhã'}</b>${esc(ev.hora)}</span>
    <div><p>${esc(ev.titulo)}</p>${ev.local ? `<small>${esc(ev.local)}</small>` : ''}</div></li>`).join('') + '</ul>';
  $('[data-abrir-ajustes]', el)?.addEventListener('click', abrirAjustes);
}
