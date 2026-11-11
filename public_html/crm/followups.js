// Follow-ups: agenda de contatos (atrasados, hoje, próximos), sugestões de quem está sem próximo passo,
// gráfico da semana e as ações agendar, concluir, adiar e excluir
let dlgAgendar, fAg, dlgConcluir, concluindo = null;
const DIAS_SEM_FU = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

registrarTela('followups', { titulo: 'Follow-ups', desenhar(main) {
  const hoje0 = meiaNoite(0), amanha0 = meiaNoite(1), semana0 = meiaNoite(8);
  const concluidas = new URLSearchParams(location.search).get('aba') === 'concluidas';
  const pend = CRM.followups.filter(f => !f.feito_em).sort((a, b) => a.quando - b.quando);
  const desde30 = meiaNoite(-30);
  const feitas = CRM.followups.filter(f => f.feito_em && f.feito_em >= desde30).sort((a, b) => b.feito_em - a.feito_em);
  const GRUPOS = { atrasados: 'Atrasadas', hoje: 'Para hoje', proximos: 'Próximos 7 dias', depois: 'Mais adiante' };
  const grupos = { atrasados: [], hoje: [], proximos: [], depois: [] };
  for (const f of pend) grupos[f.quando < hoje0 ? 'atrasados' : f.quando < amanha0 ? 'hoje' : f.quando < semana0 ? 'proximos' : 'depois'].push(f);

  // Uma linha da lista de tarefas
  const linhaTarefa = (f, g) => {
    const l = f.lead, dias = Math.round((hoje0 - meiaNoite(0, f.quando)) / 86400000);
    const status = f.feito_em ? `<b class="ok">Feito ${esc(dataCurta(f.feito_em))}</b>`
      : g === 'atrasados' ? `<b class="atr">${dias}d atrasado</b>` : g === 'hoje' ? '<b class="hj">Hoje</b>' : `<b>${hm(f.quando)}</b>`;
    const busca = ((l.nome || '') + ' ' + (f.nota || '') + ' ' + (l.telefone || '')).toLowerCase();
    return `<li class="tarefa ${g}" data-id="${f.id}" data-busca="${esc(busca)}" data-resp="${esc(l.responsavel || '')}" style="--c:${cor(l.etapa)}">
      <div class="t-fundo">
        <span class="sw-feito">${f.feito_em ? '' : '✓ Feito'}</span>
        <span class="sw-botoes">${f.feito_em ? '' : '<button type="button" class="sw-adiar" data-acao="adiar">+1 dia</button>'}<button type="button" class="sw-excluir" data-acao="excluir">Excluir</button></span>
      </div>
      <div class="t-frente">
        <button class="circulo${f.feito_em ? ' feito' : ''}" type="button" ${f.feito_em ? 'disabled' : 'data-acao="concluir"'} title="Marcar como feito">${f.feito_em ? '✓' : ''}</button>
        <div class="t-txt">
          <p>${esc(f.nota || 'Entrar em contato')}</p>
          <small>${ico('estrela')}<button type="button" class="t-lead" data-abrir-lead="${l.id}">${esc((l.nome || 'Sem nome').toUpperCase())}</button>
            <span>${esc(nomeEtapa(l.etapa))}</span><span>${esc(l.telefone || '')}</span>
            ${l.telefone ? `<a class="t-wa" href="${esc(wa(l.telefone))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</small>
        </div>
        <div class="t-quando">${status}<small>${esc(dataLonga(f.quando))}</small></div>
        <span class="t-resp" title="${esc(l.responsavel || 'Sem responsável')}">${l.responsavel ? esc(iniciais(l.responsavel).toUpperCase()) : '—'}</span>
        ${f.feito_em ? '' : '<button class="mini" type="button" data-acao="editar">Editar</button>'}
        <button class="lixo" type="button" data-acao="excluir" title="Excluir">${ico('lixo')}</button>
      </div>
    </li>`;
  };

  // % feitos no dia certo (vencidos nos últimos 30 dias)
  const vencidos = CRM.followups.filter(f => f.quando >= desde30 && f.quando < hoje0);
  const emDia = vencidos.filter(f => f.feito_em && diaLocal(f.feito_em) <= diaLocal(f.quando)).length;
  const pctEmDia = vencidos.length ? Math.round(emDia * 100 / vencidos.length) : null;

  // Gráfico: 6 dias atrás até 7 dias à frente, feitos x pendentes por dia
  const agenda = {};
  for (let i = -6; i <= 7; i++) agenda[diaLocal(meiaNoite(i))] = { feito: 0, pend: 0 };
  for (const f of CRM.followups) { const dia = diaLocal(f.quando); if (agenda[dia]) agenda[dia][f.feito_em ? 'feito' : 'pend']++; }
  const maxAg = Math.max(1, ...Object.values(agenda).map(a => a.feito + a.pend));
  const hojeD = diaLocal(new Date());

  // ---------- Sugestões: leads que precisam de contato e não têm follow-up marcado ----------
  const comFu = new Set(pend.map(f => f.lead_id));
  const limite = meiaNoite(2).getTime() - 60000; // amanhã às 23:59
  const sugestoes = CRM.leads.filter(l => FU_REGRAS[l.etapa] && !comFu.has(l.id)).sort((a, b) => a.atualizado_em - b.atualizado_em).slice(0, 300).map(l => {
    const [prazo, motivo] = FU_REGRAS[l.etapa];
    const q = meiaNoite(prazo, l.atualizado_em); q.setHours(10);
    let quando = q.getTime();
    if (quando > limite) return null; // ainda não é hora
    if (quando < Date.now()) { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); quando = d.getTime(); } // já passou: daqui a pouco
    const parado = Math.floor(Math.max(0, Date.now() - l.atualizado_em) / 86400000);
    // prioridade: etapas de atenção primeiro, depois quem está parado há mais tempo
    return { l, motivo, quando: new Date(quando), parado, nota: (ATENCAO.includes(l.etapa) ? 1000 : 0) + parado };
  }).filter(Boolean).sort((a, b) => b.nota - a.nota).slice(0, 10);
  const totalPend = pend.length;

  main.innerHTML = `
<header class="pg-topo">
  <div>
    <p class="eyebrow">Agenda de contatos</p>
    <h1>Follow-ups</h1>
    <p class="sub">Lead sem próximo passo é lead esfriando em silêncio — as sugestões ao lado mostram quem está assim.</p>
  </div>
  <div class="ferramentas">
    <button class="btn" type="button" id="novo-fu">${ico('mais1')}Novo follow-up</button>
  </div>
</header>

<div class="caixas">
  <a class="card caixa" href="#g-atrasados"><b data-conta class="${grupos.atrasados.length ? 'vermelho' : ''}">${grupos.atrasados.length}</b><small>Atrasadas</small></a>
  <a class="card caixa" href="#g-hoje"><b data-conta class="${grupos.hoje.length ? 'laranja' : ''}">${grupos.hoje.length}</b><small>Para hoje</small></a>
  <a class="card caixa" href="#g-proximos"><b data-conta>${grupos.proximos.length}</b><small>Próximos 7 dias</small></a>
  <div class="card caixa"><b data-conta>${totalPend}</b><small>Em aberto</small></div>
  <div class="card caixa"><b ${pctEmDia === null ? '' : 'data-conta'} class="${pctEmDia !== null && pctEmDia < 70 ? 'laranja' : ''}">${pctEmDia === null ? '—' : pctEmDia + '%'}</b><small>Feitas no dia certo</small></div>
</div>

<div class="grade-2 fu-grade">
  <section class="card">
    <div class="tarefas-barra">
      <nav class="seg">
        <a href="followups.html" class="${concluidas ? '' : 'on'}">Em aberto</a>
        <a href="?aba=concluidas" class="${concluidas ? 'on' : ''}">Concluídas</a>
      </nav>
      <label class="busca">${ico('busca')}<input id="filtro-busca" placeholder="Buscar tarefa ou lead"></label>
      <select id="filtro-resp"><option value="">Todos os responsáveis</option>${listaResponsaveis().map(r => `<option>${esc(r)}</option>`).join('')}</select>
    </div>
    ${concluidas
      ? (feitas.length ? `<h3 class="g-titulo">Concluídas nos últimos 30 dias <span>${feitas.length}</span></h3><ul class="tarefas">${feitas.map(f => linhaTarefa(f, 'feitas')).join('')}</ul>`
        : '<p class="vazio">Nenhum follow-up concluído nos últimos 30 dias.</p>')
      : (totalPend ? '' : '<p class="vazio">Nenhum follow-up marcado. Use as sugestões ao lado ou o botão "Novo follow-up".</p>') +
        Object.entries(GRUPOS).filter(([gk]) => grupos[gk].length).map(([gk, titulo]) =>
          `<h3 class="g-titulo g-${gk}" id="g-${gk}">${titulo} <span>${grupos[gk].length}</span></h3><ul class="tarefas">${grupos[gk].map(f => linhaTarefa(f, gk)).join('')}</ul>`).join('')}
    <p class="vazio" id="sem-resultado" hidden>Nada encontrado com esse filtro.</p>
  </section>

  <div class="coluna-dir">
    <section class="card">
      <div class="card-topo"><h2>Sugestões</h2><small class="ao-vivo">agora</small></div>
      ${sugestoes.length ? '' : `<p class="vazio">${ico('ok')} Todo mundo que precisa de contato já tem follow-up marcado.</p>`}
      <ul class="sug-lista">${sugestoes.map(s => `
        <li style="--c:${cor(s.l.etapa)}">
          <div><p><strong>${esc(s.l.nome || 'Sem nome')}</strong> ${ATENCAO.includes(s.l.etapa) ? tag('urgente') : ''}</p>
            <small><span class="chip etapa">${esc(nomeEtapa(s.l.etapa))}</span> ${esc(s.motivo)} · parado há ${plural(s.parado, 'dia', 'dias')}</small></div>
          <button class="btn-borda" type="button" data-acao="sugestao" data-lead="${s.l.id}" data-quando="${s.quando.toISOString()}" data-nota="${esc(s.motivo)}"
            title="Agendar para ${esc(fuQuando(s.quando))}">Agendar ${diaLocal(s.quando) === hojeD ? 'hoje' : 'amanhã'}</button>
        </li>`).join('')}
      </ul>
    </section>

    <section class="card">
      <div class="card-topo"><h2>Semana</h2><small class="legenda"><i class="ponto azul"></i>feitos <i class="ponto cinza"></i>pendentes</small></div>
      <div class="barras-ag">${Object.entries(agenda).map(([dia, a]) => {
        const t = a.feito + a.pend, d = new Date(dia + 'T12:00');
        return `<div class="ba${dia === hojeD ? ' hoje' : ''}" tabindex="0" data-dica="${plural(a.feito, 'feito', 'feitos')}, ${plural(a.pend, 'pendente', 'pendentes')}|${DIAS_SEM_FU[d.getDay()]}, ${dm(d)}${dia === hojeD ? ' (hoje)' : ''}">
          <div class="pilha" style="height:${Math.round(t * 100 / maxAg)}%"><i class="pend${dia < hojeD ? ' atras' : ''}" style="flex:${a.pend}"></i><i class="feito" style="flex:${a.feito}"></i></div>
          <small>${dia === hojeD ? 'hoje' : ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][d.getDay()]}</small>
        </div>`; }).join('')}
      </div>
      <p class="rodape-card">Do dia ${dm(meiaNoite(-6))} ao dia ${dm(meiaNoite(7))}. Vermelho: pendentes que já passaram.</p>
    </section>
  </div>
</div>`;

  montarJanelasFu();
  $('#novo-fu').addEventListener('click', () => abrirAgendar());
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
<dialog id="dlg-concluir">
  <h3>Follow-up feito!</h3>
  <p class="sub">Quer já marcar o próximo contato com esse lead?</p>
  <div class="atalhos grandes">
    <button type="button" data-proximo="1">Amanhã</button><button type="button" data-proximo="3">Em 3 dias</button>
    <button type="button" data-proximo="7">Em 1 semana</button><button type="button" data-proximo="0">Não precisa</button>
  </div>
</dialog>`);
  dlgAgendar = $('#dlg-agendar'); fAg = $('#form-agendar'); dlgConcluir = $('#dlg-concluir');
  ligarAcoes();
}

// some com o item e atualiza números e gráficos
function sairEAtualizar(item) {
  item?.classList.add('saindo');
  setTimeout(() => atualizar(), 260);
}
const fuDe = id => CRM.followups.find(f => f.id === Number(id));

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

// Ligado uma vez: botões das janelas e das linhas (por delegação, valem para as linhas redesenhadas)
function ligarAcoes() {
  $('#ag-cancelar').addEventListener('click', () => dlgAgendar.close());
  $('#ag-salvar').addEventListener('click', salvarAgendar);
  $$('[data-atalho]').forEach(b => b.addEventListener('click', () => {
    const [dias, hora] = b.dataset.atalho.split(',').map(Number);
    fAg.elements.quando.value = paraInput(daqui(dias, hora));
  }));

  // botões dos itens da agenda e das sugestões
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-acao]');
    if (!b || telaAtual !== 'followups' || !b.closest('#tela')) return;
    const item = b.closest('.tarefa, .sug-lista li'), a = b.dataset.acao;
    if (a === 'concluir') { concluindo = item; dlgConcluir.showModal(); return; }
    if (a === 'editar') { abrirEditar(item); return; }
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
    sairEAtualizar(item);
  });

  // tocar na linha (fora dos botões) abre a edição do follow-up
  document.addEventListener('click', e => {
    const frente = e.target.closest('.tarefa:not(.feitas) .t-frente');
    if (!frente || telaAtual !== 'followups' || e.target.closest('a, button')) return;
    const li = frente.closest('.tarefa');
    if (li.classList.contains('aberta') || Date.now() - (li._deslizou || 0) < 400) return;
    abrirEditar(li);
  });

  // "Feito!" → marcar o próximo contato ou não
  $$('[data-proximo]', dlgConcluir).forEach(b => b.addEventListener('click', async () => {
    const dias = +b.dataset.proximo;
    try { await enviar('fu_concluir', { id: Number(concluindo.dataset.id), proximo: dias ? daqui(dias, 10).toISOString() : '' }); } catch (e) { return; }
    window.aviso?.(dias ? 'Feito ✓ · próximo contato marcado' : 'Feito ✓');
    dlgConcluir.close();
    sairEAtualizar(concluindo);
  }));
  dlgConcluir.addEventListener('click', e => { if (e.target === dlgConcluir) dlgConcluir.close(); });
}

// Busca e filtro de responsável (na hora, sem redesenhar)
function ligarFiltros() {
  const fBusca = $('#filtro-busca'), fResp = $('#filtro-resp');
  const filtrar = () => {
    const q = fBusca.value.trim().toLowerCase(), r = fResp.value;
    let algum = false;
    $$('.tarefas').forEach(ul => {
      let visiveis = 0;
      ul.querySelectorAll('.tarefa').forEach(li => {
        const ok = (!q || li.dataset.busca.includes(q)) && (!r || li.dataset.resp === r);
        li.hidden = !ok; if (ok) visiveis++;
      });
      ul.hidden = !visiveis;
      ul.previousElementSibling.hidden = !visiveis; // título do grupo
      if (visiveis) algum = true;
    });
    $('#sem-resultado').hidden = algum || !$('.tarefa');
  };
  fBusca.addEventListener('input', filtrar);
  fResp.addEventListener('change', filtrar);
}
