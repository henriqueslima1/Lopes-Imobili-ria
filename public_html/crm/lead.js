// Ficha do lead: a janela que abre ao clicar num lead (CRM e página Leads) e a janela de novo/editar lead
let ficha, fichaC, modal, form;
let atual = null;       // dados do lead aberto (lead, followups, historico)
let aba = 'fu';
let mudou = false;      // se algo mudou, a página recarrega ao fechar a ficha
let modelo = 0;         // qual sugestão de mensagem mostrar
// (o estado de agendar, concluir e registrar fica em flAg, flAgAberto, flConc e flReg, mais abaixo)

// Muda a etapa (o servidor registra "Novo → Respondeu" no histórico)
// Virou venda: pergunta o valor e o corretor (é daqui que sai "quanto cada corretor vendeu" no hub).
// Mover vários de uma vez (página Leads) não pergunta: perguntar = false.
async function mudarEtapa(id, etapa, de, { perguntar = true } = {}) {
  const r = await enviar('etapa', { id: Number(id), etapa });
  window.aviso?.('Movido para ' + nomeEtapa(etapa));
  if (perguntar && etapa === 'venda' && de !== 'venda') await registrarVenda(Number(id));
  return r;
}

// Janela "Registrar a venda": valor e corretor responsável, já preenchidos com o que o lead tiver
function registrarVenda(id) {
  const l = (atual && atual.lead.id === id ? atual.lead : CRM.porId.get(id)) || {};
  const corretores = listaResponsaveis();
  let dlg = $('#dlg-venda');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-venda'; document.body.append(dlg); }
  dlg.innerHTML = `<form method="dialog" id="form-venda">
    <h3 tabindex="-1" autofocus>Registrar a venda</h3>
    <p class="aj-dica">${esc(l.nome || 'Lead')} virou venda. Com o valor e o corretor, a venda entra no resultado da equipe em Colaboradores.</p>
    <label>Valor da venda (R$)<input name="valor" inputmode="decimal" autocomplete="off" placeholder="ex.: 450.000" value="${l.valor != null ? esc(Number(l.valor).toLocaleString('pt-BR')) : ''}"></label>
    <label>Corretor responsável<select name="responsavel">${opcoes(corretores.includes(l.responsavel) || !l.responsavel ? corretores : [l.responsavel, ...corretores], l.responsavel, corretores.length ? 'Escolha o corretor' : 'Nenhum corretor cadastrado')}</select></label>
    ${corretores.length ? '' : `<p class="aj-dica">Cadastre os corretores na aba Colaboradores do hub para aparecerem aqui.</p>`}
    <p class="err" id="venda-erro" role="alert"></p>
    <div class="modal-acoes"><button type="button" class="btn-borda" data-v="depois">Agora não</button><button type="button" class="btn" data-v="salvar">Salvar venda</button></div>
  </form>`;
  return new Promise(fim => {
    dlg.onclose = () => fim();
    dlg.onclick = async e => {
      if (e.target === dlg) return dlg.close();
      const b = e.target.closest('[data-v]');
      if (!b) return;
      if (b.dataset.v === 'depois') return dlg.close();
      const f = $('#form-venda', dlg).elements, valor = f.valor.value.trim(), resp = f.responsavel.value;
      b.disabled = true;
      try {
        const antes = l.valor != null ? Number(l.valor).toLocaleString('pt-BR') : '';
        if (valor !== antes) await api('lead_campo', { id, campo: 'valor', valor });
        if (resp !== (l.responsavel || '')) await api('lead_campo', { id, campo: 'responsavel', valor: resp });
        dlg.close();
        window.aviso?.('Venda registrada ✓');
        if (atual && atual.lead.id === id) mudou = true;
      } catch (x) {
        if (x.status === 401) return telaEntrada();
        $('#venda-erro', dlg).textContent = x.message; b.disabled = false;
      }
    };
    dlg.showModal();
  });
}

async function abrirLead(id) {
  let r;
  try { r = await api('lead', { id: Number(id) }); } catch (e) {
    if (e.status === 401) return telaEntrada();
    alert(e.status === 404 ? 'Este lead não existe mais.' : 'Não consegui abrir este lead.'); return;
  }
  const novo = String(atual?.lead.id) !== String(id);
  atual = decorar(r);
  if (novo) { aba = 'fu'; modelo = 0; flZerar(); flTopo = 'tudo'; }
  desenhar();
  if (!ficha.open) { ficha.showModal(); rolarFicha(); }
}
// Rótulos de data prontos para a ficha ("22 de out, 14:30", "Amanhã, 10:00")
function decorar(r) {
  const l = r.lead, criado = new Date(l.criado_em), visita = l.visita_em ? new Date(l.visita_em) : null, hoje0 = meiaNoite(0);
  return {
    lead: { ...l, entrou: dataCurta(criado) + ', ' + hm(criado), visita_rotulo: visita ? fuQuando(visita) : '', wa: l.telefone ? wa(l.telefone) : '' },
    followups: r.followups.map(f => { const q = new Date(f.quando); return { ...f, rotulo: fuQuando(q), atrasado: !f.feito_em && q < hoje0 }; }),
    historico: r.historico.map(h => { const d = new Date(h.criado_em); return { ...h, quando: dmy(d) + ' ' + hm(d) }; })
  };
}
const recarregarFicha = () => { mudou = true; return abrirLead(atual.lead.id); };

async function salvarCampo(campo, valor) {
  try { await enviar('lead_campo', { id: atual.lead.id, campo, valor }); } catch (e) { return; }
  window.aviso?.('Salvo ✓');
  await recarregarFicha();
}

// ---------- Ficha de qualificação: seções e opções (troque os textos aqui) ----------
// seg = escolhe um (tocar de novo desmarca) · multi = escolhe vários · tags = lista digitada
const QUALI = [
  { titulo: 'O que procura', sub: 'Tudo é opcional — o que ficar em branco conta como "tanto faz". A finalidade decide o roteiro.', campos: [
    { k: 'finalidade', t: 'Finalidade', tipo: 'seg', ops: ['Morar', 'Investir', 'Morar e investir', 'Alugar'] },
    { k: 'tipos', t: 'Tipo de imóvel', tipo: 'multi', ops: ['Apartamento', 'Casa', 'Casa em condomínio', 'Cobertura', 'Kitnet / studio', 'Terreno', 'Sala comercial', 'Loja', 'Galpão', 'Chácara / sítio', 'Outro'] },
    { k: 'orcamento', t: 'Orçamento', tipo: 'faixa' },
    { k: 'quartos', t: 'Quartos, no mínimo', tipo: 'seg', ops: ['1+', '2+', '3+', '4+'], tantoFaz: true, meia: true },
    { k: 'vagas', t: 'Vagas, no mínimo', tipo: 'seg', ops: ['1+', '2+', '3+'], tantoFaz: true, meia: true },
    { k: 'area', t: 'Área mínima (m²)', tipo: 'num', ph: 'ex.: 70' },
    { k: 'estagio', t: 'Pronto ou na planta', tipo: 'seg', ops: ['Pronto', 'Na planta'], tantoFaz: true }
  ] },
  { titulo: 'Onde', campos: [
    { k: 'cidade', t: 'Cidade', tipo: 'texto' },
    { k: 'bairros', t: 'Bairros', tipo: 'tags', ph: 'Digite um bairro e tecle Enter' }
  ] },
  { titulo: 'Faz questão de', sub: 'Só o que pesa na decisão.', campos: [
    { k: 'extras', tipo: 'multi', ops: ['Piscina', 'Churrasqueira', 'Área gourmet', 'Varanda', 'Jardim', 'Quintal', 'Closet', 'Armários planejados', 'Ar-condicionado', 'Aquecedor solar', 'Lareira', 'Elevador', 'Portaria 24h', 'Academia', 'Playground', 'Salão de festas', 'Quadra esportiva', 'Interfone', 'Cerca elétrica', 'Câmeras de segurança', 'Mobiliado', 'Aceita pet'] }
  ] },
  { titulo: 'Pagamento', campos: [
    { k: 'pagamento', t: 'Como pretende pagar', tipo: 'multi', ops: ['Financiamento', 'À vista', 'FGTS', 'Minha Casa Minha Vida', 'Direto com a construtora', 'Consórcio', 'Permuta'] },
    { k: 'entrada', t: 'Entrada disponível', tipo: 'dinheiro', ph: 'ex.: 80 mil', semEntrada: true },
    { k: 'imovel_atual', t: 'Imóvel atual', tipo: 'seg', ops: ['Precisa vender para comprar', 'Quer dar na permuta', 'Não tem ou não depende'] }
  ] },
  { titulo: 'Prazo e decisão', campos: [
    { k: 'prazo', t: 'Prazo para comprar ou se mudar', tipo: 'seg', ops: ['Até 30 dias', '1 a 3 meses', '3 a 6 meses', 'Mais de 6 meses', 'Só pesquisando'] },
    { k: 'decide', t: 'Quem decide', tipo: 'seg', ops: ['Sozinho', 'Com cônjuge ou família', 'Com sócio'] },
    { k: 'corretor', t: 'Já tem corretor', tipo: 'seg', ops: ['Não', 'De outra imobiliária', 'Desta empresa'] },
    { k: 'obs', t: 'Observações', tipo: 'area', ph: 'Ex.: precisa de quarto no térreo, prefere andar alto…' }
  ] }
];

