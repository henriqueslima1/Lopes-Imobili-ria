// Toques no estilo iPhone: seletor de data em folha, janelas que sobem de baixo,
// deslizar nas tarefas, segurar e arrastar cards no celular, puxar para atualizar e avisos rápidos.
// O que depende da tela desenhada (tarefas, quadro) liga a cada troca de tela (evento crm:tela do nucleo.js).
// vibração curtinha (Android); só depois que a pessoa já tocou na página, senão o navegador bloqueia
const toqueVibrar = () => { try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8); } catch (e) {} };
const prender = (el, id) => { try { el.setPointerCapture(id); } catch (e) {} };

// ---------- Aviso rápido ("Salvo ✓") ----------
function aviso(texto) {
  let el = document.getElementById('aviso-ios');
  if (!el) { el = document.createElement('div'); el.id = 'aviso-ios'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = texto;
  el.classList.remove('mostra'); void el.offsetWidth; el.classList.add('mostra');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('mostra'), 1800);
}

// ---------- Janelas que sobem de baixo (no celular) e fecham puxando para baixo ----------
const abrirOriginal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  if (!this.querySelector(':scope > .alca')) {
    const alca = document.createElement('div');
    alca.className = 'alca'; alca.setAttribute('aria-hidden', 'true');
    this.prepend(alca);
    puxarParaFechar(this, alca);
  }
  return abrirOriginal.call(this);
};
function puxarParaFechar(dlg, alca) {
  let y0 = null, dy = 0;
  alca.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; prender(alca, e.pointerId); dlg.style.transition = 'none'; });
  alca.addEventListener('pointermove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    dlg.style.transform = `translateY(${dy}px)`;
  });
  const soltar = () => {
    if (y0 === null) return;
    y0 = null; dlg.style.transition = '';
    if (dy > 110) { dlg.close(); toqueVibrar(); }
    dlg.style.transform = '';
  };
  alca.addEventListener('pointerup', soltar);
  alca.addEventListener('pointercancel', soltar);
}

// ---------- Seletor de data e hora (folha com dias para deslizar e roda de horários) ----------
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// MESES e p2 vêm do nucleo.js
const doValor = v => { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null; };
const paraValor = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
function rotuloData(d) {
  if (!d) return 'Escolher data';
  const hoje = new Date(), amanha = new Date(); amanha.setDate(hoje.getDate() + 1);
  const dia = mesmoDia(d, hoje) ? 'Hoje' : mesmoDia(d, amanha) ? 'Amanhã' : `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return `${dia} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

let folha = null, alvoData = null, escolha = null;
const HORAS = [];
for (let h = 7; h <= 21; h++) for (const m of [0, 30]) HORAS.push([h, m]);
const ALTURA_HORA = 40;

function montarFolha() {
  folha = document.createElement('dialog');
  folha.className = 'folha-data';
  folha.innerHTML = `<h4>Quando?</h4><div class="dias" role="listbox" aria-label="Dia"></div>
    <div class="roda" aria-label="Horário"><div class="roda-lista"></div></div>
    <div class="folha-acoes"><button type="button" class="btn-borda" data-f="cancelar">Cancelar</button><button type="button" class="btn" data-f="ok">Concluir</button></div>`;
  document.body.append(folha);
  const roda = folha.querySelector('.roda'), lista = folha.querySelector('.roda-lista');
  lista.innerHTML = HORAS.map(([h, m], i) => `<button type="button" data-i="${i}">${p2(h)}:${p2(m)}</button>`).join('');
  // a hora escolhida é a que fica no meio da roda
  let t;
  roda.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.max(0, Math.min(HORAS.length - 1, Math.round(roda.scrollTop / ALTURA_HORA)));
      escolha.setHours(HORAS[i][0], HORAS[i][1]);
      lista.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', i === j));
      toqueVibrar();
    }, 90);
  });
  lista.addEventListener('click', e => { const b = e.target.closest('button'); if (b) roda.scrollTo({ top: b.dataset.i * ALTURA_HORA, behavior: 'smooth' }); });
  folha.querySelector('.dias').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const [a, m, d] = b.dataset.d.split('-').map(Number);
    escolha.setFullYear(a, m - 1, d);
    folha.querySelectorAll('.dias button').forEach(x => x.classList.toggle('on', x === b));
    b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    toqueVibrar();
  });
  folha.addEventListener('click', e => {
    if (e.target === folha) folha.close();
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (f === 'cancelar') folha.close();
    if (f === 'ok') {
      alvoData.value = paraValor(escolha);
      alvoData.dispatchEvent(new Event('input', { bubbles: true }));
      alvoData.dispatchEvent(new Event('change', { bubbles: true }));
      folha.close();
    }
  });
}

