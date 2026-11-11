// CRM em quadro: colunas por etapa (abas Em aberto, Ganhos e Perdidos), filtros e arrastar e soltar entre etapas.
// A ficha do lead fica no lead.js.
registrarTela('crm', { titulo: 'CRM', desenhar(main, { trocou }) {
  const PERIODOS = [[0, 'Todos'], [90, '90 dias'], [30, '30 dias'], [7, '7 dias']];
  const { dias, emp, q: busca, url } = filtros(PERIODOS, 0);
  const g = new URLSearchParams(location.search);
  const ABAS = { aberto: ['Em aberto', ABERTAS], ganhos: ['Ganhos', GANHOS], perdidos: ['Perdidos', PERDIDOS] };
  const aba = ABAS[g.get('aba')] ? g.get('aba') : 'aberto';
  const resp = (g.get('resp') || '').trim();
  const urlAba = mudar => url({ aba: aba === 'aberto' ? '' : aba, resp, ...mudar });

  // Filtros (valem para as três abas)
  const desde = dias ? meiaNoite(-(dias - 1)) : null, b = busca.toLowerCase();
  const lista = CRM.leads.filter(l => (!emp || l.empreendimento === emp) && (!resp || l.responsavel === resp) && (!desde || l.criado_em >= desde) &&
    (!b || [l.nome, l.telefone, l.instagram].some(v => String(v || '').toLowerCase().includes(b))));
  const porEtapa = Object.fromEntries(Object.keys(ETAPAS).map(k => [k, []]));
  for (const l of lista) porEtapa[l.etapa].push(l);
  const contaAba = Object.fromEntries(Object.entries(ABAS).map(([k, [, cols]]) => [k, cols.reduce((s, c) => s + porEtapa[c].length, 0)]));
  const colunas = ABAS[aba][1], totalAba = Math.max(1, contaAba[aba]);

  // Próximo follow-up pendente de cada lead (para a etiqueta do card)
  const proxFu = new Map();
  for (const f of CRM.followups) if (!f.feito_em && (!proxFu.has(f.lead_id) || f.quando < proxFu.get(f.lead_id))) proxFu.set(f.lead_id, f.quando);
  const hoje0 = meiaNoite(0), hojeD = diaLocal(new Date());

  const card = l => {
    const fu = proxFu.get(l.id), origem = l.origem || '';
    const linhaOrigem = [origem, l.campanha || '', origem || l.campanha ? '' : l.empreendimento || ''].filter(Boolean).join(' · ');
    const atras = fu && fu < hoje0, dAtras = atras ? Math.round((hoje0 - meiaNoite(0, fu)) / 86400000) : 0;
    return `<article class="lead" draggable="true" data-id="${l.id}" data-abrir-lead="${l.id}">
      <div class="lead-topo">
        <strong>${esc(l.nome || 'Sem nome')}</strong>
        ${l.telefone && !l.nao_contatar ? `<a class="wa-btn" href="${esc(wa(l.telefone))}" target="_blank" rel="noopener" title="Abrir no WhatsApp">${ico('whats')}</a>` : ''}
      </div>
      ${l.telefone ? `<small class="tel">${esc(l.telefone)}</small>` : ''}
      ${linhaOrigem ? `<small class="origem">${ico(ICO_ORIGEM[origem] || 'form')}${esc(linhaOrigem)}</small>` : ''}
      ${fu || l.temperatura || l.visita_em || l.nao_contatar ? `<div class="chips">
        ${fu ? `<span class="chip ${atras ? 'vermelho' : ''}">${ico('relogio')}${atras ? dAtras + 'd atrasado' : esc(dataCurta(fu))}</span>` : ''}
        ${l.temperatura ? `<span class="chip temp-${esc(l.temperatura)}">${esc(TEMPERATURAS[l.temperatura] || l.temperatura)}</span>` : ''}
        ${l.visita_em ? `<span class="chip verde">${ico('calendario')}Visita ${diaLocal(l.visita_em) === hojeD ? 'hoje' : dm(l.visita_em)}</span>` : ''}
        ${l.nao_contatar ? '<span class="chip cinza">⊘ Não contatar</span>' : ''}
      </div>` : ''}
      <div class="lead-pe">
        <small>${esc(dataCurta(l.criado_em))}${l.responsavel ? ` · <b title="${esc(l.responsavel)}">${esc(iniciais(l.responsavel).toUpperCase())}</b>` : ''}</small>
        ${l.valor ? `<b class="valor">${dinheiro(l.valor)}</b>` : ''}
      </div>
    </article>`;
  };

  main.innerHTML = `
<header class="pg-topo">
  <div><p class="eyebrow">Funil de vendas</p><h1>CRM</h1></div>
  <div class="ferramentas"><button class="btn" type="button" onclick="abrirNovo()">${ico('mais1')}Novo lead</button></div>
</header>
<div class="crm-barra">
  <nav class="seg abas-crm">${Object.entries(ABAS).map(([k, [nome]]) => `<a href="${esc(url({ aba: k === 'aberto' ? '' : k, resp }))}" class="${k === aba ? 'on' : ''}">${nome} <b>${contaAba[k]}</b></a>`).join('')}</nav>
  <div class="crm-direita">
    <form class="filtros" method="get">
      ${aba !== 'aberto' ? `<input type="hidden" name="aba" value="${esc(aba)}">` : ''}
      ${emp ? `<input type="hidden" name="emp" value="${esc(emp)}">` : ''}
      <input type="hidden" name="dias" value="${dias}">
      <label class="busca">${ico('busca')}<input name="q" value="${esc(busca)}" placeholder="Buscar nome ou telefone" data-busca-viva></label>
      <select name="resp" onchange="enviarFiltro(this.form)"><option value="">Todos os corretores</option>${listaResponsaveis().map(r => `<option${r === resp ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
    </form>
    ${seletorPeriodo(PERIODOS, dias, urlAba)}
  </div>
</div>
<div class="quadro">${colunas.map(k => {
  const l = porEtapa[k], soma = l.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  return `<section class="coluna${ATENCAO.includes(k) ? ' atencao' : ''}" id="col-${k}" data-etapa="${k}" style="--c:${cor(k)}">
    <header class="col-cab">
      <div><p><i></i>${esc(nomeEtapa(k))}</p><small>${Math.round(l.length * 100 / totalAba)}%${soma ? ' · ' + dinheiro(soma) : ''}</small></div>
      <b class="col-n">${l.length}</b>
    </header>
    <div class="cards">${l.map(card).join('')}${l.length ? '' : '<p class="col-vazia">Nenhum lead aqui</p>'}</div>
  </section>`; }).join('')}
</div>`;

  // arrastar e soltar (computador); no celular, segure o card (ios.js) ou mude a etapa pela ficha do lead
  $$('.coluna').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('alvo'); });
    col.addEventListener('dragleave', () => col.classList.remove('alvo'));
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('alvo');
      if (arrastando && arrastando.closest('.coluna') !== col) mover(arrastando, col.dataset.etapa);
    });
  });

  // vindo do dashboard com #col-etapa, já mostra a coluna
  if (trocou && location.hash.startsWith('#col-')) {
    const col = document.getElementById(location.hash.slice(1));
    if (col) setTimeout(() => { col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' }); col.classList.add('pisca'); setTimeout(() => col.classList.remove('pisca'), 1400); }, 300);
  }
  // vindo do hub com ?novo=1: já abre o cadastro
  if (g.get('novo') === '1') { history.replaceState(null, '', location.pathname); quandoPronto(() => setTimeout(abrirNovo, 100)); }
} });

async function mover(card, etapa) {
  const de = card.closest('.coluna').dataset.etapa;
  if (de === etapa) return;
  const destino = document.querySelector(`.coluna[data-etapa="${etapa}"] .cards`);
  destino.querySelector('.col-vazia')?.remove();
  destino.prepend(card);
  card.classList.add('chegou'); setTimeout(() => card.classList.remove('chegou'), 900);
  contar();
  try { await mudarEtapa(card.dataset.id, etapa, de); } catch (e) { /* o erro já apareceu na tela */ }
  atualizar(); // números das colunas, bolhas e dashboard em dia
}

// Atualiza os contadores das colunas
function contar() {
  $$('.coluna').forEach(c => { c.querySelector('.col-n').textContent = c.querySelectorAll('.lead').length; });
}

let arrastando = null;
document.addEventListener('dragstart', e => { if (e.target.classList?.contains('lead')) { arrastando = e.target; e.target.classList.add('drag'); } });
document.addEventListener('dragend', e => { e.target.classList?.remove('drag'); arrastando = null; });
// a atualização automática espera você soltar o card
window.ocupadoTela = () => !!arrastando;