// Lê a ficha salva (aceita o formato antigo, mais simples)
function lerFicha(l) {
  let f = l.ficha || {};
  if (typeof f === 'string') { try { f = JSON.parse(f || '{}') || {}; } catch (e) { f = {}; } }
  f = { ...f };
  if (f.tipo && !f.tipos) f.tipos = [f.tipo];
  if (typeof f.pagamento === 'string') f.pagamento = [f.pagamento];
  if (f.regiao && !f.cidade) f.cidade = f.regiao;
  if (f.orcamento && !f.orc_ate) f.orc_texto = f.orcamento;
  return f;
}
const moeda = v => v ? 'R$ ' + String(v).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';

// Resumo da ficha em linhas "rótulo: valor"
function resumoFicha(f) {
  const linhas = [];
  const add = (t, v) => { if (Array.isArray(v) ? v.length : v) linhas.push([t, Array.isArray(v) ? v.join(', ') : v]); };
  add('Finalidade', f.finalidade);
  add('Tipo', f.tipos);
  add('Orçamento', f.orc_de || f.orc_ate ? [f.orc_de ? 'de ' + moeda(f.orc_de) : '', f.orc_ate ? 'até ' + moeda(f.orc_ate) : ''].filter(Boolean).join(' ') : f.orc_texto);
  add('Quartos', f.quartos); add('Vagas', f.vagas); add('Área mínima', f.area ? f.area + ' m²' : '');
  add('Pronto ou planta', f.estagio);
  add('Onde', [f.cidade, (f.bairros || []).join(', ')].filter(Boolean).join(' · '));
  add('Faz questão de', f.extras);
  add('Pagamento', f.pagamento);
  add('Entrada', f.sem_entrada ? 'Não tem entrada' : (f.entrada ? moeda(f.entrada) : ''));
  add('Imóvel atual', f.imovel_atual); add('Prazo', f.prazo); add('Quem decide', f.decide); add('Já tem corretor', f.corretor);
  add('Observações', f.obs);
  return linhas;
}

// Janela da ficha de qualificação (chips para tocar)
let quali = null, rascunho = {};
function abrirQuali() {
  rascunho = JSON.parse(JSON.stringify(lerFicha(atual.lead)));
  if (!quali) {
    quali = document.createElement('dialog');
    quali.className = 'quali';
    document.body.append(quali);
    quali.addEventListener('click', cliqueQuali);
    quali.addEventListener('input', e => {
      const k = e.target.dataset.q;
      if (!k) return;
      if (e.target.dataset.moeda !== undefined) e.target.value = moeda(e.target.value).replace('R$ ', '');
      rascunho[k] = e.target.dataset.moeda !== undefined ? e.target.value.replace(/\D/g, '') : e.target.value;
    });
    quali.addEventListener('keydown', e => { if (e.target.dataset.tag !== undefined && e.key === 'Enter') { e.preventDefault(); addBairro(); } });
  }
  desenharQuali();
  quali.showModal();
}
function chip(k, op, on, tipo) { return `<button type="button" class="q-chip ${on ? 'on' : ''}" data-k="${k}" data-op="${esc(op)}" data-tipo="${tipo}">${esc(op)}</button>`; }
function desenharQuali() {
  const r = rascunho;
  const campo = c => {
    const v = r[c.k];
    let html = '';
    if (c.tipo === 'seg') html = `<div class="q-seg">${c.tantoFaz ? chip(c.k, 'Tanto faz', !v, 'seg') : ''}${c.ops.map(o => chip(c.k, o, v === o, 'seg')).join('')}</div>`;
    if (c.tipo === 'multi') html = `<div class="q-chips">${c.ops.map(o => chip(c.k, o, (v || []).includes(o), 'multi')).join('')}</div>`;
    if (c.tipo === 'faixa') html = `<div class="q-faixa"><label class="q-din"><span>R$</span><input data-q="orc_de" data-moeda inputmode="numeric" placeholder="de" value="${esc(moeda(r.orc_de).replace('R$ ', ''))}"></label><span>até</span><label class="q-din"><span>R$</span><input data-q="orc_ate" data-moeda inputmode="numeric" placeholder="500.000" value="${esc(moeda(r.orc_ate).replace('R$ ', ''))}"></label></div>`;
    if (c.tipo === 'num') html = `<input class="q-curto" data-q="${c.k}" inputmode="numeric" placeholder="${esc(c.ph)}" value="${esc(v || '')}">`;
    if (c.tipo === 'texto') html = `<input class="q-curto" data-q="${c.k}" value="${esc(v || '')}">`;
    if (c.tipo === 'area') html = `<textarea data-q="${c.k}" rows="3" placeholder="${esc(c.ph)}">${esc(v || '')}</textarea>`;
    if (c.tipo === 'dinheiro') html = `<div class="q-linha"><label class="q-din larga"><span>R$</span><input data-q="${c.k}" data-moeda inputmode="numeric" placeholder="${esc(c.ph)}" value="${esc(moeda(v).replace('R$ ', ''))}" ${r.sem_entrada ? 'disabled' : ''}></label>
      <button type="button" class="q-chip ${r.sem_entrada ? 'on' : ''}" data-acao-q="sem-entrada">Não tem entrada</button></div>`;
    if (c.tipo === 'tags') html = `<div class="q-linha"><input data-tag placeholder="${esc(c.ph)}"><button type="button" class="btn-borda" data-acao-q="add-bairro">Adicionar</button></div>
      <div class="q-tags">${(r.bairros || []).map((b, i) => `<span class="q-tag">${esc(b)}<button type="button" data-acao-q="tirar-bairro" data-i="${i}" aria-label="Remover">×</button></span>`).join('')}</div>`;
    return `<div class="q-campo ${c.meia ? 'meia' : ''}">${c.t ? `<label class="q-rot">${c.t}</label>` : ''}${html}</div>`;
  };
  quali.innerHTML = `<header class="q-cab"><div><h3>Ficha de qualificação</h3><small>${esc(atual.lead.nome || '')}</small></div><button type="button" class="b-fechar" data-acao-q="fechar" aria-label="Fechar">×</button></header>
    <div class="q-corpo">${QUALI.map(s => `<section class="q-sec"><h4>${s.titulo}</h4>${s.sub ? `<p class="q-sub">${s.sub}</p>` : ''}<div class="q-grade">${s.campos.map(campo).join('')}</div></section>`).join('')}</div>
    <footer class="q-pe"><button type="button" class="btn-borda" data-acao-q="fechar">Cancelar</button><button type="button" class="btn" data-acao-q="salvar">Salvar</button></footer>`;
}
function addBairro() {
  const i = quali.querySelector('[data-tag]'), v = i.value.trim();
  if (!v) return;
  rascunho.bairros = [...(rascunho.bairros || []), v];
  const corpo = quali.querySelector('.q-corpo').scrollTop;
  desenharQuali();
  quali.querySelector('.q-corpo').scrollTop = corpo;
  quali.querySelector('[data-tag]').focus();
}
async function cliqueQuali(e) {
  if (e.target === quali) { quali.close(); return; }
  const c = e.target.closest('.q-chip[data-k]'), a = e.target.closest('[data-acao-q]')?.dataset.acaoQ;
  const corpo = quali.querySelector('.q-corpo'), rolagem = corpo?.scrollTop;
  if (c) {
    const { k, op, tipo } = c.dataset;
    if (tipo === 'seg') rascunho[k] = (op === 'Tanto faz' || rascunho[k] === op) ? '' : op;
    else { const s = new Set(rascunho[k] || []); s.has(op) ? s.delete(op) : s.add(op); rascunho[k] = [...s]; }
    if (typeof toqueVibrar === 'function') toqueVibrar();
  } else if (a === 'fechar') { quali.close(); return; }
  else if (a === 'add-bairro') { addBairro(); return; }
  else if (a === 'tirar-bairro') rascunho.bairros.splice(+e.target.closest('[data-i]').dataset.i, 1);
  else if (a === 'sem-entrada') { rascunho.sem_entrada = !rascunho.sem_entrada; if (rascunho.sem_entrada) rascunho.entrada = ''; }
  else if (a === 'salvar') {
    delete rascunho.orc_texto;
    const limpo = Object.fromEntries(Object.entries(rascunho).filter(([, v]) => Array.isArray(v) ? v.length : v));
    quali.close();
    await salvarCampo('ficha', JSON.stringify(limpo));
    return;
  } else return;
  desenharQuali();
  quali.querySelector('.q-corpo').scrollTop = rolagem;
}

