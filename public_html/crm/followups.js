// Follow-ups: em cima "Faça agora" (o contato mais importante agora, e por quê) e "Seu dia";
// embaixo os contatos em lista (padrão) ou em quadro por prazo. Ações: agendar, concluir, adiar, editar, excluir
// e agendar quem está sem próximo passo.
let dlgAgendar, fAg, fuArrastando = null;
// Painel de concluir aberto (um por vez): { id, marcados, ...como foi } — ver painelFu
let fuAb = null;
const DIAS_SEM_FU = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
// Lista ou quadro: a escolha fica neste navegador
const CHAVE_VISTA_FU = 'hub-crm-fu-vista';
const vistaFu = () => { try { return localStorage.getItem(CHAVE_VISTA_FU) === 'quadro' ? 'quadro' : 'lista'; } catch (e) { return 'lista'; } };
const fuFechados = new Set(['depois', 'feitos']); // grupos da lista fechados nesta visita ("Mais adiante" e "Feitos hoje" começam fechados)
// A tela não cresce sem fim: cada grupo da lista mostra 5 linhas (3 no celular) e cada coluna do quadro 4 cartões;
// "Ver mais" abre o resto (e o que foi aberto continua aberto quando a tela se atualiza)
const LIMITE_QUADRO_FU = 4;
const limiteListaFu = () => matchMedia('(max-width: 760px)').matches ? 3 : 5;
const fuVerMais = new Set();
const botaoMais = (chave, resto, aberto) => `<button type="button" class="fu-mais" data-mais="${chave}" data-resto="${resto}" aria-expanded="${aberto}">${aberto ? 'Mostrar menos' : 'Ver mais ' + resto}</button>`;
// Ordem da fila do "Faça agora": atrasado antes de hoje; depois, quanto mais perto da venda, antes; depois, o mais atrasado
const PESO_FU = { proposta: 5, visita_agendada: 4, respondeu: 3, novo: 2, primeiro_contato: 2, nao_respondeu: 1 };
const MOTIVO_FU = {
  proposta: 'Proposta esperando resposta: é venda na mesa e esfria rápido.', visita_agendada: 'Visita sem confirmação costuma virar falta.',
  respondeu: 'O lead respondeu e está esperando você.', novo: 'Lead novo esfria em horas, não em dias.',
  primeiro_contato: 'Quanto mais tempo sem retorno, mais o lead esfria.', nao_respondeu: 'Nova tentativa antes de dar o lead como perdido.'
};
const svgFu = (d, t = 16) => `<svg class="ico" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC_FU = {
  alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', baixo: '<path d="m6 9 6 6 6-6"/>'
};

registrarTela('followups', { titulo: 'Follow-ups', desenhar(main) {
  const g = new URLSearchParams(location.search);
  const concluidas = g.get('aba') === 'concluidas', resp = (g.get('resp') || '').trim(), vista = vistaFu();
  const doResp = l => !resp || (resp === '-' ? !l.responsavel : l.responsavel === resp);
  const hoje0 = meiaNoite(0), amanha0 = meiaNoite(1), depois0 = meiaNoite(2), semana0 = meiaNoite(8), desde30 = meiaNoite(-30);
  const meus = CRM.followups.filter(f => doResp(f.lead));
  const pend = meus.filter(f => !f.feito_em).sort((a, b) => a.quando - b.quando);
  const feitosHoje = meus.filter(f => f.feito_em && f.feito_em >= hoje0).sort((a, b) => b.feito_em - a.feito_em);
  const feitas30 = meus.filter(f => f.feito_em && f.feito_em >= desde30).sort((a, b) => b.feito_em - a.feito_em);
  const G = { atrasados: [], hoje: [], amanha: [], proximos: [], depois: [] };
  for (const f of pend) G[f.quando < hoje0 ? 'atrasados' : f.quando < amanha0 ? 'hoje' : f.quando < depois0 ? 'amanha' : f.quando < semana0 ? 'proximos' : 'depois'].push(f);
  const atraso = f => Math.round((hoje0 - meiaNoite(0, f.quando)) / 86400000);
  const prio = f => (f.quando < hoje0 ? 1000 : 500) + (PESO_FU[f.lead.etapa] || 0) * 40 + Math.max(0, atraso(f)) * 10;
  G.atrasados.sort((a, b) => prio(b) - prio(a));
  const fila = [...G.atrasados, ...G.hoje].sort((a, b) => prio(b) - prio(a));

  // Sem próximo passo: leads que precisam de contato e não têm follow-up marcado (por qualquer pessoa)
  const comFu = new Set(CRM.followups.filter(f => !f.feito_em).map(f => f.lead_id));
  const limite = meiaNoite(2).getTime() - 60000; // amanhã às 23:59
  const sugestoes = CRM.leads.filter(l => FU_REGRAS[l.etapa] && !comFu.has(l.id) && doResp(l)).sort((a, b) => a.atualizado_em - b.atualizado_em).slice(0, 300).map(l => {
    const [prazo, motivo] = FU_REGRAS[l.etapa];
    const q = meiaNoite(prazo, l.atualizado_em); q.setHours(10);
    let quando = q.getTime();
    if (quando > limite) return null; // ainda não é hora
    if (quando < Date.now()) { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); quando = d.getTime(); } // já passou: daqui a pouco
    const parado = Math.floor(Math.max(0, Date.now() - l.atualizado_em) / 86400000);
    return { l, motivo, quando: new Date(quando), parado, nota: (ATENCAO.includes(l.etapa) ? 1000 : 0) + parado };
  }).filter(Boolean).sort((a, b) => b.nota - a.nota);

  // feitos no dia certo: dos que venceram nos últimos 30 dias, quantos foram feitos até o dia marcado
  const vencidos = meus.filter(f => f.quando >= desde30 && f.quando < hoje0);
  const emDia = vencidos.filter(f => f.feito_em && diaLocal(f.feito_em) <= diaLocal(f.quando)).length;
  const pctEmDia = vencidos.length ? Math.round(emDia * 100 / vencidos.length) : null;

  // ---------- peças das linhas e dos cartões ----------
  const busca = (f, l) => esc(((l.nome || '') + ' ' + (f?.nota || '') + ' ' + (l.telefone || '') + ' ' + (l.empreendimento || '')).toLowerCase());
  const quando = f => { // [classe, texto principal, texto pequeno]
    if (f.feito_em) return ['ok', f.feito_em >= hoje0 ? 'Feito às ' + hm(f.feito_em) : 'Feito ' + dataCurta(f.feito_em), f.feito_em >= hoje0 ? '' : hm(f.feito_em)];
    const d = atraso(f);
    if (d > 0) return ['atr', 'há ' + plural(d, 'dia', 'dias'), 'venceu ' + dm(f.quando)];
    if (d === 0) return ['hj', 'Hoje, ' + hm(f.quando), ''];
    if (d === -1) return ['', 'Amanhã, ' + hm(f.quando), ''];
    return ['', DIAS_SEM_FU[f.quando.getDay()].slice(0, 3) + ' ' + dm(f.quando), hm(f.quando)];
  };
  const avResp = n => n ? `<span class="fz-av" title="${esc(n)}">${esc(iniciais(n).toUpperCase())}</span>` : '<span class="fz-av vazio" title="Sem responsável">—</span>';
  const waLink = l => l.telefone && !l.nao_contatar
    ? `<a class="fz-wa" href="${esc(wa(l.telefone))}" target="_blank" rel="noopener" title="Chamar no WhatsApp" aria-label="Chamar ${esc(l.nome || 'o lead')} no WhatsApp">${ico('whats')}</a>` : '<span class="fz-wa vazio"></span>';
  const avLead = l => `<i style="--c:${cor(l.etapa)}">${esc((iniciais(l.nome) || '?').toUpperCase())}</i>`;
  const leadCel = l => `<button type="button" class="fu-lead" data-abrir-lead="${l.id}" title="Abrir a ficha">${avLead(l)}<span><b>${esc(l.nome || 'Sem nome')}</b><small>${esc([l.empreendimento, l.valor ? moedaCurta(l.valor) : ''].filter(Boolean).join(' · '))}</small></span></button>`;
  const etapaChip = l => `<span class="chip etapa" style="--c:${cor(l.etapa)}">${esc(nomeEtapa(l.etapa))}</span>`;

  // uma linha da lista
  const linha = (f, extra = false) => {
    const l = f.lead, [c, q, q2] = quando(f), feita = !!f.feito_em;
    const aberto = !feita && fuAb && fuAb.id === f.id;
    return `<li class="tarefa fu-l${feita ? ' feitas' : ''}${c === 'atr' ? ' atr' : ''}${extra ? ' extra' : ''}${aberto ? ' expandida' : ''}" data-id="${f.id}" data-busca="${busca(f, l)}">
      <div class="t-fundo"><span class="sw-feito">${feita ? '' : '✓ Feito'}</span><span class="sw-botoes">${feita ? '' : '<button type="button" class="sw-adiar" data-acao="adiar">+1 dia</button>'}<button type="button" class="sw-excluir" data-acao="excluir">Excluir</button></span></div>
      <div class="t-frente">
        <button class="circulo${feita ? ' feito' : ''}" type="button" ${feita ? 'disabled' : 'data-acao="concluir"'} title="${feita ? 'Feito' : 'Marcar como feito'}" aria-label="${feita ? 'Feito' : 'Marcar como feito'}">${feita ? '✓' : ''}</button>
        ${leadCel(l)}
        <span class="fu-tt">${feita && (f.resultado || f.relato) ? `<s>${esc(f.nota || 'Entrar em contato')}</s><small class="fu-relato">${esc([f.resultado, f.relato].filter(Boolean).join(' · '))}</small>` : esc(f.nota || 'Entrar em contato')}</span>
        <span class="fu-et">${etapaChip(l)}</span>
        <span class="fu-canal">${esc(f.canal || '—')}</span>
        <span class="fu-q ${c}"><b>${q}</b>${q2 ? `<small>${q2}</small>` : ''}</span>
        ${avResp(l.responsavel)}${feita ? '<span class="fz-wa vazio"></span>' : waLink(l)}
        <span class="fu-acoes">${feita ? '' : '<button type="button" class="mini" data-acao="adiar" title="Passar para amanhã">+1 dia</button>'}<button type="button" class="lixo" data-acao="excluir" title="Excluir" aria-label="Excluir">${ico('lixo')}</button></span>
      </div>
      ${aberto ? painelFu(f) : ''}
    </li>`;
  };
  // uma linha de "Sem próximo passo": o botão marca o contato sugerido
  const linhaSug = (s, extra) => {
    const l = s.l, quandoTxt = diaLocal(s.quando) === diaLocal(new Date()) ? 'hoje' : 'amanhã';
    return `<li class="tarefa fu-l sug${extra ? ' extra' : ''}" data-busca="${busca({ nota: s.motivo }, l)}" data-lead="${l.id}" data-nota="${esc(s.motivo)}">
      <div class="t-frente">
        <span class="fu-sem" title="Sem contato marcado">${ico('relogio')}</span>
        ${leadCel(l)}
        <span class="fu-tt">${esc(s.motivo)}</span>
        <span class="fu-et">${etapaChip(l)}</span>
        <span class="fu-canal">—</span>
        <span class="fu-q fu-q-sug"><b>${s.parado ? 'parado há ' + plural(s.parado, 'dia', 'dias') : 'sem contato marcado'}</b></span>
        ${avResp(l.responsavel)}${waLink(l)}
        <span class="fu-acoes sempre"><button class="mini fu-agendar" type="button" data-acao="sugestao" data-lead="${l.id}" data-quando="${s.quando.toISOString()}" data-nota="${esc(s.motivo)}" title="Agendar para ${esc(fuQuando(s.quando))}">Agendar ${quandoTxt}</button></span>
      </div>
    </li>`;
  };
  // um grupo da lista (abre e fecha); longos mostram os primeiros e um "ver mais"
  const grupo = (chave, titulo, cls, lista, desenhar) => {
    if (!lista.length) return '';
    const max = limiteListaFu(), fechado = fuFechados.has(chave), corta = lista.length > max, aberto = fuVerMais.has('l-' + chave);
    return `<section class="fu-g ${cls}${fechado ? ' fechado' : ''}${aberto ? ' aberta' : ''}" data-grupo="${chave}">
      <button type="button" class="fu-gt" aria-expanded="${!fechado}"><i></i><span>${titulo}</span><em>${lista.length}</em>${svgFu(IC_FU.baixo, 15)}</button>
      <ul class="tarefas fu-rows">${lista.map((x, i) => desenhar(x, corta && i >= max)).join('')}</ul>
      ${corta ? botaoMais('l-' + chave, lista.length - max, aberto) : ''}
    </section>`;
  };
  const cabTabela = `<div class="fu-cab" aria-hidden="true"><span></span><span>Lead</span><span>O que fazer</span><span>Etapa</span><span class="c-canal">Canal</span><span>Quando</span><span>Resp.</span><span></span><span></span></div>`;
  const porHora = lista => lista.slice().sort((a, b) => a.quando - b.quando);

  // um cartão do quadro (a coluna já diz o dia, então o rodapé mostra só a hora ou o atraso)
  const cartao = (f, extra) => {
    const l = f.lead, feita = !!f.feito_em, d = atraso(f);
    const [c, q] = feita ? ['ok', hm(f.feito_em)] : d > 0 ? ['atr', 'há ' + plural(d, 'dia', 'dias')] : d === 0 ? ['hj', hm(f.quando)] : d === -1 ? ['', hm(f.quando)]
      : ['', f.quando < semana0 ? DIAS_SEM_FU[f.quando.getDay()].slice(0, 3) + ' ' + f.quando.getDate() : dm(f.quando)];
    const aberto = !feita && fuAb && fuAb.id === f.id;
    return `<div class="fk${c === 'atr' ? ' atr' : ''}${feita ? ' feita' : ''}${extra ? ' extra' : ''}${aberto ? ' expandida' : ''}" data-id="${f.id}" data-busca="${busca(f, l)}"${feita || aberto ? '' : ' draggable="true"'}>
      <div class="fk-top"><button type="button" class="fk-lead" data-abrir-lead="${l.id}" title="Abrir a ficha">${avLead(l)}<span>${esc(l.nome || 'Sem nome')}</span></button>
        <button class="circulo${feita ? ' feito' : ''}" type="button" ${feita ? 'disabled' : 'data-acao="concluir"'} title="${feita ? 'Feito' : 'Marcar como feito'}" aria-label="${feita ? 'Feito' : 'Marcar como feito'}">${feita ? '✓' : ''}</button></div>
      <p class="fk-tt">${esc(f.nota || 'Entrar em contato')}</p>
      ${feita && (f.resultado || f.relato) ? `<p class="fk-relato">${esc([f.resultado, f.relato].filter(Boolean).join(' · '))}</p>` : ''}
      ${feita ? '' : `<div class="fk-meta">${etapaChip(l)}<span>${esc(f.canal || '')}</span>${l.valor ? `<span>${esc(moedaCurta(l.valor))}</span>` : ''}</div>`}
      <div class="fk-pe"><span class="fz ${c}">${feita ? svgFu(IC_FU.check, 13) : c === 'atr' ? ico('calendario') : ico('relogio')}${q}</span><span class="fk-pe-d">${feita ? '' : waLink(l)}${avResp(l.responsavel)}</span></div>
      ${aberto ? painelFu(f) : ''}
    </div>`;
  };
  const coluna = (chave, titulo, corCol, lista, alvo, vazio) => {
    const corta = lista.length > LIMITE_QUADRO_FU, aberto = fuVerMais.has('k-' + chave);
    return `<section class="fk-col" style="--c:${corCol}"${alvo ? ` data-alvo="${chave}"` : ''}>
      <header><i></i><b>${titulo}</b><em>${lista.length}</em></header>
      <div class="fk-itens${aberto ? ' aberta' : ''}">${lista.length ? lista.map((f, i) => cartao(f, corta && i >= LIMITE_QUADRO_FU)).join('') : `<p class="fk-vazio">${vazio}</p>`}</div>
      ${corta ? botaoMais('k-' + chave, lista.length - LIMITE_QUADRO_FU, aberto) : ''}
    </section>`;
  };

  // ---------- Faça agora e Seu dia ----------
  const top = fila[0], prox = G.amanha[0] || G.proximos[0] || G.depois[0];
  const faca = top ? (() => {
    const l = top.lead, d = atraso(top);
    return `<section class="faca" data-id="${top.id}">
      <div class="faca-topo"><span class="faca-ico">${svgFu(IC_FU.alvo, 19)}</span><h2>Faça agora</h2><span class="fp">1 de ${fila.length} na fila</span></div>
      <div><p class="faca-nome">${esc(top.nota || 'Entrar em contato')}</p>
        <p class="faca-meta"><button type="button" class="faca-lead" data-abrir-lead="${l.id}">${esc(l.nome || 'Sem nome')}</button> · ${esc(nomeEtapa(l.etapa))}${l.valor ? ' · ' + esc(moedaCurta(l.valor)) : ''}${l.empreendimento ? ' · ' + esc(l.empreendimento) : ''}</p></div>
      <div class="faca-tags"><span class="fp ${d > 0 ? 'alerta' : 'hoje'}">${d > 0 ? 'Atrasado ' + plural(d, 'dia', 'dias') : 'Hoje, ' + hm(top.quando)}</span>${top.canal ? `<span class="fp">${esc(top.canal)}</span>` : ''}${l.temperatura ? `<span class="fp">${esc(TEMPERATURAS[l.temperatura] || '')}</span>` : ''}${l.responsavel ? `<span class="fp">${esc(l.responsavel)}</span>` : ''}</div>
      <p class="faca-pq"><b>Por que primeiro:</b> ${esc(MOTIVO_FU[l.etapa] || 'É o contato mais atrasado.')}</p>
      ${fila.length > 1 ? `<div class="faca-fila"><p>Depois, na fila</p>${fila.slice(1, 4).map(f => `<button type="button" data-abrir-lead="${f.lead.id}"><span class="${f.quando < hoje0 ? 'atr' : 'hj'}">${f.quando < hoje0 ? 'há ' + plural(atraso(f), 'dia', 'dias') : hm(f.quando)}</span><b>${esc(f.nota || 'Entrar em contato')}</b><small>${esc(f.lead.nome || '')}</small></button>`).join('')}</div>` : ''}
      <div class="faca-acts">${l.telefone && !l.nao_contatar ? `<a class="fb lime" href="${esc(wa(l.telefone))}" target="_blank" rel="noopener">${ico('whats')}Chamar no WhatsApp</a>` : ''}
        <button class="fb" type="button" data-acao="concluir">${svgFu(IC_FU.check, 15)}Feito</button>
        <button class="fb ghost" type="button" data-acao="adiar">Adiar para amanhã</button></div>
      ${fuAb && fuAb.id === top.id ? painelFu(top) : ''}
    </section>`;
  })() : `<section class="faca vazio">
      <div class="faca-topo"><span class="faca-ico">${svgFu(IC_FU.check, 19)}</span><h2>Faça agora</h2></div>
      <div><p class="faca-nome">Nada atrasado nem para hoje.</p>
        <p class="faca-meta">${prox ? `Próximo contato: ${esc(fuQuando(prox.quando))} · ${esc(prox.lead.nome || '')}` : 'Nenhum contato marcado.'}${sugestoes.length ? ` ${plural(sugestoes.length, 'lead está', 'leads estão')} sem próximo passo.` : ''}</p></div>
      <div class="faca-acts"><button class="fb lime" type="button" id="novo-fu-faca">${ico('mais1')}Novo follow-up</button></div>
    </section>`;
  const devidos = G.atrasados.length + G.hoje.length, feitoN = feitosHoje.length, totalDia = devidos + feitoN, C = 2 * Math.PI * 44;
  const seuDia = `<section class="card seu-dia">
      <div class="card-topo"><h2>${resp && resp !== '-' ? 'Dia de ' + esc(resp.split(' ')[0]) : 'Seu dia'}</h2></div>
      <div class="sd-topo">
        <div class="sd-anel" role="img" aria-label="${feitoN} de ${totalDia} contatos de hoje feitos"><svg viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="44" class="sd-trilho"/>${feitoN ? `<circle cx="52" cy="52" r="44" class="sd-arco" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${(C * (1 - feitoN / totalDia)).toFixed(1)}"/>` : ''}</svg><b>${feitoN}/${totalDia}</b></div>
        <div><b>${totalDia ? (devidos ? `${plural(feitoN, 'contato feito', 'contatos feitos')} de ${totalDia}` : 'Tudo feito hoje') : 'Nada para hoje'}</b>
          <p>${devidos ? `Faltam ${plural(devidos, 'contato', 'contatos')} para fechar o dia (atrasados e os de hoje).` : 'Nenhum contato atrasado nem para hoje.'}</p></div>
      </div>
      <div class="dia-l"><i style="background:var(--coral)"></i>Atrasados<b class="${G.atrasados.length ? 'atr' : ''}">${G.atrasados.length}</b></div>
      <div class="dia-l"><i style="background:#D69E2E"></i>Para hoje<b>${G.hoje.length}</b></div>
      <div class="dia-l"><i style="background:var(--apagado)"></i>Amanhã<b>${G.amanha.length}</b></div>
      <div class="dia-l"><i style="background:#8B5CF6"></i>Sem próximo passo<b>${sugestoes.length}</b></div>
      <div class="dia-feitos"><p>Feitos hoje <span>${feitoN}</span></p>${feitosHoje.slice(0, 4).map(f => `<div><span class="ok-bola">${svgFu(IC_FU.check, 11)}</span><s>${esc(f.nota || 'Contato')}</s><small>${esc((f.lead.nome || '').split(' ')[0])}</small></div>`).join('')}
        ${pctEmDia !== null ? `<p class="sd-certo">${pctEmDia}% feitos no dia certo nos últimos 30 dias</p>` : ''}</div>
    </section>`;

  // ---------- lista, quadro ou concluídos ----------
  let corpo;
  if (concluidas) {
    corpo = feitas30.length ? `<div class="fu-tab"><div class="fu-corpo">${cabTabela}${grupo('concluidos', 'Feitos nos últimos 30 dias', 'g-ok', feitas30, linha)}</div></div>`
      : '<p class="vazio fu-vazio">Nenhum follow-up concluído nos últimos 30 dias.</p>';
  } else if (vista === 'quadro') {
    corpo = `<div class="fk-cols">
      ${coluna('atrasados', 'Atrasados', 'var(--coral)', G.atrasados, false, 'Nada atrasado.')}
      ${coluna('hoje', 'Hoje', '#D69E2E', porHora(G.hoje), true, 'Solte aqui para hoje.')}
      ${coluna('amanha', 'Amanhã', 'var(--apagado)', porHora(G.amanha), true, 'Solte aqui para amanhã.')}
      ${coluna('proximos', 'Próximos dias', 'var(--apagado)', porHora([...G.proximos, ...G.depois]), true, 'Nada marcado.')}
      ${coluna('feitos', 'Feitos hoje', '#8FBF3A', feitosHoje, true, 'Solte aqui para marcar como feito.')}
    </div>`;
  } else {
    const grupos = grupo('atrasados', 'Atrasados', 'g-atr', G.atrasados, linha) + grupo('hoje', 'Hoje', 'g-hj', porHora(G.hoje), linha)
      + grupo('amanha', 'Amanhã', '', porHora(G.amanha), linha) + grupo('proximos', 'Próximos 7 dias', '', porHora(G.proximos), linha)
      + grupo('depois', 'Mais adiante', '', porHora(G.depois), linha) + grupo('sem', 'Sem próximo passo', 'g-sem', sugestoes, linhaSug)
      + grupo('feitos', 'Feitos hoje', 'g-ok', feitosHoje, linha);
    corpo = grupos ? `<div class="fu-tab"><div class="fu-corpo">${cabTabela}${grupos}</div></div>` : `<p class="vazio fu-vazio">${ico('ok')} Nenhum follow-up marcado. Use o botão "Novo follow-up" para marcar o primeiro contato.</p>`;
  }
  const respOpcoes = listaResponsaveis();

  main.innerHTML = `