function abrirSeletor(input) {
  if (!folha) montarFolha();
  alvoData = input;
  const atual = doValor(input.value);
  escolha = atual || (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
  // minutos arredondados para a roda (de 30 em 30), dentro do horário da roda (07:00 a 21:30)
  escolha.setMinutes(escolha.getMinutes() < 15 ? 0 : escolha.getMinutes() < 45 ? 30 : 60, 0, 0);
  if (escolha.getHours() < 7) escolha.setHours(7, 0);
  if (escolha.getHours() > 21) escolha.setHours(21, 30);
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  if (escolha < inicio) inicio.setTime(new Date(escolha).setHours(0, 0, 0, 0));
  const hoje = new Date();
  let html = '';
  for (let i = 0; i < 60; i++) {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i);
    const nome = mesmoDia(d, hoje) ? 'Hoje' : (i === 1 && mesmoDia(inicio, hoje)) ? 'Amanhã' : DIAS_SEMANA[d.getDay()];
    html += `<button type="button" data-d="${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}" class="${mesmoDia(d, escolha) ? 'on' : ''}"><small>${nome}</small><b>${d.getDate()}</b><small>${MESES[d.getMonth()]}</small></button>`;
  }
  folha.querySelector('.dias').innerHTML = html;
  folha.showModal();
  const i = Math.max(0, HORAS.findIndex(([h, m]) => h === escolha.getHours() && m === escolha.getMinutes()));
  folha.querySelector('.roda').scrollTop = i * ALTURA_HORA;
  folha.querySelectorAll('.roda-lista button').forEach((b, j) => b.classList.toggle('on', i === j));
  folha.querySelector('.dias .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// Troca cada campo de data e hora por um botão que abre a folha (o campo original continua guardando o valor)
const valorNativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function melhorarData(input) {
  if (input._ios) return;
  input._ios = true;
  const botao = document.createElement('button');
  botao.type = 'button'; botao.className = 'campo-data';
  const atualizar = () => { const d = doValor(valorNativo.get.call(input)); botao.innerHTML = `<span>${rotuloData(d)}</span>`; botao.classList.toggle('vazio', !d); };
  // atalhos como "Amanhã" mudam o valor por código: o botão acompanha
  Object.defineProperty(input, 'value', { configurable: true, get() { return valorNativo.get.call(this); }, set(v) { valorNativo.set.call(this, v); atualizar(); } });
  input.classList.add('data-escondida');
  input.after(botao);
  botao.addEventListener('click', () => abrirSeletor(input));
  atualizar();
}
const procurarDatas = raiz => raiz.querySelectorAll?.('input[type="datetime-local"]').forEach(melhorarData);
procurarDatas(document);
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches?.('input[type="datetime-local"]')) melhorarData(n); else procurarDatas(n); } })))
  .observe(document.body, { childList: true, subtree: true });

// ---------- Deslizar nas linhas (tarefas): direita = feito, esquerda = mostra ações ----------
function deslizavel(li) {
  const frente = li.querySelector('.t-frente');
  if (!frente || li._sw) return;
  li._sw = true;
  let x0 = null, y0 = 0, dx = 0, base = 0, horizontal = null;
  const ABRE = -150, FEITO = 90;
  frente.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('button, a, input, select')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; horizontal = null;
    base = li.classList.contains('aberta') ? ABRE : 0;
  });
  frente.addEventListener('pointermove', e => {
    if (x0 === null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (horizontal === null && Math.hypot(mx, my) > 8) {
      horizontal = Math.abs(mx) > Math.abs(my);
      if (horizontal) { prender(frente, e.pointerId); frente.style.transition = 'none'; }
    }
    if (!horizontal) return;
    dx = Math.max(-220, Math.min(160, base + mx));
    frente.style.transform = `translateX(${dx}px)`;
    li.classList.toggle('vai-concluir', dx > FEITO && !!li.querySelector('[data-acao="concluir"]'));
  });
  const soltar = () => {
    if (x0 === null) return;
    x0 = null; frente.style.transition = '';
    if (!horizontal) return;
    li._deslizou = Date.now(); // o toque que termina o gesto não conta como clique
    const concluir = li.querySelector('.t-frente [data-acao="concluir"]');
    if (dx > FEITO && concluir) { toqueVibrar(); frente.style.transform = ''; li.classList.remove('vai-concluir'); concluir.click(); return; }
    const abrir = dx < ABRE / 2;
    document.querySelectorAll('.tarefa.aberta').forEach(o => { if (o !== li) { o.classList.remove('aberta'); o.querySelector('.t-frente').style.transform = ''; } });
    li.classList.toggle('aberta', abrir);
    frente.style.transform = abrir ? `translateX(${ABRE}px)` : '';
    li.classList.remove('vai-concluir');
    if (abrir) toqueVibrar();
  };
  frente.addEventListener('pointerup', soltar);
  frente.addEventListener('pointercancel', soltar);
}
document.addEventListener('crm:tela', () => document.querySelectorAll('.tarefa').forEach(deslizavel));
// tocar fora fecha a linha aberta
document.addEventListener('pointerdown', e => {
  if (e.target.closest?.('.tarefa.aberta')) return;
  document.querySelectorAll('.tarefa.aberta').forEach(o => { o.classList.remove('aberta'); o.querySelector('.t-frente').style.transform = ''; });
});