// ---------- Escolher dia e hora (agenda da ficha e próximo contato ao concluir um follow-up) ----------
// Os 7 próximos dias em botões ("Outra" abre a folha de datas do ios.js) e os horários por turno ("Outro" também abre a folha)
const TURNOS = [['Manhã', [9, 10, 11]], ['Tarde', [14, 15, 16, 17]], ['Noite', [18, 19]]];
const SEMANA_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const horaCurta = d => d.getHours() + 'h' + (d.getMinutes() ? p2(d.getMinutes()) : '');
// "Hoje, 10h" · "Amanhã, 14h" · "Qua 19/11, 9h30"
function rotuloQuando(d) {
  if (!d) return '';
  const dia = diaLocal(d);
  return (dia === diaLocal(new Date()) ? 'Hoje' : dia === diaLocal(meiaNoite(1)) ? 'Amanhã' : SEMANA_CURTA[d.getDay()] + ' ' + dm(d)) + ', ' + horaCurta(d);
}
// q = { data: Date ou null }; marcados = dias (aaaa-mm-dd) que já têm algo marcado, ganham um pontinho
function quandoHtml(q, marcados = new Set()) {
  const d = q.data, dias = Array.from({ length: 7 }, (_, i) => meiaNoite(i));
  const naSemana = d && dias.some(x => diaLocal(x) === diaLocal(d));
  const horaOn = h => !!d && d.getHours() === h && d.getMinutes() === 0;
  const outraHora = !!d && !TURNOS.some(([, hs]) => hs.some(horaOn));
  return `<div class="qd-dias" role="group" aria-label="Dia">${dias.map((x, i) => {
    const on = !!d && diaLocal(x) === diaLocal(d);
    return `<button type="button" class="qd-dia${on ? ' on' : ''}" data-qd-dia="${i}" aria-pressed="${on}" aria-label="${i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : SEMANA_CURTA[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]}"><small>${i === 0 ? 'Hoje' : SEMANA_CURTA[x.getDay()]}</small><b>${x.getDate()}</b>${marcados.has(diaLocal(x)) ? '<i class="qd-pto"></i>' : ''}</button>`;
  }).join('')}<button type="button" class="qd-dia qd-outra${d && !naSemana ? ' on' : ''}" data-qd-outra aria-label="Escolher outra data">${d && !naSemana ? `<small>${SEMANA_CURTA[d.getDay()]}</small><b>${d.getDate()}/${d.getMonth() + 1}</b>` : `${ico('calendario')}<small>Outra</small>`}</button></div>
  <div class="qd-horas" role="group" aria-label="Horário">${TURNOS.map(([t, hs]) => `<div class="qd-turno"><span>${t}</span><div>${hs.map(h => `<button type="button" class="qd-hora${horaOn(h) ? ' on' : ''}" data-qd-hora="${h}" aria-pressed="${horaOn(h)}">${h}h</button>`).join('')}</div></div>`).join('')}
    <button type="button" class="qd-hora qd-outro${outraHora ? ' on' : ''}" data-qd-outra>${outraHora ? horaCurta(d) : 'Outro'}</button></div>`;
}
// Clique dentro do seletor: muda q.data e chama aoMudar; devolve false se o clique não era dele
let campoQuando = null;
function quandoClique(e, q, aoMudar) {
  const b = e.target.closest('[data-qd-dia], [data-qd-hora], [data-qd-outra]');
  if (!b) return false;
  if (b.dataset.qdDia !== undefined) {
    const x = meiaNoite(+b.dataset.qdDia);
    x.setHours(q.data ? q.data.getHours() : 10, q.data ? q.data.getMinutes() : 0, 0, 0);
    q.data = x;
  } else if (b.dataset.qdHora !== undefined) {
    const x = q.data ? new Date(q.data) : meiaNoite(1);
    x.setHours(+b.dataset.qdHora, 0, 0, 0);
    q.data = x;
  } else if (typeof abrirSeletor === 'function') {
    // "Outra data" / "Outro horário": a folha de dias e horários do ios.js, num campo escondido
    if (!campoQuando) { campoQuando = document.createElement('input'); campoQuando.type = 'hidden'; document.body.append(campoQuando); }
    campoQuando.value = q.data ? paraInput(q.data) : '';
    campoQuando.onchange = () => { const x = doInput(campoQuando.value); if (x) { q.data = x; aoMudar(); } };
    abrirSeletor(campoQuando);
    return true;
  }
  if (typeof toqueVibrar === 'function') toqueVibrar();
  aoMudar();
  return true;
}

// ---------- Como foi (concluir um follow-up ou uma visita) ----------
const RES_FU = ['Atendeu', 'Não atendeu', 'Respondeu no WhatsApp', 'Pediu para remarcar'];
const RES_VISITA = ['Visitou e gostou', 'Visitou, não gostou', 'Não compareceu', 'Remarcou'];
const classeRes = r => ['Atendeu', 'Respondeu no WhatsApp', 'Visitou e gostou'].includes(r) ? ' bom' : ['Não atendeu', 'Não compareceu', 'Visitou, não gostou'].includes(r) ? ' ruim' : '';
// "Hoje, 14:20" · "Ontem, 9:05" · "12 de nov, 10:45"
function quandoFeito(d) {
  const dia = diaLocal(d);
  return (dia === diaLocal(new Date()) ? 'Hoje' : dia === diaLocal(meiaNoite(-1)) ? 'Ontem' : dataCurta(d)) + ', ' + hm(d);
}
// Uma linha de "Feito" (ficha e histórico): quando, tipo, como foi, quem; a tarefa agendada e o que foi feito
const linhaFeito = r => `<li class="fl-r${r.marco ? ' marco' : ''}">
    <div class="fl-r1"><b>${quandoFeito(r.quando)}</b><span class="fl-r-tipo">${esc(r.tipo)}</span>${r.resultado ? `<span class="fl-r-res${classeRes(r.resultado)}">${esc(r.resultado)}</span>` : ''}${r.autor ? `<small>por ${esc(r.autor)}</small>` : ''}</div>
    ${r.tarefa ? `<p class="fl-r-tarefa">Tarefa: ${esc(r.tarefa)}</p>` : ''}${r.texto ? `<p>${esc(r.texto)}</p>` : ''}
  </li>`;

// ---------- Concluir na hora (ficha e tela de Follow-ups, sem abrir outra janela) ----------
// Como foi e o que foi feito (obrigatórios) e, se quiser, o próximo follow-up com dia e horário.
// st = { tipo: 'fu' | 'visita', res, relato, prox (marcar o próximo?), q: { data }, nota, etapa }
function novoConc(tipo, etapa) {
  const regra = FU_REGRAS[etapa];
  return { tipo, etapa, res: '', relato: '', prox: false, nota: '', q: { data: daqui(regra && regra[0] > 1 ? regra[0] : 1, 10) } };
}
const ccPronto = st => !!(st.res && st.relato.trim());
const ccAviso = st => !st.res ? 'Escolha como foi.' : !st.relato.trim() ? 'Escreva o que foi feito.' : st.prox ? '' : 'Sem próximo follow-up, o lead vai para "Sem próximo passo".';
const ccBotao = st => 'Concluir' + (st.prox && st.q.data ? ' e agendar · ' + rotuloQuando(st.q.data) : '');
function ccHtml(st, marcados = new Set()) {
  const ops = st.tipo === 'visita' ? RES_VISITA : RES_FU, dica = FU_REGRAS[st.etapa]?.[1] || 'retomar a conversa';
  return `<div class="cc-l"><span class="cc-lb">Como foi?</span>
      <div class="fl-res">${ops.map(o => `<button type="button" class="fl-res-b${st.res === o ? ' on' : ''}" data-cc-res="${esc(o)}" aria-pressed="${st.res === o}">${esc(o)}</button>`).join('')}</div></div>
    <textarea class="cc-relato" rows="2" aria-label="O que foi feito" placeholder="O que foi feito? Ex.: mandei as 3 opções, gostou da 2ª e quer visitar sábado.">${esc(st.relato)}</textarea>
    ${st.prox ? `<div class="cc-prox">
        <div class="cc-prox-cab"><span class="cc-lb">Próximo follow-up</span><button type="button" class="lnk" data-cc="sem-prox">não marcar</button></div>
        <div class="cc-quando">${quandoHtml(st.q, marcados)}</div>
        <input class="cc-nota" aria-label="O que fazer no próximo follow-up" placeholder="O que fazer? (ex.: ${esc(dica.toLowerCase())})" value="${esc(st.nota)}">
      </div>` : '<button type="button" class="cc-add" data-cc="prox">+ Marcar próximo follow-up</button>'}
    <div class="cc-pe"><span class="cc-aviso">${esc(ccAviso(st))}</span>
      <button type="button" class="mini" data-cc="cancelar">Cancelar</button>
      <button type="button" class="btn cc-ok" data-cc="salvar" ${ccPronto(st) ? '' : 'disabled'}>${svgL(IC_L.check, 'ico ico-s')}${esc(ccBotao(st))}</button></div>`;
}
// Clique dentro do painel: muda st e redesenha; devolve 'cancelar' ou 'salvar' para quem chamou (ou true se tratou, false se não era dele)
function ccClique(e, st, redesenhar) {
  if (e.target.closest('.cc-quando') && quandoClique(e, st.q, redesenhar)) return true;
  const r = e.target.closest('[data-cc-res]');
  if (r) {
    st.res = st.res === r.dataset.ccRes ? '' : r.dataset.ccRes;
    if (['Pediu para remarcar', 'Remarcou'].includes(st.res)) st.prox = true; // remarcar já pede a data
    redesenhar(); return true;
  }
  const a = e.target.closest('[data-cc]')?.dataset.cc;
  if (a === 'prox' || a === 'sem-prox') { st.prox = a === 'prox'; redesenhar(); if (st.prox) e.target.closest('.cc')?.querySelector('.cc-quando')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return true; }
  return a === 'cancelar' || a === 'salvar' ? a : false;
}
// Digitação: guarda em st e liga o botão sem redesenhar (o cursor não pula)
function ccInput(e, st) {
  const caixa = e.target.closest('.cc');
  if (!caixa) return false;
  if (e.target.matches('.cc-relato')) st.relato = e.target.value;
  else if (e.target.matches('.cc-nota')) st.nota = e.target.value;
  else return false;
  caixa.querySelector('.cc-ok').disabled = !ccPronto(st);
  caixa.querySelector('.cc-aviso').textContent = ccAviso(st);
  return true;
}
// Grava: conclui (follow-up ou visita) e, se marcado, agenda o próximo. Devolve a data do próximo (ou null); erro = já avisado
function ccValida(st) {
  if (!ccPronto(st)) return false;
  const d = st.prox ? st.q.data : null;
  if (st.prox && !d) { alert('Escolha o dia do próximo follow-up (ou toque em "não marcar").'); return false; }
  if (d && d < new Date(Date.now() - 5 * 60000)) { alert('O horário do próximo follow-up já passou. Escolha outro.'); return false; }
  return true;
}
async function ccSalvar(st, { fuId, leadId }) {
  if (!ccValida(st)) return false;
  const d = st.prox ? st.q.data : null;
  const corpo = { resultado: st.res, relato: st.relato.trim() }, nota = st.nota.trim() || FU_REGRAS[st.etapa]?.[1] || 'Entrar em contato';
  if (st.tipo === 'visita') {
    await enviar('visita_feita', { id: leadId, ...corpo });
    if (d) await enviar('fu_salvar', { lead_id: leadId, quando: d.toISOString(), canal: 'WhatsApp', nota });
  } else await enviar('fu_concluir', { id: fuId, ...corpo, proximo: d ? d.toISOString() : '', proximo_nota: d ? nota : '' });
  window.aviso?.(d ? 'Concluído ✓ · próximo follow-up ' + rotuloQuando(d) : 'Concluído ✓ · registrado');
  return d || null;
}