<header class="pg-topo">
  <div>
    <p class="eyebrow">Agenda de contatos</p>
    <h1>Follow-ups</h1>
    <p class="sub"><b>${plural(pend.length, 'contato em aberto', 'contatos em aberto')}</b>${G.atrasados.length ? ` · <span class="fu-atr">${plural(G.atrasados.length, 'atrasado', 'atrasados')}</span>` : ''} · ${G.hoje.length} para hoje${sugestoes.length ? ` · ${plural(sugestoes.length, 'lead', 'leads')} sem próximo passo` : ''}</p>
  </div>
  <div class="ferramentas">
    <select id="filtro-resp" class="fu-resp" aria-label="Responsável"><option value="">Todos os corretores</option>${respOpcoes.map(r => `<option${r === resp ? ' selected' : ''}>${esc(r)}</option>`).join('')}<option value="-"${resp === '-' ? ' selected' : ''}>Sem responsável</option></select>
    <button class="btn" type="button" id="novo-fu">${ico('mais1')}Novo follow-up</button>
  </div>
</header>

<div class="fu-l1">${faca}${seuDia}</div>

<section class="card fu-lista">
  <div class="fu-hdr">
    <div><h2>${concluidas ? 'Concluídos nos últimos 30 dias' : 'Follow-ups'}</h2>
      <p>${concluidas ? `<a href="${esc('followups.html' + (resp ? '?resp=' + encodeURIComponent(resp) : ''))}">← Voltar para a agenda</a>` : vista === 'quadro' ? 'Arraste o cartão para remarcar o contato ou para "Feitos hoje".' : 'Atrasados primeiro, depois hoje e os próximos dias. Toque na tarefa para registrar como foi e concluir.'}</p></div>
    <div class="fu-tools">
      <label class="busca">${ico('busca')}<input id="filtro-busca" placeholder="Buscar lead ou tarefa" aria-label="Buscar lead ou tarefa" autocomplete="off"></label>
      ${concluidas ? '' : `<nav class="seg fu-vista" aria-label="Ver como"><button type="button" data-vista-fu="lista" class="${vista === 'lista' ? 'on' : ''}" aria-pressed="${vista === 'lista'}">${svgFu(IC_FU.lista, 15)}Lista</button><button type="button" data-vista-fu="quadro" class="${vista === 'quadro' ? 'on' : ''}" aria-pressed="${vista === 'quadro'}">${ico('quadro')}Quadro</button></nav>
      <a class="fu-link" href="${esc('?aba=concluidas' + (resp ? '&resp=' + encodeURIComponent(resp) : ''))}">Concluídos</a>`}
    </div>
  </div>
  ${corpo}
  <p class="vazio fu-vazio" id="sem-resultado" hidden>Nada encontrado com essa busca.</p>
