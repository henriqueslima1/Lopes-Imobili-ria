/* =====================================================================
   Campos de senha do hub (entrada do hub).
   - O navegador não preenche nem sugere senha guardada: o campo vira texto
     com os caracteres escondidos por CSS (-webkit-text-security). O Chrome
     ignora autocomplete="off" em campos type="password", por isso a troca.
     Onde o navegador não tiver esse CSS, o campo continua type="password".
   - Olhinho para mostrar ou esconder o que foi digitado.
   - Se ainda assim houver algo no campo, a primeira tecla substitui tudo.
   Vale para qualquer campo de senha, inclusive os que aparecem depois
   (telas de entrada, trocar senha, senha do certificado).
   ===================================================================== */
(function () {
  var MASCARA = !!(window.CSS && CSS.supports && CSS.supports('-webkit-text-security', 'disc'));
  var CSS_TXT = '.senha-caixa{position:relative;display:block;width:100%}' +
    '.senha-caixa>input{padding-right:52px!important;width:100%;box-sizing:border-box}' +
    '.senha-caixa>input.senha-oculta{-webkit-text-security:disc}' +
    '.senha-olho{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:40px;height:40px;padding:0;border:0;border-radius:10px;background:transparent;color:inherit;opacity:.55;display:grid;place-items:center;cursor:pointer}' +
    '.senha-olho:hover,.senha-olho:focus-visible{opacity:1}.senha-olho svg{width:20px;height:20px}';
  var ABERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function ligar(input) {
    if (input.dataset.senhaLigada) return;
    input.dataset.senhaLigada = '1';
    if (!document.getElementById('senha-css')) {
      var st = document.createElement('style'); st.id = 'senha-css'; st.textContent = CSS_TXT; (document.head || document.documentElement).appendChild(st);
    }
    var digitou = false;
    input.value = '';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-lpignore', 'true');   // gerenciadores de senha (LastPass)
    input.setAttribute('data-1p-ignore', 'true');  // (1Password)
    if (MASCARA) { input.type = 'text'; input.classList.add('senha-oculta'); }
    // somente leitura até a pessoa tocar no campo: o navegador não preenche campo somente leitura
    input.readOnly = true;
    var liberar = function () { if (input.readOnly) { input.readOnly = false; if (input.value && !digitou) input.value = ''; } };
    input.addEventListener('pointerdown', liberar);
    input.addEventListener('focus', liberar);
    input.addEventListener('keydown', liberar);
    var escondida = function () { return MASCARA ? input.classList.contains('senha-oculta') : input.type === 'password'; };

    var caixa = document.createElement('span');
    caixa.className = 'senha-caixa';
    input.parentNode.insertBefore(caixa, input);
    caixa.appendChild(input);
    var olho = document.createElement('button');
    olho.type = 'button';
    olho.className = 'senha-olho';
    var pintar = function () {
      var vendo = !escondida();
      olho.innerHTML = vendo ? FECHADO : ABERTO;
      olho.setAttribute('aria-label', vendo ? 'Esconder a senha' : 'Mostrar a senha');
      olho.setAttribute('aria-pressed', vendo ? 'true' : 'false');
    };
    olho.addEventListener('click', function () {
      if (MASCARA) input.classList.toggle('senha-oculta'); else input.type = input.type === 'password' ? 'text' : 'password';
      pintar();
      input.focus();
    });
    pintar();
    caixa.appendChild(olho);

    // primeira tecla: se já havia algo no campo, substitui em vez de emendar
    input.addEventListener('input', function () { digitou = true; });
    input.addEventListener('keydown', function (e) {
      if (digitou || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (input.value) input.select();
      digitou = true;
    });
  }

  function varrer(raiz) {
    if (!raiz.querySelectorAll) return;
    if (raiz.matches && raiz.matches('input[type="password"]')) ligar(raiz);
    raiz.querySelectorAll('input[type="password"]').forEach(ligar);
  }
  // já troca os campos que existem (antes de o navegador preencher) e acompanha os que aparecerem depois
  varrer(document);
  new MutationObserver(function (lista) {
    lista.forEach(function (m) { m.addedNodes.forEach(varrer); });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