// ---------- Desenho da ficha ----------
const svgL = (d, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC_L = {
  check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  casa: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
  fone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', brilho: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z"/>',
  pino: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  baixo: '<path d="m6 9 6 6 6-6"/>', lapis: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'
};
const COR_PRIO = { alta: '#F59E0B', baixa: '#9C9A92' }, COR_TEMP = { quente: '#FF6369', morno: '#F59E0B', frio: '#60A5FA' };
const TIPO_REG = { ligacao: 'Ligação', whatsapp: 'WhatsApp', visita: 'Visita', nota: 'Anotação' };
const PH_REG = {
  ligacao: 'Como foi a ligação? (ex.: atendeu, quer ver opções de 3 quartos)', whatsapp: 'O que foi conversado no WhatsApp fora do CRM?',
  visita: 'Como foi a visita? O que o cliente achou?', nota: 'Escreva uma anotação…'
};
// O que perguntar na qualificação (conta "6 de 9" e mostra o que falta)
const CHAVES_QUALI = [['Finalidade', f => f.finalidade], ['Tipo de imóvel', f => (f.tipos || []).length], ['Orçamento', f => f.orc_de || f.orc_ate || f.orc_texto],
  ['Onde', f => f.cidade || (f.bairros || []).length], ['Pagamento', f => (f.pagamento || []).length], ['Entrada', f => f.entrada || f.sem_entrada],
  ['Prazo', f => f.prazo], ['Quem decide', f => f.decide], ['Imóvel atual', f => f.imovel_atual]];

// O que fica entre um desenho e outro da ficha (zera ao abrir outro lead)
let flAgAberto = false, flAg = null, flConc = null, flReg = null, flMenu = false, flTopo = false;
// Agendar começa no dia sugerido pela etapa (ex.: "Respondeu" → hoje, na próxima hora; depois das 19h vai para amanhã)
function novoAg(tipo = 'fu') {
  const regra = tipo === 'fu' ? FU_REGRAS[atual?.lead.etapa] : null;
  let d = regra ? daqui(regra[0], 10) : daqui(1, 10);
  if (regra && regra[0] === 0) { d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); if (d.getHours() > 19 || d.getHours() < 8) d = daqui(1, 10); }
  return { tipo, q: { data: d }, nota: '', remarcando: null };
}
function flZerar() {
  flAgAberto = false; flAg = novoAg();
  flConc = null; flReg = { tipo: 'ligacao', texto: '' }; flMenu = false;
}

// Agendados: follow-ups em aberto e a visita marcada, por data
function agendados() {
  const l = atual.lead, hoje0 = meiaNoite(0);
  const itens = atual.followups.filter(f => !f.feito_em).map(f => ({ chave: 'fu:' + f.id, id: f.id, tipo: 'fu', quando: new Date(f.quando), texto: f.nota || 'Entrar em contato', canal: f.canal }));
  if (l.visita_em) itens.push({ chave: 'visita', tipo: 'visita', quando: new Date(l.visita_em), texto: 'Visita' + (l.empreendimento ? ' · ' + l.empreendimento : '') });
  return itens.sort((a, b) => a.quando - b.quando).map(it => ({ ...it, atrasado: it.quando < hoje0 }));
}
// Feito: follow-ups concluídos e o que foi registrado à mão (ligação, WhatsApp, visita, anotação)
function feitos() {
  const fus = atual.followups.filter(f => f.feito_em).map(f => ({ quando: new Date(f.feito_em), tipo: 'Follow-up', resultado: f.resultado, autor: f.feito_por,
    tarefa: f.relato ? f.nota : '', texto: f.relato || f.nota || 'Follow-up feito' }));
  const hs = atual.historico.filter(h => TIPO_REG[h.tipo]).map(h => ({ quando: new Date(h.criado_em), tipo: TIPO_REG[h.tipo], resultado: h.resultado, autor: h.autor, texto: h.texto }));
  return [...fus, ...hs].sort((a, b) => b.quando - a.quando);
}
// dias que já têm algo marcado (pontinho no seletor de dia)
const diasMarcados = () => new Set(agendados().map(x => diaLocal(x.quando)));
const comValor = (lista, v) => v && !lista.includes(v) ? [...lista, v] : lista; // não perde um valor que não está na lista
const ABAS_FICHA = ['fu', 'visita', 'quali', 'historico'];