</section>`;

  montarJanelasFu();
  $('#novo-fu').addEventListener('click', () => abrirAgendar());
  $('#novo-fu-faca')?.addEventListener('click', () => abrirAgendar());
  $('#filtro-resp').addEventListener('change', e => {
    const q = new URLSearchParams(); if (concluidas) q.set('aba', 'concluidas'); if (e.target.value) q.set('resp', e.target.value);
    ir('followups.html' + (q.toString() ? '?' + q : ''), { quieto: true });
  });
  ligarFiltros();

  // veio de outra tela com ?lead=ID: já abre o agendamento com o lead escolhido
  const pedido = CRM.porId.get(Number(new URLSearchParams(location.search).get('lead')));
  if (pedido) { history.replaceState(null, '', location.pathname); abrirAgendar({ rotulo: rotuloLead(pedido), nota: FU_REGRAS[pedido.etapa]?.[1] || '' }); }
} });

const rotuloLead = l => (l.nome || 'Sem nome') + (l.empreendimento ? ' · ' + l.empreendimento : '') + ' #' + l.id;
// Janelas de agendar e de "feito!": criadas uma vez, na primeira visita à tela
function montarJanelasFu() {
  if (dlgAgendar) return;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="dlg-agendar">
  <form id="form-agendar" method="dialog">
    <h3 id="ag-titulo">Novo follow-up</h3>
    <input type="hidden" name="id">
    <label id="ag-lead">Lead<input name="lead" list="lista-leads" placeholder="Digite o nome…" autocomplete="off"></label>
    <datalist id="lista-leads"></datalist>
    <label>Quando<input name="quando" type="datetime-local"></label>
    <div class="atalhos">
      <button type="button" data-atalho="0,18">Hoje 18h</button><button type="button" data-atalho="1,10">Amanhã 10h</button>
      <button type="button" data-atalho="3,10">Em 3 dias</button><button type="button" data-atalho="7,10">Em 1 semana</button>
    </div>
    <div class="duas">
      <label>Canal<select name="canal"><option>WhatsApp</option><option>Ligação</option><option>Instagram</option><option>E-mail</option><option>Visita</option></select></label>
      <label>O que fazer<input name="nota" placeholder="ex.: confirmar a visita"></label>
    </div>
    <div class="modal-acoes">
      <button type="button" class="btn-borda" id="ag-cancelar">Cancelar</button>
      <button type="button" class="btn" id="ag-salvar">Agendar</button>
    </div>
  </form>
</dialog>
`);
  dlgAgendar = $('#dlg-agendar'); fAg = $('#form-agendar');
  ligarAcoes();
}

