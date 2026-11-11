// Ficha do lead: a janela que abre ao clicar num lead (CRM e página Leads) e a janela de novo/editar lead
let ficha, fichaC, modal, form;
let atual = null;       // dados do lead aberto (lead, followups, historico)
let aba = 'resumo';
let mudou = false;      // se algo mudou, a página recarrega ao fechar a ficha
let modelo = 0;         // qual sugestão de mensagem mostrar

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
  if (novo) { aba = 'resumo'; modelo = 0; }
  desenhar();
  if (!ficha.open) ficha.showModal();
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

// ---------- Desenho da ficha ----------
function desenhar() {
  const l = atual.lead;
  const ficha = lerFicha(l);
  const pend = atual.followups.filter(f => !f.feito_em);
  const msgs = atual.historico.filter(h => h.tipo === 'msg').reverse();
  const posCaminho = CAMINHO.indexOf(l.etapa);
  const fechado = GANHOS.includes(l.etapa) ? 'ganho' : (PERDIDOS.includes(l.etapa) ? 'perdido' : '');

  fichaC.innerHTML = `
  <header class="fl-cab">
    <div class="fl-id">
      <div class="fl-nome"><h2>${esc(l.nome || 'Sem nome')}</h2>
        <button class="fl-valor" data-acao="valor">${l.valor ? dinheiro(l.valor) : 'Adicionar valor'} ✎</button>
        ${fechado ? `<span class="chip ${fechado}">${fechado === 'ganho' ? '✓ Ganho' : '✕ ' + esc(nomeEtapa(l.etapa))}</span>` : ''}</div>
      <div class="fl-meta">
        <button class="lnk-sutil" data-acao="editar">${esc(l.telefone || 'sem telefone')} ✎</button>
        <span>·</span><span>${esc(l.origem || 'Sem origem')}</span>
        <label>Responsável <select data-campo="responsavel">${opcoes(listaResponsaveis(), l.responsavel, 'Ninguém')}</select></label>
        <label>Prioridade <select data-campo="prioridade">${opcoes(PRIORIDADES, l.prioridade || 'normal')}</select></label>
        <label>Temperatura <select data-campo="temperatura">${opcoes(TEMPERATURAS, l.temperatura, '—')}</select></label>
      </div>
      <label class="fl-nao"><input type="checkbox" data-campo="nao_contatar" ${l.nao_contatar ? 'checked' : ''}> ⊘ Não contatar</label>
    </div>
    <div class="fl-botoes">
      <button class="b-ganho" data-acao="ganho">✓ Ganho</button>
      <button class="b-perdido" data-acao="perdido">✕ Perdido</button>
      <button class="b-neutro" data-acao="naolead">Não é lead</button>
      <button class="b-neutro" data-acao="editar">Editar</button>
      <button class="b-fechar" data-acao="fechar" aria-label="Fechar" autofocus>×</button>
    </div>
  </header>
  <div class="fl-corpo">
    <div class="fl-esq">
      <ol class="fl-caminho">${CAMINHO.map((k, i) => `<li class="${i <= posCaminho ? 'feito' : ''} ${k === l.etapa ? 'atual' : ''}" data-etapa="${k}" title="Mover para ${esc(nomeEtapa(k))}"><i></i><span>${esc(nomeEtapa(k))}</span></li>`).join('')}</ol>
      ${posCaminho < 0 && !fechado ? `<p class="fl-fora">Etapa atual: <b>${esc(nomeEtapa(l.etapa))}</b></p>` : ''}
      <nav class="fl-abas">${[['resumo', 'Resumo'], ['imoveis', 'Imóveis'], ['caminho', 'Caminho'], ['historico', 'Histórico']]
        .map(([k, t]) => `<button data-aba="${k}" class="${aba === k ? 'on' : ''}">${t}</button>`).join('')}</nav>
      <div class="fl-aba">${({ resumo, imoveis, caminho, historico })[aba](l, ficha, pend)}</div>
    </div>
    <aside class="fl-dir">
      <div class="fl-dir-topo"><b>CONVERSA</b><small>${esc(l.telefone || '')}</small></div>
      <div class="fl-conversa">${msgs.length ? msgs.map(m => `<div class="bolha"><p>${esc(m.texto)}</p><small>${m.quando} · enviada pelo WhatsApp</small></div>`).join('')
        : '<p class="vazio-c">Nenhuma mensagem ainda. Escreva a primeira abaixo — o CRM abre o seu WhatsApp com o texto pronto.</p>'}</div>
      <button class="sugerir" data-acao="sugerir">✦ Sugerir resposta</button>
      <div class="fl-msg">
        <textarea id="fl-texto" rows="2" placeholder="Escreva a mensagem... (Enter envia, Shift+Enter quebra linha)" ${l.wa && !l.nao_contatar ? '' : 'disabled'}></textarea>
        <button class="btn" data-acao="enviar" ${l.wa && !l.nao_contatar ? '' : 'disabled'}>Enviar</button>
      </div>
    </aside>
  </div>`;
}