function desenhar() {
  if (!ABAS_FICHA.includes(aba)) aba = 'fu';
  const tipoAg = aba === 'visita' ? 'visita' : 'fu';
  if (!flAg || flAg.tipo !== tipoAg) flAg = novoAg(tipoAg); // depois de agendar, a sugestão segue a etapa nova
  const l = atual.lead;
  const ficha = lerFicha(l);
  const msgs = atual.historico.filter(h => h.tipo === 'msg').reverse();
  const posCaminho = CAMINHO.indexOf(l.etapa);
  const fechado = GANHOS.includes(l.etapa) ? 'ganho' : (PERDIDOS.includes(l.etapa) ? 'perdido' : '');
  const podeEnviar = !!l.wa && !l.nao_contatar;
  // redesenhar não pode jogar a pessoa para o topo (só ao abrir outro lead; trocar de aba volta ao topo da aba)
  const y = [fichaC.querySelector('.fl-esq')?.scrollTop || 0, fichaC.querySelector('.fl-corpo')?.scrollTop || 0, fichaC.scrollTop];
  if (flTopo) { y[0] = 0; y[1] = 0; }
  if (flTopo === 'tudo') y[2] = 0;
  flTopo = false;
  const pend = agendados(), fusAbertos = pend.filter(it => it.tipo === 'fu');
  const abas = [['fu', 'Follow-up', fusAbertos.length, fusAbertos.some(it => it.atrasado)], ['visita', 'Visita', l.visita_em ? 1 : 0], ['quali', 'Qualificação'], ['historico', 'Histórico']];
  const pill = (rotulo, campo, html, corDot) => `<label class="fl-pill"><span>${rotulo}</span>${corDot ? `<i style="background:${corDot}"></i>` : ''}<select data-campo="${campo}">${html}</select>${svgL(IC_L.baixo, 'ico fl-pill-seta')}</label>`;

  fichaC.innerHTML = `
  <header class="fl-cab">
    <div class="fl-topo">
      <span class="fl-av" aria-hidden="true">${esc((iniciais(l.nome) || '?').toUpperCase())}</span>
      <div class="fl-id">
        <div class="fl-l1">
          <div class="fl-nome"><h2>${esc(l.nome || 'Sem nome')}</h2>
            <button class="fl-valor" data-acao="valor">${l.valor ? dinheiro(l.valor) : 'Adicionar valor'} ${svgL(IC_L.lapis, 'ico fl-lapis')}</button>
            ${fechado ? `<span class="fl-fechado ${fechado}">${fechado === 'ganho' ? '✓ Ganho' : '✕ ' + esc(nomeEtapa(l.etapa))}</span>` : ''}</div>
          <div class="fl-botoes">
            <button class="fl-b" data-acao="editar">Editar</button>
            <div class="fl-mais">
              <button class="fl-ib" data-acao="mais" aria-label="Mais ações" aria-expanded="${flMenu}">${ico('mais')}</button>
              <div class="fl-menu"${flMenu ? '' : ' hidden'}>
                <button data-acao="naolead">Não é lead</button>
                <button class="perigo" data-acao="remover">Remover lead</button>
              </div>
            </div>
            <button class="fl-ib" data-acao="fechar" aria-label="Fechar" autofocus>${svgL(IC_L.x)}</button>
          </div>
        </div>
        <div class="fl-l2">
          <div class="fl-meta"><button class="fl-tel" data-acao="editar" title="Editar telefone">${esc(l.telefone || 'sem telefone')}</button><span>·</span><span>${esc(l.origem || 'Sem origem')}</span><span>·</span><span>entrou há ${tempoDesde(new Date(l.criado_em))}</span></div>
          <div class="fl-props">
            ${pill('Responsável', 'responsavel', opcoes(listaResponsaveis(), l.responsavel, 'Ninguém'))}
            ${pill('Prioridade', 'prioridade', opcoes(PRIORIDADES, l.prioridade || 'normal'), COR_PRIO[l.prioridade])}
            ${pill('Temperatura', 'temperatura', opcoes(TEMPERATURAS, l.temperatura, '—'), COR_TEMP[l.temperatura])}
            <label class="fl-nao"><input type="checkbox" data-campo="nao_contatar" ${l.nao_contatar ? 'checked' : ''}>Não contatar</label>
          </div>
        </div>
      </div>
    </div>
    <div class="fl-etapas">
      <div class="fl-caminho" role="group" aria-label="Etapa do lead">${CAMINHO.map((k, i) => `<button type="button" class="fl-passo${i < posCaminho ? ' feito' : ''}${k === l.etapa ? ' atual' : ''}" data-etapa="${k}" title="Mover para ${esc(nomeEtapa(k))}">${i < posCaminho ? svgL(IC_L.check, 'ico ico-s') : ''}<span>${esc(nomeEtapa(k))}</span></button>`).join('')}</div>
      <span class="fl-div" aria-hidden="true"></span>
      <button class="fl-fim ganho" data-acao="ganho">${svgL(IC_L.check, 'ico ico-s')}Ganho</button>
      <button class="fl-fim perdido" data-acao="perdido">${svgL(IC_L.x, 'ico ico-s')}Perdido</button>
    </div>
    ${posCaminho < 0 && !fechado ? `<p class="fl-fora">Etapa atual: <b>${esc(nomeEtapa(l.etapa))}</b></p>` : ''}
  </header>
  <section class="fl-obs">
    <div class="fl-obs-cab"><label for="fl-obs">Observação</label><small id="fl-obs-st">todo mundo vê · salva ao sair do campo</small></div>
    <textarea id="fl-obs" rows="2" placeholder="Escreva aqui o que todo mundo precisa saber sobre este lead (ex.: só atende depois das 18h)">${esc(l.notas || '')}</textarea>
  </section>
  <div class="fl-corpo">
    <div class="fl-esq">
      <nav class="fl-abas" aria-label="Seções da ficha">${abas.map(([k, t, n, ruim]) =>
        `<button data-aba="${k}" class="${aba === k ? 'on' : ''}">${t}${n ? `<em class="${ruim ? 'ruim' : ''}">${n}</em>` : ''}</button>`).join('')}</nav>
      <div class="fl-aba">${({ fu: abaFu, visita: abaVisita, quali: qualificacao, historico })[aba](l, ficha)}</div>
    </div>
    <aside class="fl-dir" aria-label="Conversa">
      <div class="fl-conv-topo">
        <span class="fl-wa">${ico('whats')}</span>
        <div><b>Conversa no WhatsApp</b><small>${esc(l.telefone || 'sem telefone')}</small></div>
        ${podeEnviar ? `<a class="mini" href="${esc(l.wa)}" target="_blank" rel="noopener">Abrir ${svgL('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>', 'ico ico-s')}</a>` : ''}
      </div>
      ${l.nao_contatar ? '<p class="fl-espera">Marcado como "não contatar": o envio está desligado.</p>'
        : l.etapa === 'respondeu' ? '<p class="fl-espera"><i></i>Respondeu e está esperando a sua resposta.</p>' : ''}
      <div class="fl-conversa">${msgs.length ? msgs.map(m => `<div class="bolha"><p>${esc(m.texto)}</p><small>${m.quando}${m.autor ? ' · ' + esc(m.autor) : ''} · enviada pelo WhatsApp</small></div>`).join('')
        : '<p class="vazio-c">Nenhuma mensagem ainda. Escreva a primeira abaixo — o CRM abre o seu WhatsApp com o texto pronto.</p>'}</div>
      ${podeEnviar ? `<div class="fl-sug">
        <div class="fl-sug-t">${svgL(IC_L.brilho, 'ico ico-s')}<b>Sugestão de resposta</b></div>
        <p id="fl-sug-txt">${esc(sugestao())}</p>
        <div class="fl-sug-b"><button class="mini ok" data-acao="usar-sug">Usar</button>${(MODELOS[l.etapa] || MODELOS.novo).length > 1 ? '<button class="mini" data-acao="outra-sug">Outra</button>' : ''}</div>
      </div>` : ''}
      <div class="fl-msg">
        <textarea id="fl-texto" rows="1" aria-label="Mensagem" placeholder="Escreva a mensagem… (Enter envia)" ${podeEnviar ? '' : 'disabled'}></textarea>
        <button class="fl-enviar" data-acao="enviar" aria-label="Enviar pelo WhatsApp" ${podeEnviar ? '' : 'disabled'}>${svgL(IC_L.enviar)}</button>
      </div>
    </aside>
  </div>`;
  fichaC.scrollTop = y[2];
  fichaC.querySelector('.fl-esq').scrollTop = y[0];
  fichaC.querySelector('.fl-corpo').scrollTop = y[1];
  rolarFicha();
}
// a conversa mostra a última mensagem; no celular as etapas rolam de lado e a atual fica à vista
// (chamado também depois de abrir a janela: fechada, ela ainda não tem tamanho)
function rolarFicha() {
  const conv = fichaC.querySelector('.fl-conversa'); if (conv) conv.scrollTop = conv.scrollHeight;
  const cam = fichaC.querySelector('.fl-caminho'), at = cam?.querySelector('.atual');
  if (at && cam.scrollWidth > cam.clientWidth) cam.scrollLeft = at.offsetLeft - cam.offsetLeft - (cam.clientWidth - at.offsetWidth) / 2;
}

// ---------- Aba Follow-up: o próximo em destaque, os outros agendados, agendar e os feitos ----------
function abaFu(l) {
  const [prox, ...outros] = agendados().filter(it => it.tipo === 'fu'), regra = FU_REGRAS[l.etapa];
  const fs = feitos().filter(r => r.tipo === 'Follow-up');
  const agAberto = flAgAberto || !prox || flAg.remarcando; // sem follow-up marcado, o agendar já vem aberto
  return `
  ${prox ? heroi(prox) : `<div class="fl-sem"><i></i><div><b>Sem próximo follow-up.</b> Lead sem data marcada esfria — agende abaixo.${regra ? ` <span class="fl-sem-dica">${esc(nomeEtapa(l.etapa))}: ${esc(regra[1].charAt(0).toLowerCase() + regra[1].slice(1))}.</span>` : ''}</div></div>`}
  ${outros.length ? `<div class="fl-bloco"><span class="fl-rot">Também agendado</span>${outros.map(itemAgendado).join('')}</div>` : ''}
  ${agAberto ? blocoAgendar(flAg.remarcando ? 'Remarcar follow-up' : prox ? 'Agendar outro follow-up' : 'Agendar follow-up')
    : '<button type="button" class="fl-add" data-acao="abrir-ag">+ Agendar outro follow-up</button>'}
  <section class="fl-sec">
    <div class="fl-sec-cab"><h4>Feitos</h4>${fs.length ? `<small class="cinza">${plural(fs.length, 'follow-up', 'follow-ups')}</small>` : ''}</div>
    ${fs.length ? `<ol class="fl-reg">${fs.slice(0, 5).map(linhaFeito).join('')}</ol>` : '<p class="cinza">Nenhum follow-up feito ainda. Ao concluir, o que foi feito fica registrado aqui.</p>'}
    <div class="fl-sec-pe">${fs.length > 5 ? '<button class="lnk" data-aba="historico">Ver todos no histórico</button>' : ''}<button class="lnk" data-acao="ir-registrar">Registrar um contato fora do agendado</button></div>
  </section>`;
}