// some com o item e atualiza números e gráficos
function sairEAtualizar(item) {
  item?.classList.add('saindo');
  setTimeout(() => atualizar(), 260);
}
const fuDe = id => CRM.followups.find(f => f.id === Number(id));
// o item (linha, cartão ou "Faça agora") de um botão
const itemFu = el => el.closest('.tarefa, .fk, .faca');

function abrirAgendar(lead) {
  fAg.reset();
  fAg.elements.id.value = '';
  $('#ag-titulo').textContent = 'Novo follow-up';
  $('#ag-lead').hidden = false;
  fAg.elements.lead.value = lead?.rotulo || '';
  fAg.elements.nota.value = lead?.nota || '';
  fAg.elements.quando.value = paraInput(daqui(1, 10));
  $('#lista-leads').innerHTML = CRM.leads.slice(0, 1000).map(l => `<option value="${esc(rotuloLead(l))}">`).join('');
  dlgAgendar.showModal();
  if (!lead) fAg.elements.lead.focus();
}
// Editar um follow-up já marcado (data, canal e o que fazer)
function abrirEditar(item) {
  const f = fuDe(item.dataset.id);
  if (!f) return;
  fAg.reset();
  fAg.elements.id.value = f.id;
  $('#ag-titulo').textContent = 'Editar follow-up';
  $('#ag-lead').hidden = true;
  fAg.elements.nota.value = f.nota || '';
  fAg.elements.quando.value = paraInput(f.quando);
  if (f.canal) fAg.elements.canal.value = f.canal;
  dlgAgendar.showModal();
}