// ---------- Segurar e arrastar cards do CRM no celular ----------
document.addEventListener('crm:tela', () => {
  const quadro = document.querySelector('.quadro');
  if (!quadro || quadro._toque || typeof mover !== 'function') return;
  quadro._toque = true;
  let timer = null, card = null, fantasma = null, colAlvo = null, ultimo = null, rolar = null, arrastou = false;
  const colunaEm = (x, y) => document.elementFromPoint(x, y)?.closest('.coluna');
  const fim = () => {
    clearTimeout(timer); timer = null;
    clearInterval(rolar); rolar = null;
    if (fantasma) {
      fantasma.remove(); fantasma = null;
      quadro.style.scrollSnapType = '';
      card.classList.remove('drag');
      document.querySelectorAll('.coluna.alvo').forEach(c => c.classList.remove('alvo'));
      if (colAlvo && colAlvo !== card.closest('.coluna')) mover(card, colAlvo.dataset.etapa);
    }
    card = null; colAlvo = null;
  };
  quadro.addEventListener('touchstart', e => {
    const c = e.target.closest('.lead');
    if (!c || e.touches.length > 1 || e.target.closest('a, button')) return;
    const t = e.touches[0]; ultimo = t; arrastou = false;
    timer = setTimeout(() => {
      card = c; arrastou = true; toqueVibrar();
      const r = c.getBoundingClientRect();
      fantasma = c.cloneNode(true);
      fantasma.className = 'lead fantasma';
      Object.assign(fantasma.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
      fantasma._dx = ultimo.clientX - r.left; fantasma._dy = ultimo.clientY - r.top;
      document.body.append(fantasma);
      c.classList.add('drag');
      quadro.style.scrollSnapType = 'none'; // o encaixe das colunas puxaria a rolagem de volta
      // perto das bordas, o quadro rola sozinho para os lados
      rolar = setInterval(() => {
        const x = ultimo.clientX;
        if (x < 40) quadro.scrollLeft -= 12; else if (x > innerWidth - 40) quadro.scrollLeft += 12;
      }, 16);
    }, 380);
  }, { passive: true });
  quadro.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (!fantasma) {
      // mexeu antes do tempo: é rolagem normal, não arraste
      if (timer && Math.hypot(t.clientX - ultimo.clientX, t.clientY - ultimo.clientY) > 10) { clearTimeout(timer); timer = null; }
      return;
    }
    e.preventDefault();
    ultimo = t;
    fantasma.style.left = (t.clientX - fantasma._dx) + 'px';
    fantasma.style.top = (t.clientY - fantasma._dy) + 'px';
    const col = colunaEm(t.clientX, t.clientY);
    if (col !== colAlvo) { colAlvo?.classList.remove('alvo'); colAlvo = col; colAlvo?.classList.add('alvo'); }
  }, { passive: false });
  quadro.addEventListener('touchend', fim);
  quadro.addEventListener('touchcancel', fim);
  // depois de arrastar, o toque não abre a ficha
  quadro.addEventListener('click', e => { if (arrastou) { e.stopPropagation(); e.preventDefault(); arrastou = false; } }, true);
  quadro.addEventListener('contextmenu', e => { if (e.target.closest('.lead')) e.preventDefault(); });
});

// ---------- Puxar para atualizar (no topo da página, no celular) ----------
quandoPronto(() => {
  let y0 = null, dy = 0;
  const seta = document.createElement('div');
  seta.id = 'puxar'; seta.innerHTML = '<span>↓</span>';
  document.body.append(seta);
  addEventListener('touchstart', e => {
    y0 = (scrollY <= 0 && !document.querySelector('dialog[open]') && !e.target.closest('.quadro .lead, .roda, .dias')) ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (scrollY > 0) { y0 = null; return; }
    const d = Math.min(dy / 2, 90);
    seta.style.transform = `translate(-50%, ${d - 50}px) rotate(${d > 60 ? 180 : 0}deg)`;
    seta.classList.toggle('pronto', d > 60);
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 === null) return;
    y0 = null;
    if (dy / 2 > 60) { seta.classList.add('girando'); toqueVibrar(); atualizar().catch(() => {}).finally(() => { seta.classList.remove('girando', 'pronto'); seta.style.transform = ''; }); }
    else seta.style.transform = '';
  });
});
