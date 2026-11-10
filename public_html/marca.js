/* =====================================================================
   MARCA: os dados da imobiliária, num lugar só.
   Troque os textos entre aspas, salve e envie o arquivo de novo para o servidor.
   Se a mudança não aparecer, recarregue a página com Ctrl+F5.
   ===================================================================== */
window.MARCA = {
  empresa: 'Lopes Imobiliária', // nome da empresa: rodapé e título da aba
  hub: 'Hub Lopes',             // nome do hub na tela de entrada (vazio = "Hub" + primeiro nome da empresa)
  saudacao: 'equipe',           // "Bom dia, equipe"
  iniciais: 'LI',               // botão redondo da conta (vazio = iniciais do nome)
  site: '',                     // site da imobiliária, ex.: 'https://www.lopesimobiliaria.com.br/' (vazio = rodapé sem link)
  logo: '',                     // imagem da logo, ex.: 'logo.png' na mesma pasta deste arquivo (vazio = símbolo da casinha)
  cor: '#0E5B66',               // cor principal (botões, ícone do CRM, dia de hoje). Vazio = petróleo padrão
  acento: '#C8963E'             // cor de destaque (ícone da Agenda, detalhes). Vazio = dourado padrão
};

/* Daqui para baixo não precisa mexer: acerta o endereço da logo para qualquer pasta. */
(function () {
  try {
    var m = window.MARCA, s = document.currentScript;
    if (m.logo && !/^(https?:|data:|\/)/i.test(m.logo) && s && s.src) m.logo = new URL(m.logo, s.src).href;
  } catch (e) { /* ok */ }
})();
