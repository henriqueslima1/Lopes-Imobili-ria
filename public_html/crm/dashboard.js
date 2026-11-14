// Dashboard: três perguntas, nesta ordem.
//  1. Quanto entrou e o que fazer agora  → leads novos (cartão escuro, com as barras por dia) + "Para agir agora"
//  2. O período foi melhor ou pior       → vendas (o cartão vivo), taxa de visita e o que está em negociação
//  3. Onde trava e o que converte        → funil em pilares (o gargalo em limão) + leads por origem, campanha, empreendimento…
// Cores dos gráficos: uma série só (--serie); o destaque (pico e hoje) é o limão listrado do cartão escuro.
const CAM = ['novo', 'primeiro_contato', 'respondeu', 'visita_agendada', 'proposta', 'venda'];
// Quem está numa etapa de saída conta até onde certamente chegou antes de sair
const SAIDA = { nao_respondeu: 'primeiro_contato', perdido: 'primeiro_contato', sem_intencao: 'respondeu' };
const alcance = l => Math.max(0, CAM.indexOf(SAIDA[l.etapa] || l.etapa));
const VISITA = CAM.indexOf('visita_agendada');
let abaQuebra = 'origem';

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
function delta(v, sufixo, rotulo, junto = false) {
  if (v === null) return junto ? '<span class="delta igual">primeiro período com dados</span>' : '<small class="delta-rot">primeiro período com dados</small>';
  const tipo = v > 0 ? 'sobe' : v < 0 ? 'desce' : 'igual', txt = `${tipo === 'sobe' ? '↑' : tipo === 'desce' ? '↓' : '='} ${Math.abs(v)}${sufixo}`;
  return junto ? `<span class="delta ${tipo}"><b>${txt}</b> ${esc(rotulo)}</span>` : `<span class="delta ${tipo}">${txt}</span><small class="delta-rot">${esc(rotulo)}</small>`;
}
// Escala do eixo: 0 até um número redondo, com 2 a 4 marcas inteiras
function escala(max) {
  const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(p => max / p <= 4) || Math.ceil(max / 4);
  const topo = Math.max(passo * Math.ceil(max / passo), passo * 2);
  return { topo, marcas: Array.from({ length: topo / passo + 1 }, (_, i) => i * passo) };
}
// Agrupa leads por um campo, com quantos chegaram à visita e à venda; acima de 6 grupos, os menores viram "Outros"
function agrupar(lista, chave) {
  const g = new Map();
  for (const l of lista) {
    const k = chave(l), x = g.get(k) || { nome: k, n: 0, visita: 0, venda: 0 };
    x.n++; if (alcance(l) >= VISITA) x.visita++; if (l.etapa === 'venda') x.venda++;
    g.set(k, x);
  }
  const grupos = [...g.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (grupos.length <= 6) return grupos;
  const resto = grupos.slice(5), soma = c => resto.reduce((s, x) => s + x[c], 0);
  return [...grupos.slice(0, 5), { nome: `Outros ${resto.length}`, outros: true, n: soma('n'), visita: soma('visita'), venda: soma('venda') }];
}
// Linhas "nome · barra · visita · vendas" (com link, a linha abre a lista já filtrada)
function linhasConversao(grupos, link) {
  const max = Math.max(1, ...grupos.map(x => x.n));
  return `<div class="tb">
    <div class="tb-cab"><span></span><span>Leads</span><span>Visita</span><span>Vendas</span></div>
    ${grupos.map(x => { const href = x.outros ? null : link(x); return `<${href ? `a href="${esc(href)}"` : 'div'} class="tb-linha" data-dica="${esc(plural(x.n, 'lead', 'leads'))}|${esc(x.nome)}: ${x.visita} na visita (${pct(x.visita, x.n)}%), ${plural(x.venda, 'venda', 'vendas')}">
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
  // [número, título, urgente?, explicação, link, ícone, nome curto (para a linha "Em dia")]
  const acoes = [
    [n('respondeu'), 'Responderam e esperam você', true, 'o mais antigo espera há ' + tempoDesde(antigo('respondeu')), 'quadro.html#col-respondeu', 'whats', 'respostas'],
    [n('novo'), 'Sem primeiro contato', !!novoVelho, 'o mais antigo chegou há ' + tempoDesde(antigo('novo')), 'quadro.html#col-novo', 'pessoas', 'primeiro contato'],
    [n('visita_agendada'), 'Visitas para confirmar', false, 'confirme dia e horário com cada lead', 'quadro.html#col-visita_agendada', 'calendario', 'visitas'],
    [fu.atrasados + fu.hoje, 'Follow-ups para hoje', false, fu.atrasados ? plural(fu.atrasados, 'atrasado', 'atrasados') + (fu.hoje ? ' e ' + fu.hoje + ' para hoje' : '') : 'nenhum atrasado', 'followups.html', 'tarefa', 'follow-ups'],
    [parados, 'Parados', false, 'sem atividade há mais de 3 dias', 'quadro.html', 'relogio', 'leads parados']
  ];
  // só aparece o que tem pendência (o urgente primeiro); o que está zerado vira uma linha só
  const pendentes = acoes.filter(a => a[0]).sort((a, b) => b[2] - a[2]), emDia = acoes.filter(a => !a[0]).map(a => a[6]);

  // ---------- leads por dia (por semana em 90 dias) ----------
  const semanal = dias > 31, baldes = [];
  if (!semanal) for (let i = dias - 1; i >= 0; i--) { const d = meiaNoite(-i); baldes.push({ d, n: 0, dica: `${DIAS_SEM[d.getDay()]}, ${dm(d)}${i ? '' : ' (hoje)'}`, rot: dias <= 7 ? (i ? DIAS_SEM[d.getDay()] : 'hoje') : (i ? dm(d) : 'hoje') }); }
  else for (let w = Math.ceil(dias / 7) - 1; w >= 0; w--) { const d = meiaNoite(-7 * w - 6), f = meiaNoite(-7 * w); baldes.push({ d, n: 0, dica: `semana de ${dm(d)} a ${dm(f)}`, rot: w ? dm(d) : 'atual' }); }
  for (const l of atual) {
    const atras = Math.round((meiaNoite(0) - meiaNoite(0, l.criado_em)) / 86400000);
    const i = baldes.length - 1 - (semanal ? Math.floor(atras / 7) : atras);
    if (baldes[i]) baldes[i].n++;
  }
  const maxB = Math.max(0, ...baldes.map(b => b.n));
  const iPico = maxB ? baldes.findIndex(b => b.n === maxB) : -1;
  const media = total / baldes.length;
  const passoRot = baldes.length <= 8 ? 1 : Math.ceil(baldes.length / 6);
  const mediaNum = media.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const altura = v => v * 86 / Math.max(maxB, 6); // a escala vai até pelo menos 6: 1 lead é uma barra baixa, 2 um pouco maior; // a barra mais alta ocupa 86% da área: sobra lugar para o número do pico

  // ---------- gargalo: a passagem com a menor taxa (abaixo de 50%) entre etapas com pelo menos 3 leads ----------
  let gargalo = null;
  for (let i = 1; i < CAM.length; i++) {
    const de = ch[CAM[i - 1]];
    if (de < 3) continue;
    const taxa = ch[CAM[i]] / de;
    if (taxa < 0.5 && (!gargalo || taxa < gargalo.taxa)) gargalo = { i, taxa, de, parou: de - ch[CAM[i]] };
  }
  const totalSaiu = Object.values(fa.saiu).reduce((s, v) => s + v, 0);
  const escF = escala(Math.max(total, 1)); // eixo do funil: de 0 até um número redondo
  const linkEtapa = k => k === 'venda' ? 'quadro.html?aba=ganhos#col-venda' : 'quadro.html#col-' + k;

  // ---------- o que converte: os leads do período por um campo, com a taxa de visita e as vendas ----------
  const qs = o => 'leads.html?' + new URLSearchParams({ todos: '1', dias: String(dias), ...o });
  const com = campo => atual.filter(l => l[campo]);
  // chave: [nome da aba, leads que entram, de onde sai o grupo, link de cada linha (null = sem link)]
  const QUEBRAS = {
    origem: ['Origem', atual, l => l.origem || 'Sem origem', x => x.nome === 'Sem origem' ? 'leads.html?aba=sem_origem&todos=1&dias=' + dias : qs({ origem: x.nome })],
    campanha: ['Campanha', com('campanha'), l => l.campanha, x => qs({ campanha: x.nome })],
    emp: ['Empreendimento', emp ? [] : com('empreendimento'), l => l.empreendimento, x => url({ emp: x.nome })],
    tipologia: ['Tipologia', com('tipologia'), l => l.tipologia, () => null],
    objetivo: ['Objetivo', com('objetivo'), l => l.objetivo, () => null]
  };
  // Origem e Campanha aparecem sempre (vazia, a Campanha explica como preencher); as outras, só com dado
  const abas = Object.keys(QUEBRAS).filter(k => k === 'origem' || k === 'campanha' || QUEBRAS[k][1].length);
  if (!abas.includes(abaQuebra)) abaQuebra = 'origem';
  const listaQuebra = k => {
    const [, lista, chave, link] = QUEBRAS[k];
    if (lista.length) return linhasConversao(agrupar(lista, chave), link);
    return k === 'campanha' ? '<p class="vazio-dica">Nenhum lead do período chegou com o nome da campanha. Quando o formulário ou o anúncio gravar a campanha no lead, cada uma aparece aqui com a taxa de visita e as vendas.</p>'
      : '<p class="vazio">Nenhum lead no período.</p>';
  };

  const hora = new Date().getHours();
  const saudacao = (hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite') + (MARCA_CRM.saudacao ? ', ' + MARCA_CRM.saudacao : '');
  const rotAntes = `vs. ${dias} dias antes`;
  const resumo = n('respondeu') ? `<b>${plural(n('respondeu'), 'lead espera', 'leads esperam')}</b> sua resposta, o mais antigo há ${tempoDesde(antigo('respondeu'))}.`
    : pendentes.length ? 'Ninguém esperando resposta. Veja o que mais pede atenção hoje.' : 'Tudo em dia: ninguém esperando você agora.';

  main.innerHTML = `
<header class="pg-topo">
  <div>
    <h1>${esc(saudacao)}</h1>
    <p class="sub">${resumo}</p>
  </div>
  <div class="filtros-linha">${seletorPeriodo(PERIODOS, dias, url)}${formFiltros(emp, dias)}</div>
</header>


<div class="grade-2 funil-linha">
  <section class="heroi">
    <div class="heroi-topo">
      ${bolhaIco('pessoas')}
      <div><h2>Leads novos${emp ? ' · ' + esc(emp) : ''}</h2>${delta(crescimento, '%', rotAntes, true)}</div>
      <button type="button" class="mini" id="ver-numeros" aria-pressed="false">Ver números</button>
    </div>
    <div class="heroi-num"><span data-conta>${total}</span><small>${total === 1 ? 'lead' : 'leads'} em ${dias} dias</small></div>
    <p class="heroi-sub">${total ? `<i class="chave-media"></i>média de ${mediaNum} por ${semanal ? 'semana' : 'dia'} · pico de ${maxB} ${semanal ? 'na ' : 'em '}${esc(baldes[iPico].dica.replace(' (hoje)', ''))}` : 'nenhum lead no período'}</p>
    <div class="colunas" id="graf-dias">
      <div class="col-area">
        ${total ? `<i class="col-media" style="bottom:${altura(media)}%"></i>` : ''}
        <div class="col-barras">${baldes.map((b, i) => `<span class="col${i === iPico ? ' pico' : ''}${i === baldes.length - 1 && b.n ? ' agora' : ''}" tabindex="0" data-dica="${esc(plural(b.n, 'lead', 'leads'))}|${esc(b.dica)}">${i === iPico ? `<em style="bottom:${altura(b.n)}%">${b.n}</em>` : ''}<i style="height:${altura(b.n)}%"></i></span>`).join('')}</div>
      </div>
      <div class="col-rotulos" aria-hidden="true">${baldes.map((b, i) => `<span>${(baldes.length - 1 - i) % passoRot === 0 ? esc(b.rot) : ''}</span>`).join('')}</div>
    </div>
    <div class="tabela-dias" id="tab-dias" hidden>${baldes.map(b => `<span><small>${esc(b.dica)}</small><b>${b.n}</b></span>`).join('')}</div>
  </section>

  <section class="card">
    <div class="card-topo"><h2>Para agir agora</h2><small class="ao-vivo">agora</small></div>
    ${pendentes.length ? `<ul class="acoes-r">${pendentes.map(([num, titulo, urgente, sub, link, icone]) => `
      <li class="${urgente ? 'urgente' : ''}"><a href="${esc(link)}">
        ${bolhaIco(icone)}
        <div><p>${esc(titulo)}</p><small>${esc(sub)}</small></div>
        <b class="num" data-conta>${num}</b>${ico('seta')}
      </a></li>`).join('')}
    </ul>` : ''}
    ${emDia.length ? `<p class="em-dia">${ico('ok')}<span>${pendentes.length ? 'Em dia: ' + esc(emDia.join(', ')) + '.' : 'Tudo em dia: nada esperando você.'}</span></p>` : ''}
    <div class="agenda-sofia">
      <h3>${ico('calendario')}Agenda · hoje e amanhã</h3>
      <div id="agenda-crm"><p class="agenda-dica">Carregando a agenda…</p></div>
    </div>
  </section>
</div>

<section class="kpis">
  <div class="card kpi vivo">
    <small>Vendas</small><a class="ir" href="${esc(linkEtapa('venda'))}" aria-label="Ver as vendas">${ico('diagonal')}</a>
    <div class="kpi-linha"><b data-conta>${ch.venda}</b>${delta(antes.length ? ch.venda - fb.chegou.venda : null, '', rotAntes)}</div>
    <p>${pct(ch.venda, total)}% dos leads novos${vendido ? ' · <b>' + moedaCurta(vendido) + '</b>' : ''}</p>
  </div>
  <div class="card kpi">
    <small>Chegaram à visita</small><a class="ir" href="${esc(linkEtapa('visita_agendada'))}" aria-label="Ver as visitas">${ico('diagonal')}</a>
    <div class="kpi-linha"><b data-conta>${taxaVisita}%</b>${delta(taxaVisitaAntes === null ? null : taxaVisita - taxaVisitaAntes, ' p.p.', rotAntes)}</div>
    <div class="medidor" data-dica="${taxaVisita}%|${ch.visita_agendada} de ${total} leads chegaram à visita${METAS.visita_agendada != null ? ' · meta ' + METAS.visita_agendada + '%' : ''}">
      <i style="width:${Math.min(taxaVisita, 100)}%"></i>${METAS.visita_agendada != null ? `<s style="left:${Math.min(METAS.visita_agendada, 100)}%"></s>` : ''}
    </div>
    <p>${METAS.visita_agendada != null ? (taxaVisita >= METAS.visita_agendada ? `<span class="ok-txt">✓ meta de ${METAS.visita_agendada}% batida</span>` : `meta ${METAS.visita_agendada}% · faltam ${Math.max(0, Math.ceil(METAS.visita_agendada * total / 100) - ch.visita_agendada)} visitas`) : `${ch.visita_agendada} de ${total} leads`}</p>
  </div>
  <div class="card kpi">
    <small>Em negociação agora</small><a class="ir" href="${esc('quadro.html')}" aria-label="Ver o quadro">${ico('diagonal')}</a>
    <div class="kpi-linha"><b${valorNegociando ? '' : ' data-conta'}>${valorNegociando ? moedaCurta(valorNegociando) : negociando}</b></div>
    <p>${valorNegociando ? plural(negociando, 'lead', 'leads') + ' · ' : ''}${plural(n('visita_agendada'), 'visita', 'visitas')} · ${plural(n('proposta'), 'proposta', 'propostas')}</p>
  </div>
</section>

<div class="grade-2 funil-linha">
  <section class="card funil">
    <div class="card-topo"><div><h2>Funil do período</h2><p>Até onde chegaram os ${plural(total, 'lead que entrou', 'leads que entraram')}</p></div>
      ${gargalo ? `<a class="gargalo-aviso" href="${linkEtapa(CAM[gargalo.i - 1])}" title="Ver os leads parados em ${esc(nomeEtapa(CAM[gargalo.i - 1]))}">${ico('alerta')}Gargalo: ${esc(nomeEtapa(CAM[gargalo.i - 1]))} → ${esc(nomeEtapa(CAM[gargalo.i]))} · só ${pct(ch[CAM[gargalo.i]], gargalo.de)}% seguem</a>` : ''}</div>
    <div class="pilares">
      <div class="eixo" aria-hidden="true">${escF.marcas.map(t => `<span style="bottom:${t * 88 / escF.topo}%">${t}</span>`).join('')}</div>
      <div class="plot" aria-hidden="true">${escF.marcas.map(t => `<i class="grade" style="bottom:${t * 88 / escF.topo}%"></i>`).join('')}</div>
      ${CAM.map((k, i) => {
        const v = ch[k], meta = METAS[k], trava = gargalo && gargalo.i - 1 === i, alt = v * 88 / escF.topo, segue = i < CAM.length - 1 && v ? pct(ch[CAM[i + 1]], v) : null;
        return `<a class="pilar${trava ? ' trava' : ''}" href="${linkEtapa(k)}" style="grid-column:${i + 2}" data-dica="${esc(plural(v, 'lead', 'leads'))}|${esc(nomeEtapa(k))} · ${pct(v, total)}% dos que entraram${segue !== null ? ` · ${segue}% seguiram para ${esc(nomeEtapa(CAM[i + 1]))}` : ''}${meta != null ? ' · meta ' + meta + '%' : ''}">
          <em style="bottom:max(${alt}%, 12px)">${v}</em><i style="height:${alt}%"></i></a>
        <div class="rot${trava ? ' trava' : ''}" style="grid-column:${i + 2}"><b>${esc(nomeEtapa(k))}</b><small>${i ? pct(v, total) + '% do total' : 'entraram'}</small>${meta != null && total ? `<em class="meta ${pct(v, total) >= meta ? 'ok' : 'baixo'}">${pct(v, total) >= meta ? '✓ ' : ''}<span>meta </span>${meta}%</em>` : ''}</div>`; }).join('')}
    </div>
    ${totalSaiu ? `<div class="saidas"><span>Saíram sem fechar <b>${totalSaiu}</b></span>${Object.entries(fa.saiu).filter(([, v]) => v).map(([k, v]) => `<span class="pilula-s">${esc(nomeEtapa(k))} · ${v}</span>`).join('')}</div>` : ''}
  </section>

  <section class="card">
    <div class="card-topo"><div><h2>O que converte</h2><p>Leads do período: quantos foram à visita e quantos compraram</p></div></div>
    <nav class="seg seg-mini" id="aba-quebra" aria-label="Agrupar por">${abas.map(k => `<button type="button" data-quebra="${k}" class="${k === abaQuebra ? 'on' : ''}">${QUEBRAS[k][0]}</button>`).join('')}</nav>
    <div id="lista-quebra">${listaQuebra(abaQuebra)}</div>
  </section>
</div>`;

  // ver os números do gráfico em lista (para quem não usa o mouse, ou para copiar)
  $('#ver-numeros').addEventListener('click', e => {
    const tabela = $('#tab-dias'), ver = tabela.hidden;
    tabela.hidden = !ver; $('#graf-dias').hidden = ver;
    e.currentTarget.textContent = ver ? 'Ver gráfico' : 'Ver números'; e.currentTarget.setAttribute('aria-pressed', String(ver));
  });
  // trocar Origem / Campanha / Empreendimento / Tipologia / Objetivo na hora
  $('#aba-quebra').addEventListener('click', e => {
    const b = e.target.closest('[data-quebra]'); if (!b) return;
    abaQuebra = b.dataset.quebra;
    $$('#aba-quebra button').forEach(x => x.classList.toggle('on', x === b));
    $('#lista-quebra').innerHTML = listaQuebra(abaQuebra);
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