// ---------- Aba Visita: a visita marcada (ou marcar uma) e as visitas feitas ----------
function abaVisita(l) {
  const vis = agendados().find(it => it.tipo === 'visita'), fs = feitos().filter(r => r.tipo === 'Visita');
  const topo = vis ? heroi(vis) + (flAg.remarcando ? blocoAgendar('Remarcar visita')
      : '<button type="button" class="lnk fl-desmarcar" data-acao="desmarcar">Desmarcar visita</button>')
    : blocoAgendar('Marcar visita', '<p class="fl-vis-dica">Ao marcar, a visita aparece no quadro e o lead vai para "Visita agendada".</p>');
  return topo + `
  <section class="fl-sec">
    <div class="fl-sec-cab"><h4>Visitas feitas</h4>${fs.length ? `<small class="cinza">${plural(fs.length, 'visita', 'visitas')}</small>` : ''}</div>
    ${fs.length ? `<ol class="fl-reg">${fs.map(linhaFeito).join('')}</ol>` : '<p class="cinza">Nenhuma visita feita ainda. Ao tocar em "Visita feita", como foi fica registrado aqui.</p>'}
  </section>`;
}

// O próximo follow-up (ou a visita) em destaque; tocar nele abre o "Como foi?" logo abaixo
function heroi(it) {
  const abrindo = flConc && flConc.chave === it.chave, visita = it.tipo === 'visita', passou = visita ? it.quando < new Date() : it.atrasado;
  const rot = visita ? (passou ? 'Visita marcada · já passou' : 'Visita marcada') : (passou ? 'Follow-up atrasado' : 'Próximo follow-up');
  const meta = visita ? (passou ? 'Registre como foi a visita.' : '') : [it.canal, passou ? 'era ' + dataLonga(it.quando) : ''].filter(Boolean).join(' · ');
  return `<section class="fl-heroi${passou ? ' atrasado' : ''}${abrindo ? ' aberto' : ''}" data-abrir-item="${it.chave}" title="${abrindo ? '' : 'Concluir: registrar como foi'}">
      <span class="fl-heroi-ic">${visita ? svgL(IC_L.casa) : ico('relogio')}</span>
      <div class="fl-heroi-t"><small>${rot}</small><b>${esc(visita ? dataLonga(it.quando) : fuQuando(it.quando))}</b><p>${esc(visita ? (atual.lead.empreendimento || 'Empreendimento não escolhido') : it.texto)}</p>${meta ? `<span>${esc(meta)}</span>` : ''}</div>
      ${abrindo ? '' : `<div class="fl-heroi-b"><button class="btn" data-acao="concluir" data-item="${it.chave}">${svgL(IC_L.check, 'ico ico-s')}${visita ? 'Visita feita' : 'Concluir'}</button>
        <button class="mini" data-acao="remarcar" data-item="${it.chave}">Remarcar</button></div>`}
    </section>
    ${abrindo ? `<div class="fl-feito cc">${ccHtml(flConc, diasMarcados())}</div>` : ''}`;
}

// Os outros follow-ups em aberto (e o "Como foi?" do que está sendo concluído)
function itemAgendado(it) {
  const abrindo = flConc && flConc.chave === it.chave;
  const rot = it.atrasado ? 'Atrasado · ' + dm(it.quando) + ' ' + hm(it.quando) : fuQuando(it.quando);
  return `<div class="fl-item${it.atrasado ? ' atrasado' : ''}${abrindo ? ' aberto' : ''}" data-abrir-item="${it.chave}" title="${abrindo ? '' : 'Concluir: registrar como foi'}">
      <span class="fl-roda">${ico('relogio')}</span>
      <div class="fl-item-tx"><div><b>${esc(rot)}</b><small>Follow-up${it.canal ? ' · ' + esc(it.canal) : ''}</small></div><p>${esc(it.texto)}</p></div>
      ${abrindo ? '' : `<button class="mini" data-acao="remarcar" data-item="${it.chave}">Remarcar</button>
      <button class="mini ok" data-acao="concluir" data-item="${it.chave}">${svgL(IC_L.check, 'ico ico-s')}Feito</button>`}
    </div>
    ${abrindo ? `<div class="fl-feito cc">${ccHtml(flConc, diasMarcados())}</div>` : ''}`;
}

// Agendar (ou remarcar) um follow-up ou a visita: dia, hora e o que fazer
const agVerbo = () => flAg.remarcando ? 'Remarcar' : flAg.tipo === 'visita' ? 'Marcar visita' : 'Agendar';
function blocoAgendar(titulo, dica = '') {
  const a = flAg, l = atual.lead, visita = a.tipo === 'visita', d = a.q.data, rem = a.remarcando;
  const cancelar = rem || (!visita && agendados().some(it => it.tipo === 'fu'));
  return `<section class="fl-sec fl-ag">
    <div class="fl-sec-cab"><h4>${esc(titulo)}</h4>${rem && !visita ? `<small class="cinza">${esc(rem.texto)}</small>` : ''}</div>
    ${dica}
    <div class="ag">
      <div class="ag-quando">${quandoHtml(a.q, diasMarcados())}</div>
      <div class="ag-pe">
        ${visita ? `<label class="ag-emp"><span>Empreendimento</span><select data-campo="empreendimento">${opcoes(comValor(listaEmps(), l.empreendimento), l.empreendimento, '—')}</select></label>`
          : `<input id="ag-nota" aria-label="O que fazer" placeholder="O que fazer? (ex.: ${esc(FU_REGRAS[l.etapa]?.[1].toLowerCase() || 'ligar para confirmar')})" value="${esc(a.nota)}">`}
        ${cancelar ? `<button class="mini" data-acao="${rem ? 'cancelar-remarcar' : 'fechar-ag'}">Cancelar</button>` : ''}
        <button class="btn" data-acao="agendar" ${d ? '' : 'disabled'}>${agVerbo()}${d ? ' · ' + esc(rotuloQuando(d)) : ''}</button>
      </div>
    </div>
  </section>`;
}

function registrarHtml() {
  const r = flReg;
  const b = (k, icone) => `<button type="button" class="ag-chip${r.tipo === k ? ' on' : ''}" data-reg-tipo="${k}" aria-pressed="${r.tipo === k}">${icone}${TIPO_REG[k]}</button>`;
  return `<div class="ag">
    <div class="ag-chips">${b('ligacao', svgL(IC_L.fone, 'ico ico-s'))}${b('whatsapp', ico('whats'))}${b('visita', svgL(IC_L.casa, 'ico ico-s'))}${b('nota', svgL(IC_L.lapis, 'ico ico-s'))}</div>
    <textarea id="reg-texto" rows="3" aria-label="O que aconteceu" placeholder="${esc(PH_REG[r.tipo])}">${esc(r.texto)}</textarea>
    <div class="ag-pe"><p class="cinza">Fica em Feito com a data e a hora de agora.</p><button class="btn" data-acao="registrar">Registrar</button></div>
  </div>`;
}