function resumo(l, ficha, pend) {
  const linhas = resumoFicha(ficha);
  return `
  <section class="fl-sec fl-visita">
    <div class="fl-linha">${ico('calendario')}
      <b>Visita</b> <span class="${l.visita_em ? 'ok' : 'cinza'}">${l.visita_em ? esc(l.visita_rotulo) : 'nenhuma marcada'}</span>
      <button class="mini" data-acao="visita">${l.visita_em ? 'Remarcar' : 'Marcar visita'}</button>
      ${l.visita_em ? '<button class="mini" data-acao="desmarcar">Desmarcar</button>' : ''}</div>
    <div class="fl-visita-form" hidden><input type="datetime-local" id="fl-visita" value="${paraInput(l.visita_em ? new Date(l.visita_em) : daqui(1, 10))}"><button class="btn" data-acao="salvar-visita">Salvar visita</button></div>
  </section>
  <section class="fl-sec">
    <h4>Próximo contato</h4>
    ${pend.length ? pend.map(f => `<div class="fl-fu ${f.atrasado ? 'atrasado' : ''}"><b>${esc(f.rotulo)}</b><span>${esc(f.nota || f.canal)}</span><button class="mini" data-acao="fu-feito" data-fu="${f.id}">Feito</button></div>`).join('')
      : '<p class="cinza">Nenhum follow-up agendado.</p>'}
    <div class="fl-agendar"><input id="fl-fu-nota" placeholder="O que fazer (ex.: ligar para confirmar)"><input type="datetime-local" id="fl-fu-quando" title="Quando?"><button class="btn" data-acao="agendar">Agendar</button></div>
    <div class="atalhos"><span>Para:</span><button type="button" data-dias="1">Amanhã</button><button type="button" data-dias="3">Em 3 dias</button><button type="button" data-dias="7">Em 7 dias</button></div>
  </section>
  <section class="fl-sec">
    <h4>Ficha de qualificação <button class="mini" data-acao="ficha">${linhas.length ? 'Editar' : 'Preencher'}</button></h4>
    ${linhas.length
      ? `<dl class="fl-dados">${linhas.map(([t, v]) => `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      : '<button type="button" class="fl-dica" data-acao="ficha"><b>O que o cliente procura?</b><p>Comece pela finalidade (morar, investir ou alugar): a ficha segue o roteiro de cada um, com tipo, orçamento e região.</p></button>'}
  </section>
  <section class="fl-sec">
    <h4>Observações <button class="mini" data-acao="notas">Editar</button></h4>
    <div class="fl-notas">${l.notas ? esc(l.notas) : '<span class="cinza">Sem observações.</span>'}</div>
    <div class="fl-notas-form" hidden><textarea id="fl-notas" rows="5">${esc(l.notas || '')}</textarea><button class="btn" data-acao="salvar-notas">Salvar</button></div>
  </section>
  <section class="fl-sec">
    <h4>Dados do lead</h4>
    <dl class="fl-dados">
      <div><dt>Campanha</dt><dd>${esc(l.campanha || '—')}</dd></div>
      <div><dt>Conjunto</dt><dd>${esc(l.conjunto || '—')}</dd></div>
      <div><dt>Criativo</dt><dd>${esc(l.criativo || '—')}</dd></div>
      <div><dt>Entrou em</dt><dd>${esc(l.entrou)}</dd></div>
      <div><dt>Origem</dt><dd><select data-campo="origem">${opcoes([...new Set([...ORIGENS, ...(l.origem ? [l.origem] : [])])], l.origem, 'Sem origem')}</select></dd></div>
    </dl>
    <div class="fl-rodape"><button class="lnk perigo" data-acao="remover">Remover lead</button></div>
  </section>`;
}

function imoveis(l, ficha) {
  const linhas = resumoFicha(ficha);
  const com = (lista, v) => v && !lista.includes(v) ? [...lista, v] : lista; // não perde um valor que não está na lista
  return `<section class="fl-sec"><h4>O que procura</h4>
    <div class="fl-grade">
      <label>Empreendimento<select data-campo="empreendimento">${opcoes(com(listaEmps(), l.empreendimento), l.empreendimento, '—')}</select></label>
      <label>Tipologia<select data-campo="tipologia">${opcoes(com(['Studio', 'Apartamento', 'Casa', 'Lote', 'Sala comercial'], l.tipologia), l.tipologia, '—')}</select></label>
      <label>Objetivo<select data-campo="objetivo">${opcoes(com(['Investimento', 'Moradia'], l.objetivo), l.objetivo, '—')}</select></label>
    </div>
    ${linhas.length ? `<dl class="fl-dados">${linhas.filter(([t]) => ['Tipo', 'Orçamento', 'Quartos', 'Vagas', 'Área mínima', 'Onde', 'Faz questão de'].includes(t)).map(([t, v]) => `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    <button type="button" class="mini" data-acao="ficha">${linhas.length ? 'Editar ficha de qualificação' : 'Preencher ficha de qualificação'}</button>
  </section>`;
}

function caminho(l) {
  const etapas = atual.historico.filter(h => h.tipo === 'etapa').reverse();
  return `<section class="fl-sec"><h4>Caminho até aqui</h4><ul class="linha-tempo">
    <li><b>Entrou</b><small>${esc(l.entrou)} · ${esc(l.origem || 'sem origem')}</small></li>
    ${etapas.map(h => `<li><b>${esc(h.texto)}</b><small>${h.quando}</small></li>`).join('')}
    <li class="agora"><b>Agora em ${esc(nomeEtapa(l.etapa))}</b></li></ul>
    ${etapas.length ? '' : '<p class="cinza">As próximas mudanças de etapa vão aparecer aqui.</p>'}</section>`;
}

function historico() {
  const tipos = { etapa: 'Etapa', msg: 'Mensagem', nota: 'Anotação', sistema: 'Alteração' };
  const fus = atual.followups.filter(f => f.feito_em).map(f => { const d = new Date(f.feito_em); return { tipo: 'fu', texto: 'Follow-up feito: ' + (f.nota || f.canal), quando: dmy(d) + ' ' + hm(d), criado_em: d.toISOString() }; });
  const tudo = [...atual.historico.map(h => ({ ...h, criado_em: new Date(h.criado_em).toISOString() })), ...fus].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  return `<section class="fl-sec"><h4>Histórico</h4>
    <div class="fl-agendar"><input id="fl-anotacao" placeholder="Escreva uma anotação…"><button class="btn" data-acao="anotar">Anotar</button></div>
    ${tudo.length ? `<ul class="linha-tempo">${tudo.map(h => `<li><b>${esc(h.texto)}</b><small>${tipos[h.tipo] || 'Follow-up'} · ${h.quando}${h.autor ? ' · ' + esc(h.autor) : ''}</small></li>`).join('')}</ul>` : '<p class="cinza">Nada registrado ainda.</p>'}</section>`;
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
function sugerir() {
  const l = atual.lead, lista = MODELOS[l.etapa] || MODELOS.novo;
  const txt = lista[modelo++ % lista.length].replace(/{nome}/g, (l.nome || '').split(' ')[0]).replace(/{empresa}/g, EMPRESA)
    .replace(/{emp}/g, l.empreendimento || 'nossos empreendimentos').replace(/{visita}/g, l.visita_rotulo ? l.visita_rotulo.toLowerCase() : 'agendada');
  const t = document.getElementById('fl-texto');
  t.value = txt; t.focus();
}
async function enviarMensagem() {
  const t = document.getElementById('fl-texto'), txt = t.value.trim();
  if (!txt || !atual.lead.wa) return;
  window.open(atual.lead.wa + '?text=' + encodeURIComponent(txt), '_blank');
  try { await enviar('historico', { id: atual.lead.id, tipo: 'msg', texto: txt }); } catch (e) { return; }
  await recarregarFicha();
}

// ---------- Ações da ficha ----------
async function cliqueFicha(e) {
  const el = e.target.closest('[data-acao], [data-etapa], [data-aba], [data-dias]');
  if (!el) return;
  const l = atual.lead, mostra = sel => { const f = fichaC.querySelector(sel); f.hidden = !f.hidden; };
  if (el.dataset.aba) { aba = el.dataset.aba; desenhar(); return; }
  if (el.dataset.dias) { document.getElementById('fl-fu-quando').value = paraInput(daqui(+el.dataset.dias)); return; }
  try {
    if (el.dataset.etapa) {
      if (el.dataset.etapa === l.etapa) return;
      await mudarEtapa(l.id, el.dataset.etapa, l.etapa); await recarregarFicha(); return;
    }
    switch (el.dataset.acao) {
      case 'fechar': ficha.close(); break;
      case 'ganho': await mudarEtapa(l.id, GANHOS[0], l.etapa); await recarregarFicha(); break;
      case 'perdido': if (confirm('Marcar este lead como perdido?')) { await mudarEtapa(l.id, PERDIDOS[0], l.etapa); await recarregarFicha(); } break;
      case 'naolead': if (confirm('Marcar como "não é lead"?')) { await mudarEtapa(l.id, PERDIDOS[1] || PERDIDOS[0], l.etapa); await recarregarFicha(); } break;
      case 'editar': preencher(l); modal.showModal(); break;
      case 'valor': {
        const v = prompt('Valor do negócio (R$):', l.valor ? Math.round(l.valor) : '');
        if (v !== null) await salvarCampo('valor', v);
        break;
      }
      case 'visita': mostra('.fl-visita-form'); break;
      case 'salvar-visita': {
        const d = doInput(document.getElementById('fl-visita').value);
        if (!d) { alert('Escolha o dia e o horário da visita.'); return; }
        await enviar('lead_campo', { id: l.id, campo: 'visita_em', valor: d.toISOString() });
        // quem ainda não estava em visita agendada passa para lá
        if (['novo', 'primeiro_contato', 'respondeu', 'nao_respondeu'].includes(l.etapa)) await mudarEtapa(l.id, 'visita_agendada', l.etapa);
        await recarregarFicha(); break;
      }
      case 'desmarcar': await salvarCampo('visita_em', ''); break;
      case 'agendar': {
        const q = doInput(document.getElementById('fl-fu-quando').value);
        if (!q) { alert('Escolha quando (ou clique em Amanhã / Em 3 dias / Em 7 dias).'); return; }
        await enviar('fu_salvar', { lead_id: l.id, quando: q.toISOString(), canal: 'WhatsApp', nota: document.getElementById('fl-fu-nota').value });
        window.aviso?.('Follow-up agendado ✓');
        await recarregarFicha(); break;
      }
      case 'fu-feito': await enviar('fu_concluir', { id: Number(el.dataset.fu) }); await recarregarFicha(); break;
      case 'ficha': abrirQuali(); break;
      case 'notas': mostra('.fl-notas-form'); break;
      case 'salvar-notas': await salvarCampo('notas', document.getElementById('fl-notas').value); break;
      case 'anotar': {
        const t = document.getElementById('fl-anotacao').value.trim();
        if (t) { await enviar('historico', { id: l.id, tipo: 'nota', texto: t }); await recarregarFicha(); }
        break;
      }
      case 'remover':
        if (!confirm('Remover este lead de vez?')) return;
        await enviar('lead_excluir', { id: l.id }); mudou = true; ficha.close(); break;
      case 'sugerir': sugerir(); break;
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
  fichaC.addEventListener('keydown', e => {
    if (e.target.id === 'fl-texto' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); }
  });
  ficha.addEventListener('click', e => { if (e.target === ficha) ficha.close(); });
  // o que mudou na ficha aparece no quadro, nas listas e nos números ao fechar
  ficha.addEventListener('close', () => { if (mudou) { mudou = false; atualizar(); } });

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