async function salvarAgendar() {
  const quando = doInput(fAg.elements.quando.value);
  if (!quando) { alert('Escolha a data.'); return; }
  const base = { quando: quando.toISOString(), canal: fAg.elements.canal.value, nota: fAg.elements.nota.value };
  if (fAg.elements.id.value) {
    try { await enviar('fu_salvar', { id: Number(fAg.elements.id.value), ...base }); } catch (e) { return; }
  } else {
    const m = fAg.elements.lead.value.match(/#(\d+)$/);
    if (!m) { alert('Escolha um lead da lista (comece a digitar o nome).'); return; }
    try { await enviar('fu_salvar', { lead_id: Number(m[1]), ...base }); } catch (e) { return; }
  }
  dlgAgendar.close();
  window.aviso?.('Follow-up agendado ✓');
  atualizar();
}

// Remarcar para outro dia mantendo o horário (o quadro usa ao soltar o cartão numa coluna)
async function remarcarFu(id, dias) {
  const f = fuDe(id); if (!f || f.feito_em) return;
  const d = meiaNoite(dias); d.setHours(f.quando.getHours(), f.quando.getMinutes(), 0, 0);
  if (diaLocal(d) === diaLocal(f.quando)) return;
  try { await enviar('fu_adiar', { id: Number(id), quando: d.toISOString() }); } catch (e) { return; }
  window.aviso?.(dias === 0 ? 'Passou para hoje' : dias === 1 ? 'Passou para amanhã' : 'Remarcado para ' + fuQuando(d));
  atualizar();
}

// Ligado uma vez: botões das janelas, das linhas e dos cartões (por delegação, valem para o que for redesenhado)
function ligarAcoes() {
  $('#ag-cancelar').addEventListener('click', () => dlgAgendar.close());
  $('#ag-salvar').addEventListener('click', salvarAgendar);
  $$('[data-atalho]').forEach(b => b.addEventListener('click', () => {
    const [dias, hora] = b.dataset.atalho.split(',').map(Number);
    fAg.elements.quando.value = paraInput(daqui(dias, hora));
  }));

  document.addEventListener('click', async e => {
    if (telaAtual !== 'followups' || !e.target.closest('#tela')) return;
    // dentro do painel de concluir
    const painel = e.target.closest('.fu-painel');
    if (painel) {
      if (e.target.closest('[data-abrir-lead]') || !fuAb) return; // a ficha abre pelo lead.js
      if (e.target.closest('[data-cc-editar]')) { const it = painel.parentElement; fecharPainel(); abrirEditar(it); return; }
      const r = ccClique(e, fuAb, redesenharPainel);
      if (r === 'cancelar') fecharPainel();
      else if (r === 'salvar') salvarPainel(e.target.closest('button'), painel.parentElement);
      return;
    }
    // lista ou quadro
    const v = e.target.closest('[data-vista-fu]');
    if (v) { try { localStorage.setItem(CHAVE_VISTA_FU, v.dataset.vistaFu); } catch (x) {} mostrar({ quieto: true }); return; }
    // abrir e fechar um grupo da lista
    const gt = e.target.closest('.fu-gt');
    if (gt) { const s = gt.closest('.fu-g'), fechar = !s.classList.contains('fechado'); s.classList.toggle('fechado', fechar); gt.setAttribute('aria-expanded', String(!fechar)); fuFechados[fechar ? 'add' : 'delete'](s.dataset.grupo); return; }
    // ver mais
    const mais = e.target.closest('.fu-mais');
    if (mais) {
      const caixa = mais.closest('.fu-g') || mais.closest('.fk-col').querySelector('.fk-itens'), abrir = !caixa.classList.contains('aberta');
      caixa.classList.toggle('aberta', abrir); fuVerMais[abrir ? 'add' : 'delete'](mais.dataset.mais);
      mais.textContent = abrir ? 'Mostrar menos' : 'Ver mais ' + mais.dataset.resto; mais.setAttribute('aria-expanded', String(abrir));
      if (!abrir) (mais.closest('.fu-g') || mais.closest('.fk-col')).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    const b = e.target.closest('[data-acao]');
    if (b) {
      const item = itemFu(b), a = b.dataset.acao;
      if (a === 'concluir') { abrirPainel(item); return; }
      if (a === 'excluir' && !confirm('Excluir este follow-up?')) return;
      b.disabled = true;
      try {
        if (a === 'sugestao') await enviar('fu_salvar', { lead_id: Number(b.dataset.lead), quando: b.dataset.quando, canal: 'WhatsApp', nota: b.dataset.nota });
        else if (a === 'adiar') {
          // +1 dia: se já passou, vai para amanhã no mesmo horário
          const q = fuDe(item.dataset.id).quando, d = new Date(Math.max(meiaNoite(0, q), meiaNoite(0)));
          d.setDate(d.getDate() + 1); d.setHours(q.getHours(), q.getMinutes(), 0, 0);
          await enviar('fu_adiar', { id: Number(item.dataset.id), quando: d.toISOString() });
        } else await enviar('fu_excluir', { id: Number(item.dataset.id) });
      } catch (x) { b.disabled = false; return; }
      window.aviso?.({ adiar: 'Passou para amanhã', excluir: 'Excluído', sugestao: 'Follow-up agendado ✓' }[a] || 'Feito ✓');
      sairEAtualizar(item.classList.contains('faca') ? null : item);
      return;
    }
    if (e.target.closest('a, button, input, select, label')) return;
    // tocar na linha ou no cartão (fora dos botões) abre o painel de concluir; em "Sem próximo passo", o agendamento
    const li = e.target.closest('.tarefa');
    if (li) {
      if (li.classList.contains('aberta') || Date.now() - (li._deslizou || 0) < 400) return;
      if (li.classList.contains('sug')) { const l = CRM.porId.get(Number(li.dataset.lead)); if (l) abrirAgendar({ rotulo: rotuloLead(l), nota: li.dataset.nota }); return; }
      if (!li.classList.contains('feitas')) abrirPainel(li);
      return;
    }
    const card = e.target.closest('.fk:not(.feita)');
    if (card) abrirPainel(card);
  });

  // quadro: arrastar o cartão para outra coluna remarca (ou marca como feito)
  document.addEventListener('dragstart', e => {
    const card = e.target.closest?.('.fk[draggable="true"]');
    if (!card || telaAtual !== 'followups') return;
    fuArrastando = card; card.classList.add('drag');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.dataset.id); } catch (x) {}
  });
  document.addEventListener('dragend', () => { fuArrastando?.classList.remove('drag'); fuArrastando = null; $$('.fk-col.alvo').forEach(c => c.classList.remove('alvo')); });
  document.addEventListener('dragover', e => {
    const col = fuArrastando && e.target.closest?.('.fk-col[data-alvo]');
    if (!col) return;
    e.preventDefault();
    $$('.fk-col.alvo').forEach(c => { if (c !== col) c.classList.remove('alvo'); });
    col.classList.add('alvo');
  });
  document.addEventListener('drop', e => {
    const col = fuArrastando && e.target.closest?.('.fk-col[data-alvo]');
    if (!col) return;
    e.preventDefault();
    const card = fuArrastando, alvo = col.dataset.alvo;
    col.classList.remove('alvo');
    if (alvo === 'feitos') { abrirPainel(card); return; }
    remarcarFu(card.dataset.id, { hoje: 0, amanha: 1, proximos: 2 }[alvo]);
  });

  // painel de concluir: o que se digita fica guardado em fuAb; Esc fecha
  document.addEventListener('input', e => { if (fuAb && e.target.closest('.fu-painel')) ccInput(e, fuAb); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.closest?.('.fu-painel')) { e.preventDefault(); fecharPainel(); } });
}