function qualificacao(l, ficha) {
  const linhas = resumoFicha(ficha);
  const feitas = CHAVES_QUALI.filter(([, ok]) => ok(ficha)), faltam = CHAVES_QUALI.filter(([, ok]) => !ok(ficha)).map(([t]) => t);
  return `<section class="fl-sec">
    <div class="fl-sec-cab"><h4>Interesse</h4></div>
    <div class="fl-grade">
      <label>Empreendimento<select data-campo="empreendimento">${opcoes(comValor(listaEmps(), l.empreendimento), l.empreendimento, '—')}</select></label>
      <label>Tipologia<select data-campo="tipologia">${opcoes(comValor(['Studio', 'Apartamento', 'Casa', 'Lote', 'Sala comercial'], l.tipologia), l.tipologia, '—')}</select></label>
      <label>Objetivo<select data-campo="objetivo">${opcoes(comValor(['Investimento', 'Moradia'], l.objetivo), l.objetivo, '—')}</select></label>
    </div>
  </section>
  <section class="fl-sec">
    <div class="fl-sec-cab"><h4>Ficha de qualificação</h4>
      <div class="fl-prog-w"><span class="fl-prog" aria-hidden="true"><i style="width:${Math.round(feitas.length * 100 / CHAVES_QUALI.length)}%"></i></span><small>${feitas.length} de ${CHAVES_QUALI.length}</small><button class="mini" data-acao="ficha">${linhas.length ? 'Editar ficha' : 'Preencher'}</button></div></div>
    ${linhas.length
      ? `<dl class="fl-dados">${linhas.map(([t, v]) => `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      : '<button type="button" class="fl-dica" data-acao="ficha"><b>O que o cliente procura?</b><p>Comece pela finalidade (morar, investir ou alugar): a ficha segue o roteiro de cada um, com tipo, orçamento e região.</p></button>'}
    ${faltam.length && linhas.length ? `<div class="fl-falta"><span>Falta perguntar:</span>${faltam.map(t => `<button type="button" class="fl-tag" data-acao="ficha">${t}</button>`).join('')}</div>` : ''}
  </section>`;
}

function historico(l) {
  const TIPOS = { etapa: 'Etapa', msg: 'Mensagem', nota: 'Anotação', sistema: 'Alteração', ...TIPO_REG };
  const hs = atual.historico.filter(h => !TIPO_REG[h.tipo]).map(h => ({ quando: new Date(h.criado_em), tipo: TIPOS[h.tipo] || 'Alteração', texto: h.texto, autor: h.autor, marco: h.tipo === 'etapa' }));
  const tudo = [...feitos(), ...hs].sort((a, b) => b.quando - a.quando);
  tudo.push({ quando: new Date(l.criado_em), tipo: 'Entrada', texto: [l.origem || 'Sem origem', l.campanha, l.criativo].filter(Boolean).join(' · '), marco: true });
  return `<section class="fl-sec">
    <div class="fl-sec-cab"><h4>De onde veio</h4><small class="cinza">entrou em ${esc(l.entrou)}</small></div>
    <div class="fl-origem">
      <label class="fl-o-chip">${ico(ICO_ORIGEM[l.origem] || 'anuncio')}<select data-campo="origem" aria-label="Origem">${opcoes([...new Set([...ORIGENS, ...(l.origem ? [l.origem] : [])])], l.origem, 'Sem origem')}</select></label>
      ${[l.campanha, l.conjunto, l.criativo].filter(Boolean).map(t => `<span class="fl-o-sep">›</span><span>${esc(t)}</span>`).join('') || '<span class="cinza">sem campanha registrada</span>'}
    </div>
  </section>
  <section class="fl-sec fl-registrar">
    <div class="fl-sec-cab"><h4>Registrar o que foi feito</h4><small class="cinza">ligação, conversa ou visita fora de um follow-up agendado</small></div>
    ${registrarHtml()}
  </section>
  <section class="fl-sec">
    <div class="fl-sec-cab"><h4>Histórico</h4><small class="cinza">o que foi feito, etapas, mensagens e alterações</small></div>
    <ol class="fl-reg">${tudo.map(linhaFeito).join('')}</ol>
  </section>`;
}

// Sugestões de mensagem por etapa ({nome}, {emp}, {visita}, {empresa})
const MODELOS = {
  novo: ['Oi {nome}! Tudo bem? Aqui é da {empresa}. Vi seu interesse em {emp} e separei as informações pra você. Posso te mandar?',
         'Olá {nome}! Obrigado pelo contato. Você procura para morar ou investir? Assim já te mando as opções certas.'],
  primeiro_contato: ['Oi {nome}, conseguiu ver as informações de {emp}? Fico à disposição para tirar qualquer dúvida.'],
  respondeu: ['Que bom falar com você, {nome}! Que tal agendarmos uma visita para conhecer {emp} de perto? Tenho horários essa semana.',
              '{nome}, pelo que você me contou, tenho uma opção que encaixa muito bem. Posso te ligar rapidinho?'],
  nao_respondeu: ['Oi {nome}, tudo certo? Passando para saber se ainda tem interesse em {emp}. Me diga o melhor horário para conversarmos.'],
  visita_agendada: ['Oi {nome}! Passando para confirmar nossa visita {visita}. Posso confirmar?'],
  proposta: ['Oi {nome}! Conseguiu avaliar a proposta? Fico à disposição para ajustar o que precisar.'],
  venda: ['{nome}, foi um prazer! Se conhecer alguém procurando imóvel, vou adorar ajudar também.']
};
function sugestao() {
  const l = atual.lead, lista = MODELOS[l.etapa] || MODELOS.novo;
  return lista[modelo % lista.length].replace(/{nome}/g, (l.nome || '').split(' ')[0]).replace(/{empresa}/g, EMPRESA)
    .replace(/{emp}/g, l.empreendimento || 'nossos empreendimentos').replace(/{visita}/g, l.visita_rotulo ? l.visita_rotulo.toLowerCase() : 'agendada');
}
async function enviarMensagem() {
  const t = document.getElementById('fl-texto'), txt = t.value.trim();
  if (!txt || !atual.lead.wa) return;
  window.open(atual.lead.wa + '?text=' + encodeURIComponent(txt), '_blank');
  try { await enviar('historico', { id: atual.lead.id, tipo: 'msg', texto: txt }); } catch (e) { return; }
  await recarregarFicha();
}

// Observações: salvam ao sair do campo (sem redesenhar a ficha, para não perder o lugar)
async function salvarObs() {
  const t = document.getElementById('fl-obs');
  if (!t || !atual) return;
  const l = atual.lead, novo = t.value.trim(), antes = l.notas || '';
  if (novo === antes.trim()) return;
  const st = document.getElementById('fl-obs-st');
  l.notas = novo; // já conta como salvo: sair do campo e fechar a ficha não salvam duas vezes
  try { await api('lead_campo', { id: l.id, campo: 'notas', valor: novo }); } catch (e) {
    l.notas = antes;
    if (e.status === 401) return telaEntrada();
    if (st) st.textContent = 'Não salvou: ' + e.message; return;
  }
  mudou = true;
  if (st) st.textContent = 'Salvo ✓';
}

// Redesenha só o painel de concluir (o resto da ficha fica como está)
function redesenharConc() {
  const caixa = fichaC.querySelector('.fl-feito');
  if (!caixa || !flConc) return desenhar();
  caixa.innerHTML = ccHtml(flConc, diasMarcados());
}
function abrirConc(chave) {
  const it = agendados().find(x => x.chave === chave);
  if (!it) return;
  flConc = { chave, ...novoConc(it.tipo, atual.lead.etapa) };
  desenhar();
  fichaC.querySelector('.fl-feito .cc-relato')?.focus({ preventScroll: true });
  fichaC.querySelector('.fl-feito')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function salvarConc(botao) {
  const l = atual.lead, c = flConc;
  if (!c) return;
  botao.disabled = true;
  try {
    const r = await ccSalvar(c, { fuId: c.chave.startsWith('fu:') ? Number(c.chave.slice(3)) : null, leadId: l.id });
    if (r === false) { botao.disabled = false; return; }
  } catch (x) { botao.disabled = false; return; }
  flConc = null; flAg = null; flAgAberto = false;
  await recarregarFicha();
}
const redesenharAgenda = () => {
  const q = fichaC.querySelector('.ag-quando'), btn = fichaC.querySelector('[data-acao="agendar"]');
  if (!q || !btn) return desenhar();
  q.innerHTML = quandoHtml(flAg.q, diasMarcados());
  const d = flAg.q.data;
  btn.disabled = !d;
  btn.textContent = agVerbo() + (d ? ' · ' + rotuloQuando(d) : '');
};

// ---------- Ações da ficha ----------
async function cliqueFicha(e) {
  // fora do menu "⋯": fecha o menu
  if (flMenu && !e.target.closest('.fl-mais')) { flMenu = false; fichaC.querySelector('.fl-menu')?.setAttribute('hidden', ''); }
  if (flAg && fichaC.querySelector('.ag-quando')?.contains(e.target) && quandoClique(e, flAg.q, redesenharAgenda)) return;
  if (flConc && e.target.closest('.fl-feito')) {
    const r = ccClique(e, flConc, redesenharConc);
    if (r === 'cancelar') { flConc = null; desenhar(); }
    else if (r === 'salvar') { try { await salvarConc(e.target.closest('button')); } catch (x) {} }
    return;
  }
  // tocar no agendado (fora dos botões) abre o concluir ali mesmo
  const linhaAg = e.target.closest('[data-abrir-item]');
  if (linhaAg && !e.target.closest('button, a') && !linhaAg.classList.contains('aberto')) { abrirConc(linhaAg.dataset.abrirItem); return; }
  const el = e.target.closest('[data-acao], [data-etapa], [data-aba], [data-reg-tipo]');
  if (!el) return;
  const l = atual.lead, ds = el.dataset;
  if (ds.aba) { aba = ds.aba; flTopo = true; flConc = null; flAg = null; flAgAberto = false; desenhar(); return; }
  if (ds.regTipo) { flReg.tipo = ds.regTipo; const t = $('#reg-texto'); if (t) flReg.texto = t.value; desenhar(); $('#reg-texto')?.focus(); return; }
  try {
    if (ds.etapa) {
      if (ds.etapa === l.etapa) return;
      await mudarEtapa(l.id, ds.etapa, l.etapa); await recarregarFicha(); return;
    }
    switch (ds.acao) {
      case 'fechar': ficha.close(); break;
      case 'mais': flMenu = !flMenu; fichaC.querySelector('.fl-menu').toggleAttribute('hidden', !flMenu); el.setAttribute('aria-expanded', flMenu); break;
      case 'ganho': await mudarEtapa(l.id, GANHOS[0], l.etapa); await recarregarFicha(); break;
      case 'perdido': if (confirm('Marcar este lead como perdido?')) { await mudarEtapa(l.id, PERDIDOS[0], l.etapa); await recarregarFicha(); } break;
      case 'naolead': if (confirm('Marcar como "não é lead"?')) { await mudarEtapa(l.id, PERDIDOS[1] || PERDIDOS[0], l.etapa); await recarregarFicha(); } break;
      case 'editar': preencher(l); modal.showModal(); break;
      case 'valor': {
        const v = prompt('Valor do negócio (R$):', l.valor ? Math.round(l.valor) : '');
        if (v !== null) await salvarCampo('valor', v);
        break;
      }
      case 'ficha': abrirQuali(); break;
      case 'remover':
        if (!confirm('Remover este lead de vez?')) return;
        await enviar('lead_excluir', { id: l.id }); mudou = true; ficha.close(); break;

      // concluir um agendado: abre o "Como foi?"
      case 'concluir': abrirConc(ds.item); break;
      // remarcar: o seletor de dia e hora já vem com o que estava marcado
      case 'remarcar': {
        const it = agendados().find(x => x.chave === ds.item);
        if (!it) return;
        flConc = null; flAgAberto = true;
        flAg = { tipo: it.tipo, q: { data: new Date(it.quando < new Date() ? daqui(1, it.quando.getHours()) : it.quando) }, nota: it.tipo === 'fu' ? it.texto : '', remarcando: it };
        desenhar(); fichaC.querySelector('.fl-ag')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
      }
      case 'cancelar-remarcar': case 'fechar-ag': flAg = null; flAgAberto = false; desenhar(); break;
      case 'abrir-ag':
        flAg = null; flAgAberto = true; desenhar();
        fichaC.querySelector('.fl-ag')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
      case 'desmarcar':
        if (!confirm('Desmarcar a visita? Ela sai do quadro e da agenda.')) return;
        await enviar('lead_campo', { id: l.id, campo: 'visita_em', valor: '' });
        window.aviso?.('Visita desmarcada'); flAg = null; await recarregarFicha(); break;
      case 'ir-registrar': {
        aba = 'historico'; flTopo = true; flConc = null; flAg = null; flAgAberto = false; desenhar();
        const t = $('#reg-texto'); t?.focus({ preventScroll: true }); t?.closest('.fl-sec')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
      }
      case 'agendar': {
        const d = flAg.q.data, nota = ($('#ag-nota')?.value ?? flAg.nota).trim(), rem = flAg.remarcando;
        if (!d) return;
        if (d < new Date(Date.now() - 5 * 60000)) { alert('Esse horário já passou. Escolha outro.'); return; }
        el.disabled = true;
        try {
          if (flAg.tipo === 'visita') {
            await enviar('lead_campo', { id: l.id, campo: 'visita_em', valor: d.toISOString() });
            // quem ainda não estava em visita agendada passa para lá
            if (['novo', 'primeiro_contato', 'respondeu', 'nao_respondeu'].includes(l.etapa)) await mudarEtapa(l.id, 'visita_agendada', l.etapa);
            window.aviso?.(rem || l.visita_em ? 'Visita remarcada ✓' : 'Visita marcada ✓');
          } else {
            const texto = nota || FU_REGRAS[l.etapa]?.[1] || 'Entrar em contato';
            if (rem) await enviar('fu_salvar', { id: rem.id, quando: d.toISOString(), canal: rem.canal || 'WhatsApp', nota: texto });
            else await enviar('fu_salvar', { lead_id: l.id, quando: d.toISOString(), canal: 'WhatsApp', nota: texto });
            window.aviso?.(rem ? 'Follow-up remarcado ✓' : 'Follow-up agendado ✓');
          }
        } catch (x) { el.disabled = false; return; }
        flAg = null; flAgAberto = false;
        await recarregarFicha(); break;
      }
      case 'registrar': {
        const t = $('#reg-texto'), txt = (t?.value || '').trim();
        if (!txt) { t?.focus(); return; }
        el.disabled = true;
        try { await enviar('historico', { id: l.id, tipo: flReg.tipo, texto: txt }); } catch (x) { el.disabled = false; return; }
        window.aviso?.('Registrado ✓');
        flReg.texto = '';
        await recarregarFicha(); break;
      }
      case 'usar-sug': { const t = $('#fl-texto'); t.value = sugestao(); t.focus(); break; }
      case 'outra-sug': modelo++; $('#fl-sug-txt').textContent = sugestao(); break;
      case 'enviar': await enviarMensagem(); break;
    }
  } catch (x) { /* o erro já apareceu na tela */ }
}


// ---------- Novo lead / editar dados básicos ----------
function preencher(lead) {
  form.reset();
  $('#modal-erro').textContent = '';
  const sel = form.elements.empreendimento;
  sel.innerHTML = '<option></option>' + listaEmps().map(e => `<option>${esc(e)}</option>`).join('');
  for (const k of ['id', 'nome', 'telefone', 'instagram', 'objetivo', 'tipologia', 'empreendimento', 'notas']) {
    const campo = form.elements[k], v = lead[k] ?? '';
    // valor que não está na lista (mudado pela ficha): entra na lista para não se perder ao salvar
    if (campo.tagName === 'SELECT' && v && ![...campo.options].some(o => o.value === v)) campo.add(new Option(v, v));
    campo.value = v;
  }
  $('#modal-titulo').textContent = lead.id ? 'Editar lead' : 'Novo lead';
  $('#btn-excluir').style.display = lead.id ? '' : 'none';
}
function abrirNovo() { preencher({}); modal.showModal(); }
async function salvar() {
  const dados = Object.fromEntries(new FormData(form));
  const b = $('#btn-salvar'); b.disabled = true;
  try { await api('lead_salvar', { ...dados, id: dados.id ? Number(dados.id) : undefined }); } catch (e) {
    b.disabled = false;
    if (e.status === 401) return telaEntrada();
    $('#modal-erro').textContent = e.message; return;
  }
  b.disabled = false;
  modal.close();
  if (ficha.open && dados.id) await recarregarFicha(); else { window.aviso?.(dados.id ? 'Salvo ✓' : 'Lead cadastrado ✓'); atualizar(); }
}
async function excluir() {
  if (!confirm('Excluir este lead?')) return;
  try { await enviar('lead_excluir', { id: Number(form.elements.id.value) }); } catch (e) { return; }
  modal.close(); if (ficha.open) { mudou = false; ficha.close(); } atualizar();
}

// As janelas entram depois que a página foi desenhada
quandoPronto(() => {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="ficha" class="ficha" aria-label="Ficha do lead"><div id="ficha-conteudo"></div></dialog>
<dialog id="modal">
  <form id="form-lead" method="dialog">
    <h3 id="modal-titulo">Novo lead</h3>
    <input type="hidden" name="id">
    <label>Nome<input name="nome" autocomplete="off"></label>
    <div class="duas">
      <label>Telefone<input name="telefone" inputmode="tel" autocomplete="off"></label>
      <label>Instagram<input name="instagram" autocomplete="off"></label>
    </div>
    <div class="duas">
      <label>Objetivo<select name="objetivo"><option></option><option>Investimento</option><option>Moradia</option></select></label>
      <label>Tipologia<select name="tipologia"><option></option><option>Lote</option><option>Casa</option><option>Apartamento</option><option>Studio</option></select></label>
    </div>
    <label>Empreendimento<select name="empreendimento"><option></option></select></label>
    <label>Notas<textarea name="notas" rows="3"></textarea></label>
    <p class="err" id="modal-erro" role="alert"></p>
    <div class="modal-acoes">
      <button type="button" class="lnk perigo" id="btn-excluir">Excluir</button>
      <button type="button" class="btn-borda" id="btn-cancelar">Cancelar</button>
      <button type="button" class="btn" id="btn-salvar">Salvar</button>
    </div>
  </form>
</dialog>`);
  ficha = $('#ficha'); fichaC = $('#ficha-conteudo'); modal = $('#modal'); form = $('#form-lead');
  $('#btn-excluir').addEventListener('click', excluir);
  $('#btn-cancelar').addEventListener('click', () => modal.close());
  $('#btn-salvar').addEventListener('click', salvar);
  fichaC.addEventListener('click', cliqueFicha);
  fichaC.addEventListener('change', e => {
    const c = e.target.dataset.campo;
    if (c) salvarCampo(c, e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value);
  });
  fichaC.addEventListener('change', e => { if (e.target.id === 'fl-obs') salvarObs(); });
  // o que se digita no "Como foi?", no agendar e no registrar sobrevive aos redesenhos
  fichaC.addEventListener('input', e => {
    const id = e.target.id;
    if (flConc && ccInput(e, flConc)) return;
    if (id === 'ag-nota' && flAg) flAg.nota = e.target.value;
    else if (id === 'reg-texto' && flReg) flReg.texto = e.target.value;
    else if (id === 'fl-obs') { const st = $('#fl-obs-st'); if (st) st.textContent = 'salva ao sair do campo'; }
  });
  fichaC.addEventListener('keydown', e => {
    if (e.target.id === 'fl-texto' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); }
  });
  ficha.addEventListener('click', e => { if (e.target === ficha) ficha.close(); });
  // o que mudou na ficha aparece no quadro, nas listas e nos números ao fechar
  ficha.addEventListener('close', async () => { await salvarObs(); if (mudou) { mudou = false; atualizar(); } });

  // clicar em qualquer [data-abrir-lead] abre a ficha (menos em links e botões dentro dele)
  document.addEventListener('click', e => {
    const alvo = e.target.closest('[data-abrir-lead]'), botao = e.target.closest('a, button, input, select, label');
    if (!alvo || (botao && botao !== alvo && alvo.contains(botao))) return;
    abrirLead(alvo.dataset.abrirLead);
  });
  // ?lead=ID na URL abre a ficha direto (e sai da URL, para não reabrir quando a página recarregar)
  const abrirPedido = () => {
    const u = new URL(location.href), pedido = u.searchParams.get('lead');
    if (pedido) { abrirLead(pedido); u.searchParams.delete('lead'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  };
  abrirPedido();
  document.addEventListener('crm:tela', e => { if (e.detail.trocou) abrirPedido(); });
});