// ---------- Concluir ali mesmo: o painel abre dentro da linha, do cartão ou do "Faça agora" ----------
// Mostra a tarefa, o último contato e as observações do lead; pede como foi e o que foi feito; o próximo follow-up é opcional.
function painelFu(f) {
  const l = f.lead;
  const ultimo = CRM.followups.filter(x => x.lead_id === l.id && x.feito_em && x.id !== f.id).sort((a, b) => b.feito_em - a.feito_em)[0];
  return `<div class="fu-painel" data-painel="${f.id}">
    <div class="fu-ctx">
      <div class="fu-ctx-t"><small>Tarefa</small><b>${esc(f.nota || 'Entrar em contato')}</b><span>${esc(f.canal || 'Contato')} · marcado para ${esc(fuQuando(f.quando).toLowerCase())}</span></div>
      ${ultimo ? `<div class="fu-ctx-u"><small>Último contato · ${esc(quandoFeito(ultimo.feito_em))}</small><p>${esc([ultimo.resultado, ultimo.relato || ultimo.nota].filter(Boolean).join(' · '))}</p></div>` : ''}
      ${l.notas ? `<div class="fu-ctx-obs"><small>Observações do lead</small><p>${esc(l.notas)}</p></div>` : ''}
      <div class="fu-ctx-b"><button type="button" class="mini" data-abrir-lead="${l.id}">Abrir ficha</button><button type="button" class="mini" data-cc-editar>Editar tarefa</button></div>
    </div>
    <div class="cc">${ccHtml(fuAb, fuAb.marcados)}</div>
  </div>`;
}
function abrirPainel(item) {
  const f = fuDe(item?.dataset.id);
  if (!f || f.feito_em) return;
  if (fuAb && fuAb.id === f.id) { fecharPainel(); return; } // tocar de novo fecha
  fecharPainel();
  // dias que já têm algo marcado com esse lead (outros follow-ups e a visita) ganham um pontinho
  const marcados = new Set(CRM.followups.filter(x => x.lead_id === f.lead_id && !x.feito_em && x.id !== f.id).map(x => diaLocal(x.quando)));
  if (f.lead.visita_em) marcados.add(diaLocal(f.lead.visita_em));
  fuAb = { id: f.id, marcados, ...novoConc('fu', f.lead.etapa) };
  item.classList.add('expandida');
  if (item.matches('.fk')) item.draggable = false;
  item.insertAdjacentHTML('beforeend', painelFu(f));
  const p = item.querySelector('.fu-painel');
  p.querySelector('.cc-relato')?.focus({ preventScroll: true });
  p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function fecharPainel() {
  $$('.fu-painel').forEach(p => {
    const it = p.parentElement;
    it.classList.remove('expandida');
    if (it.matches('.fk:not(.feita)')) it.draggable = true;
    p.remove();
  });
  fuAb = null;
}
const redesenharPainel = () => { const c = $('.fu-painel .cc'); if (c && fuAb) c.innerHTML = ccHtml(fuAb, fuAb.marcados); };
async function salvarPainel(b, item) {
  if (!fuAb) return;
  const f = fuDe(fuAb.id);
  if (!f) return;
  b.disabled = true;
  let r;
  try { r = await ccSalvar(fuAb, { fuId: f.id, leadId: f.lead_id }); } catch (e) { b.disabled = false; return; }
  if (r === false) { b.disabled = false; return; }
  fuAb = null;
  sairEAtualizar(item.classList.contains('faca') ? null : item);
}

// Busca na hora, sem redesenhar: esconde linhas e cartões que não batem (e os grupos que ficarem vazios)
function ligarFiltros() {
  const fBusca = $('#filtro-busca'), lista = $('.fu-lista');
  fBusca.addEventListener('input', () => {
    const q = fBusca.value.trim().toLowerCase();
    lista.classList.toggle('buscando', !!q);
    let algum = false;
    $$('[data-busca]', lista).forEach(el => { const ok = !q || el.dataset.busca.includes(q); el.hidden = !ok; if (ok) algum = true; });
    $$('.fu-g', lista).forEach(s => { s.hidden = !!q && !s.querySelector('[data-busca]:not([hidden])'); });
    $('#sem-resultado').hidden = algum || !$('[data-busca]', lista);
  });
}
