// Comum a todas as telas do CRM: configuração do funil, conversa com o servidor (crm/api.php),
// datas, peças de tela (menu lateral, filtros, ícones), a troca de telas sem recarregar a página,
// entrada com a senha e os Ajustes.
// O CRM é uma página só: os dados vêm uma vez e cada tela (Dashboard, CRM, Leads, Follow-ups) é
// desenhada na hora, sem voltar ao servidor. As quatro páginas .html são iguais: a tela sai do endereço.
// Sem o servidor, o CRM abre em MODO EXEMPLO: dados de exemplo guardados só neste navegador.

// ===== Configuração do funil — mude aqui =====
// Etapas: chave => nome que aparece (as chaves são as mesmas de server/rotas/crm.js)
const ETAPAS = {
  novo: 'Novo', primeiro_contato: 'Primeiro contato', respondeu: 'Respondeu', nao_respondeu: 'Não respondeu',
  visita_agendada: 'Visita agendada', proposta: 'Proposta', venda: 'Venda', perdido: 'Perdido', sem_intencao: 'Sem intenção'
};
// Cor de cada etapa (petróleo da marca no começo, dourado na proposta; coral = alguém esperando você, como as bolhas do hub)
const CORES = {
  novo: '#0E5B66', primeiro_contato: '#3B8A94', respondeu: '#E4573D', nao_respondeu: '#D97706', visita_agendada: '#2563EB',
  proposta: '#B9852F', venda: '#16A34A', perdido: '#BE123C', sem_intencao: '#8E9B98'
};
// Etapas que pedem atenção: ficam em destaque no dashboard e no quadro
const ATENCAO = ['respondeu', 'visita_agendada'];
// Colunas do CRM em cada aba (na ordem em que aparecem)
const ABERTAS = ['novo', 'primeiro_contato', 'respondeu', 'nao_respondeu', 'visita_agendada', 'proposta'];
const GANHOS = ['venda'];
const PERDIDOS = ['perdido', 'sem_intencao'];
// Barra de etapas no topo da ficha do lead
const CAMINHO = ['novo', 'primeiro_contato', 'respondeu', 'visita_agendada', 'proposta'];
const ORIGENS = ['Formulário', 'Anúncio', 'Cadastro manual', 'WhatsApp direto', 'Instagram', 'Indicação'];
// Ícone de cada origem
const ICO_ORIGEM = { 'Formulário': 'form', 'Anúncio': 'anuncio', 'Cadastro manual': 'lapis', 'Planilha': 'planilha', 'WhatsApp direto': 'whats', 'Instagram': 'anuncio' };
const TEMPERATURAS = { quente: 'Quente', morno: 'Morno', frio: 'Frio' };
const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta' };
// Sugestão de follow-up por etapa: [em quantos dias após a última mudança, o que fazer]. Etapas fora daqui não recebem sugestão.
const FU_REGRAS = {
  novo: [0, 'Fazer o primeiro contato'], respondeu: [0, 'Responder e puxar para a visita'], visita_agendada: [1, 'Confirmar a visita'],
  primeiro_contato: [1, 'Retomar a conversa'], proposta: [2, 'Cobrar retorno da proposta'], nao_respondeu: [2, 'Nova tentativa de contato'],
  venda: [30, 'Pós-venda: pedir indicação']
};
// As cores dos gráficos do dashboard ficam em estilo.css (--serie e --f1..--f6, validadas no contraste claro e escuro)

// ===== Marca (marca.js na raiz do site) =====
const MARCA_CRM = Object.assign({ empresa: 'Sua Empresa', saudacao: 'equipe', iniciais: '', logo: '' }, (typeof MARCA === 'object' && MARCA) || {});
const EMPRESA = String(MARCA_CRM.empresa || 'Sua Empresa');
const NOME_CURTO = EMPRESA.trim().split(/\s+/)[0] || 'CRM';
// Endereço do Hub de Ferramentas (marca.js → hub); vazio = sem o botão "Voltar ao Hub"
const HUB = /^(https?:\/\/|\/)/i.test(String(MARCA_CRM.hub || '').trim()) ? String(MARCA_CRM.hub).trim() : '';

// ===== Pequenas ajudas =====
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cor = k => CORES[k] || '#7A7A7A';
const nomeEtapa = k => ETAPAS[k] || k || '—';
const wa = tel => { let d = String(tel || '').replace(/\D/g, ''); if (d.length <= 11) d = '55' + d; return 'https://wa.me/' + d; };
const dinheiro = v => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const p2 = n => String(n).padStart(2, '0');
const hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const dm = d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
const dmy = d => `${dm(d)}/${d.getFullYear()}`;
const diaLocal = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dataCurta = d => d ? `${d.getDate()} de ${MESES[d.getMonth()]}` : '';  // "22 de out"
const meiaNoite = (n = 0, base = new Date()) => { const d = new Date(base); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const daqui = (dias, hora = 10) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(hora, 0, 0, 0); return d; };
const paraInput = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
const doInput = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; }; // "2026-10-24T10:00" é horário local
const iniciais = nome => { const p = String(nome || '').trim().split(/\s+/); return ((p[0] || '')[0] || '') + (p.length > 1 ? (p[p.length - 1][0] || '') : ''); };
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

// "20 min", "5 h", "2 dias"
function tempoDesde(d) {
  if (!d) return '';
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h';
  const n = Math.floor(s / 86400);
  return n + (n === 1 ? ' dia' : ' dias');
}
// "Hoje, 14:00", "Amanhã, 10:00", "Ontem", "Há 3 dias", "qua 24/10, 10:00"
function fuQuando(d) {
  const dia = diaLocal(d), hoje = diaLocal(new Date());
  if (dia === hoje) return 'Hoje, ' + hm(d);
  if (dia === diaLocal(meiaNoite(1))) return 'Amanhã, ' + hm(d);
  if (dia < hoje) { const n = Math.round((meiaNoite(0) - meiaNoite(0, d)) / 86400000); return n === 1 ? 'Ontem' : `Há ${n} dias`; }
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()] + ' ' + dm(d) + ', ' + hm(d);
}
// "Qua, 21 de out · 15:00"
const dataLonga = d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()] + ', ' + dataCurta(d) + ' · ' + hm(d);

// Ícones (traço simples, herdam a cor do texto)
const ICONES = {
  grafico: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  quadro: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>',
  tarefa: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  lua: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  voltar: '<path d="m15 18-6-6 6-6"/>',
  recolher: '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  mais1: '<path d="M12 5v14M5 12h14"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  whats: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.5 9.5c.5 2 2 3.5 4 4l1.2-1.2 2 1-.5 1.7c-3.5.2-7.4-3.7-7.2-7.2l1.7-.5 1 2Z"/>',
  form: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  anuncio: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  planilha: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  lapis: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  lixo: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  estrela: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"/>',
  mais: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  grade: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  ajustes: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>'
};
const ico = nome => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;
// Etiqueta de status: Urgente (vermelho), Atenção (laranja), Em dia (verde)
function tag(tipo) {
  const [txt, i] = { urgente: ['Urgente', 'alerta'], atencao: ['Atenção', 'relogio'], emdia: ['Em dia', 'ok'] }[tipo];
  return `<span class="tag ${tipo}">${ico(i)}${txt}</span>`;
}

// ===== Servidor (crm/api.php); sem servidor vira exemplo guardado neste navegador =====
let DEMO = false, falouComServidor = false;
async function api(acao, dados = {}) {
  if (DEMO) return demo(acao, dados);
  let r;
  try {
    r = await fetch('api.php?acao=' + acao, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
  } catch (e) {
    // se o servidor já respondeu antes, foi só a internet piscando: avisa em vez de cair no modo exemplo
    if (falouComServidor) throw Object.assign(new Error('Sem conexão com o servidor. Tente de novo em instantes.'), { status: 0 });
    DEMO = true; return demo(acao, dados);
  }
  if (!(r.headers.get('content-type') || '').includes('json')) {
    if (falouComServidor) throw Object.assign(new Error('O servidor respondeu algo inesperado. Recarregue a página.'), { status: r.status });
    DEMO = true; return demo(acao, dados);
  }
  falouComServidor = true;
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.erro || 'Algo deu errado.'), { status: r.status });
  return j;
}
// Ações das telas: se a sessão caiu pede a senha de novo; outro erro aparece numa caixa
async function enviar(acao, dados) {
  try { return await api(acao, dados); } catch (e) {
    if (e.status === 401) telaEntrada(); else alert(e.message);
    throw e;
  }
}

// ---------- modo exemplo ----------
const CHAVE_DEMO = 'hub-crm-exemplo-v1';
function semear() {
  const agora = Date.now(), dia = 86400000, iso = t => new Date(t).toISOString();
  const em = (dias, hora = 10, min = 0) => { const d = daqui(dias, hora); d.setMinutes(min); return iso(d); };
  // [nome, telefone, etapa, criado (dias atrás), última mudança (dias atrás), origem, campanha, empreendimento, tipologia, objetivo, responsável, extra]
  const EX = [
    ['Ana Souza', '(34) 99812-4410', 'novo', 0, 0, 'Anúncio', 'Lançamento Torre', 'Empreendimento A', 'Apartamento', 'Moradia', ''],
    ['Bruno Lima', '(34) 99134-2201', 'novo', 1, 1.2, 'Formulário', 'Lançamento Torre', 'Empreendimento A', 'Apartamento', 'Investimento', ''],
    ['Olívia Santos', '(34) 98820-1133', 'novo', 4, 4, '', '', 'Empreendimento B', '', '', ''],
    ['Carla Mendes', '(34) 99701-5566', 'respondeu', 2, 0.1, 'Anúncio', 'Casas no condomínio', 'Empreendimento B', 'Casa', 'Moradia', 'Ana Paula'],
    ['Diego Rocha', '(34) 99245-7788', 'respondeu', 5, 1.5, 'Instagram', '', 'Empreendimento A', 'Studio', 'Investimento', 'Rafael'],
    ['Paulo Henrique', '(34) 99613-9090', 'respondeu', 30, 3.2, 'Indicação', '', 'Empreendimento B', 'Casa', 'Moradia', 'Ana Paula'],
    ['Elisa Prado', '(34) 99876-3412', 'primeiro_contato', 3, 2, 'Anúncio', 'Lançamento Torre', 'Empreendimento A', 'Apartamento', 'Moradia', 'Rafael'],
    ['Fábio Nunes', '(34) 99102-6754', 'primeiro_contato', 7, 4, 'Formulário', 'Casas no condomínio', 'Empreendimento B', 'Casa', 'Moradia', 'Ana Paula'],
    ['Gabriela Torres', '(34) 99555-1290', 'nao_respondeu', 9, 5, 'Anúncio', 'Lançamento Torre', 'Empreendimento A', 'Apartamento', 'Investimento', 'Rafael'],
    ['Henrique Alves', '(34) 99321-4545', 'visita_agendada', 8, 1, 'Anúncio', 'Casas no condomínio', 'Empreendimento B', 'Casa', 'Moradia', 'Ana Paula', { visita_em: em(1, 15), temperatura: 'quente' }],
    ['Isabela Costa', '(34) 99788-6060', 'visita_agendada', 12, 2, 'WhatsApp direto', '', 'Empreendimento A', 'Apartamento', 'Moradia', 'Rafael', { visita_em: em(0, 17, 30), temperatura: 'morno' }],
    ['João Pedro Martins', '(34) 99410-2323', 'proposta', 15, 3, 'Anúncio', 'Lançamento Torre', 'Empreendimento A', 'Apartamento', 'Investimento', 'Ana Paula', { valor: 420000, temperatura: 'quente' }],
    ['Karina Dias', '(34) 99632-7171', 'proposta', 21, 6, 'Formulário', 'Casas no condomínio', 'Empreendimento B', 'Casa', 'Moradia', 'Rafael', { valor: 310000 }],
    ['Lucas Ferreira', '(34) 99287-3030', 'venda', 26, 5, 'Anúncio', 'Lançamento Torre', 'Empreendimento A', 'Apartamento', 'Moradia', 'Ana Paula', { valor: 380000 }],
    ['Renata Gomes', '(34) 99190-8484', 'venda', 52, 20, 'Indicação', '', 'Empreendimento B', 'Casa', 'Moradia', 'Rafael', { valor: 290000 }],
    ['Mariana Ribeiro', '(34) 99944-1212', 'perdido', 18, 10, 'Anúncio', 'Casas no condomínio', 'Empreendimento B', 'Casa', 'Investimento', 'Ana Paula'],
    ['Nicolas Barros', '(34) 99058-6363', 'sem_intencao', 11, 9, 'Formulário', 'Lançamento Torre', 'Empreendimento A', 'Studio', 'Investimento', ''],
    ['Sérgio Moura', '(34) 99367-2525', 'perdido', 44, 30, 'Anúncio', 'Lançamento Torre', 'Empreendimento A', 'Apartamento', 'Moradia', 'Rafael']
  ];
  const leads = EX.map(([nome, telefone, etapa, c, a, origem, campanha, empreendimento, tipologia, objetivo, responsavel, extra], i) => ({
    id: i + 1, nome, telefone, etapa, origem, campanha, conjunto: campanha ? 'Público 25-45 · Interesses imóveis' : '', criativo: campanha ? 'Vídeo fachada 15s' : '',
    empreendimento, tipologia, objetivo, responsavel, prioridade: 'normal', criado_em: iso(agora - c * dia - 3600000 * (i % 5)), atualizado_em: iso(agora - a * dia), ...(extra || {})
  }));
  const id = nome => leads.find(l => l.nome === nome).id;
  const followups = [
    { id: 1, lead_id: id('Diego Rocha'), quando: em(-1, 10), canal: 'WhatsApp', nota: 'Mandar a tabela de preços' },
    { id: 2, lead_id: id('Isabela Costa'), quando: em(0, 11), canal: 'WhatsApp', nota: 'Confirmar a visita' },
    { id: 3, lead_id: id('João Pedro Martins'), quando: em(1, 10), canal: 'Ligação', nota: 'Cobrar retorno da proposta' },
    { id: 4, lead_id: id('Karina Dias'), quando: em(4, 14), canal: 'WhatsApp', nota: 'Enviar simulação do financiamento' },
    { id: 5, lead_id: id('Elisa Prado'), quando: em(-2, 10), canal: 'WhatsApp', nota: 'Primeiro contato', feito_em: em(-2, 10, 40) },
    { id: 6, lead_id: id('Fábio Nunes'), quando: em(-6, 10), canal: 'Ligação', nota: 'Retomar a conversa', feito_em: em(-5, 9) }
  ].map(f => ({ ...f, criado_em: iso(agora - 8 * dia) }));
  const historico = [
    { id: 1, lead_id: id('Carla Mendes'), tipo: 'etapa', texto: 'Novo → Primeiro contato', criado_em: iso(agora - 1.5 * dia) },
    { id: 2, lead_id: id('Carla Mendes'), tipo: 'msg', texto: 'Oi Carla! Tudo bem? Vi seu interesse nas casas do condomínio. Posso te mandar as plantas?', criado_em: iso(agora - 1.5 * dia + 60000) },
    { id: 3, lead_id: id('Carla Mendes'), tipo: 'etapa', texto: 'Primeiro contato → Respondeu', criado_em: iso(agora - 0.1 * dia) }
  ];
  return { seq: 100, leads, followups, historico, ajustes: { empreendimentos: ['Empreendimento A', 'Empreendimento B'], responsaveis: ['Ana Paula', 'Rafael'], metas: { respondeu: 50, visita_agendada: 20, venda: 5 } } };
}
function lerDemo() {
  try { const d = JSON.parse(localStorage.getItem(CHAVE_DEMO)); if (d && Array.isArray(d.leads)) return d; } catch (e) {}
  const d = semear(); gravarDemo(d); return d;
}
function gravarDemo(d) { try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(d)); } catch (e) {} }
function demo(acao, x) {
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  if (acao === 'sessao') return { logado: ls('hub-crm-exemplo-logado') === '1', usuario: { nome: 'Administrador', papel: 'admin' } };
  if (acao === 'entrar') { ls('hub-crm-exemplo-logado', '1'); return { ok: true }; }
  if (acao === 'sair') { ls('hub-crm-exemplo-logado', null); return { ok: true }; }
  if (ls('hub-crm-exemplo-logado') !== '1') throw Object.assign(new Error('Entre de novo com a senha.'), { status: 401 });
  const d = lerDemo(), agora = new Date().toISOString(), copia = o => JSON.parse(JSON.stringify(o));
  const falha = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
  const lead = id => d.leads.find(l => l.id === Number(id)) || falha('Lead não encontrado. Recarregue a página.');
  const fu = id => d.followups.find(f => f.id === Number(id)) || falha('Follow-up não encontrado. Recarregue a página.');
  const hist = (id, tipo, texto) => d.historico.push({ id: ++d.seq, lead_id: Number(id), tipo, texto, criado_em: agora });
  let r = { ok: true };
  switch (acao) {
    case 'dados': return copia({ leads: d.leads.map(({ ficha, ...l }) => l).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)), followups: d.followups, ajustes: { ...d.ajustes, agenda: false }, usuario: { nome: 'Administrador', papel: 'admin' } });
    case 'agenda': return { configurada: false, exemplo: true };
    case 'lead': {
      const l = lead(x.id);
      return copia({ lead: l, followups: d.followups.filter(f => f.lead_id === l.id).sort((a, b) => (!!a.feito_em - !!b.feito_em) || a.quando.localeCompare(b.quando)),
        historico: d.historico.filter(h => h.lead_id === l.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em) || b.id - a.id) });
    }
    case 'lead_salvar': {
      const v = Object.fromEntries(['nome', 'telefone', 'instagram', 'objetivo', 'tipologia', 'empreendimento', 'notas'].map(k => [k, String(x[k] || '').trim()]));
      if (!v.nome && !v.telefone) falha('Informe o nome ou o telefone do lead.');
      if (x.id) { Object.assign(lead(x.id), v, { atualizado_em: agora }); r = { id: Number(x.id) }; }
      else { const id = ++d.seq; d.leads.push({ id, ...v, etapa: 'novo', origem: 'Cadastro manual', prioridade: 'normal', criado_em: agora, atualizado_em: agora }); r = { id }; }
      break;
    }
    case 'lead_excluir': {
      const id = Number(x.id);
      d.leads = d.leads.filter(l => l.id !== id); d.followups = d.followups.filter(f => f.lead_id !== id); d.historico = d.historico.filter(h => h.lead_id !== id);
      break;
    }
    case 'etapa': {
      const l = lead(x.id);
      if (!ETAPAS[x.etapa]) falha('Etapa inválida.');
      if (l.etapa !== x.etapa) { hist(l.id, 'etapa', `${nomeEtapa(l.etapa)} → ${nomeEtapa(x.etapa)}`); l.etapa = x.etapa; l.atualizado_em = agora; l.vendido_em = x.etapa === 'venda' ? agora : null; }
      break;
    }
    case 'lead_campo': {
      const l = lead(x.id), c = x.campo;
      let v = x.valor;
      if (c === 'valor') { const s = String(v ?? '').replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'); v = s === '' ? null : Number(s) || 0; }
      else if (c === 'nao_contatar') v = [true, 1, '1'].includes(v);
      else if (c === 'visita_em') v = v ? new Date(v).toISOString() : null;
      else if (c === 'ficha') v = typeof v === 'string' ? JSON.parse(v || '{}') : v;
      else v = String(v ?? '').trim();
      l[c] = v; l.atualizado_em = agora;
      const ROT = { origem: 'Origem', campanha: 'Campanha', conjunto: 'Conjunto', criativo: 'Criativo', empreendimento: 'Empreendimento', tipologia: 'Tipologia', objetivo: 'Objetivo' };
      hist(l.id, 'sistema', {
        valor: () => 'Valor: ' + (v === null ? 'removido' : dinheiro(v)), responsavel: () => 'Responsável: ' + (v || 'ninguém'),
        visita_em: () => v ? 'Visita marcada para ' + dm(new Date(v)) + ' ' + hm(new Date(v)) : 'Visita desmarcada',
        prioridade: () => 'Prioridade: ' + (PRIORIDADES[v] || v), temperatura: () => 'Temperatura: ' + (TEMPERATURAS[v] || 'nenhuma'),
        nao_contatar: () => v ? 'Marcado como "não contatar"' : 'Liberado para contato', notas: () => 'Observações editadas', ficha: () => 'Ficha de qualificação preenchida'
      }[c]?.() || `${ROT[c] || c}: ${v}`);
      break;
    }
    case 'historico': lead(x.id); hist(x.id, ['msg', 'nota'].includes(x.tipo) ? x.tipo : 'nota', String(x.texto || '').slice(0, 4000)); break;
    case 'fu_salvar':
      if (x.id) Object.assign(fu(x.id), { quando: new Date(x.quando).toISOString(), canal: x.canal || '', nota: x.nota || '' });
      else { lead(x.lead_id); const id = ++d.seq; d.followups.push({ id, lead_id: Number(x.lead_id), quando: new Date(x.quando).toISOString(), canal: x.canal || '', nota: x.nota || '', criado_em: agora }); r = { id }; }
      break;
    case 'fu_concluir': {
      const f = fu(x.id);
      if (!f.feito_em) {
        f.feito_em = agora;
        if (x.proximo) d.followups.push({ id: ++d.seq, lead_id: f.lead_id, quando: new Date(x.proximo).toISOString(), canal: f.canal, nota: 'Próximo contato', criado_em: agora });
      }
      break;
    }
    case 'fu_adiar': fu(x.id).quando = new Date(x.quando).toISOString(); break;
    case 'fu_excluir': d.followups = d.followups.filter(f => f.id !== Number(x.id)); break;
    case 'ajustes_salvar': d.ajustes = { ...d.ajustes, empreendimentos: x.empreendimentos || [], metas: x.metas }; break;
  }
  gravarDemo(d);
  return r;
}

// ===== Dados carregados para a tela =====
const CRM = { leads: [], followups: [], ajustes: { empreendimentos: [], responsaveis: [], metas: {} }, porId: new Map(), usuario: null };
// O administrador vê os Ajustes; os colaboradores não
const ehAdmin = () => !CRM.usuario || CRM.usuario.papel === 'admin';
function aplicar(d) {
  const data = v => v ? new Date(v) : null;
  CRM.leads = d.leads.map(l => ({ ...l, etapa: ETAPAS[l.etapa] ? l.etapa : 'novo', criado_em: data(l.criado_em), atualizado_em: data(l.atualizado_em), visita_em: data(l.visita_em) }));
  CRM.porId = new Map(CRM.leads.map(l => [l.id, l]));
  CRM.followups = d.followups.map(f => ({ ...f, quando: data(f.quando), feito_em: data(f.feito_em), lead: CRM.porId.get(f.lead_id) })).filter(f => f.lead);
  CRM.ajustes = d.ajustes;
  CRM.usuario = d.usuario || null;
}
// Cópia da última resposta nesta aba do navegador: ao recarregar (F5) a tela aparece na hora e se atualiza em seguida
const CHAVE_CACHE = 'hub-crm-dados';
const lerCache = () => { try { return JSON.parse(sessionStorage.getItem(CHAVE_CACHE)); } catch (e) { return null; } };
const gravarCache = json => { try { sessionStorage.setItem(CHAVE_CACHE, json); } catch (e) {} };
const limparCache = () => { try { sessionStorage.removeItem(CHAVE_CACHE); } catch (e) {} };
// Valores já usados num campo dos leads (para os filtros)
const valoresDe = col => [...new Set(CRM.leads.map(l => l[col]).filter(v => v != null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
const listaResponsaveis = () => [...new Set([...(CRM.ajustes.responsaveis || []), ...valoresDe('responsavel')])];
const listaEmps = () => [...new Set([...(CRM.ajustes.empreendimentos || []), ...CRM.leads.map(l => l.empreendimento).filter(Boolean)])];
// Quantos leads há em cada etapa (todos os empreendimentos)
function contagemEtapas() { const c = {}; for (const l of CRM.leads) c[l.etapa] = (c[l.etapa] || 0) + 1; return c; }
// Follow-ups pendentes atrasados (antes de hoje) e para hoje
function fuContagem() {
  const hoje = meiaNoite(0), amanha = meiaNoite(1);
  let atrasados = 0, nHoje = 0;
  for (const f of CRM.followups) if (!f.feito_em) { if (f.quando < hoje) atrasados++; else if (f.quando < amanha) nHoje++; }
  return { atrasados, hoje: nHoje };
}

// ===== Filtros da URL =====
// Lê período (dias), empreendimento e busca; url() monta links mantendo os filtros
function filtros(periodos, padrao) {
  const g = new URLSearchParams(location.search);
  let dias = parseInt(g.get('dias') ?? padrao, 10);
  if (!periodos.some(([n]) => n === dias)) dias = padrao;
  const emp = (g.get('emp') || '').trim(), q = (g.get('q') || '').trim();
  const url = mudar => '?' + new URLSearchParams(Object.entries({ emp, q, dias, ...mudar }).filter(([, v]) => v !== '' && v != null)).toString();
  return { dias, emp, q, url };
}
// Botões 7 / 30 / 90 dias
const seletorPeriodo = (periodos, dias, url) => '<nav class="seg" aria-label="Período">' + periodos.map(([n, rot]) => `<a href="${esc(url({ dias: n }))}"${n === dias ? ' class="on"' : ''}>${rot}</a>`).join('') + '</nav>';
// Filtro de empreendimento (e busca, quando q não é null)
function formFiltros(emp, dias, q = null) {
  return `<form class="filtros" method="get"><input type="hidden" name="dias" value="${dias}">
    <select name="emp" onchange="enviarFiltro(this.form)"><option value="">Todos os empreendimentos</option>${listaEmps().map(e => `<option${e === emp ? ' selected' : ''}>${esc(e)}</option>`).join('')}</select>
    ${q !== null ? `<input name="q" value="${esc(q)}" placeholder="Buscar nome, telefone, @" data-busca-viva>` : ''}</form>`;
}
// Opções de um <select> (lista simples ou objeto chave => nome)
const opcoes = (lista, sel, vazio) => (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '') +
  (Array.isArray(lista) ? lista.map(v => [v, v]) : Object.entries(lista)).map(([v, t]) => `<option value="${esc(v)}"${String(sel ?? '') === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('');

// ===== Telas e troca de tela sem recarregar =====
const TELAS = {};
const ARQUIVOS = { dashboard: 'index.html', crm: 'quadro.html', leads: 'leads.html', followups: 'followups.html' };
const MENU = [['dashboard', 'Dashboard', 'grafico'], ['crm', 'CRM', 'quadro'], ['leads', 'Leads', 'pessoas'], ['followups', 'Follow-ups', 'tarefa']];
// Cada tela se registra com o título e a função que desenha (chamada a cada troca de tela e quando os dados mudam)
const registrarTela = (chave, def) => { TELAS[chave] = def; };
let telaAtual = null;
const telaDaUrl = () => { const arq = location.pathname.split('/').pop(); return Object.keys(ARQUIVOS).find(k => ARQUIVOS[k] === arq) || 'dashboard'; };
const pastaCrm = location.pathname.replace(/[^/]*$/, '');
const daCasa = u => u.origin === location.origin && u.pathname.replace(/[^/]*$/, '') === pastaCrm && (u.pathname === pastaCrm || Object.values(ARQUIVOS).includes(u.pathname.split('/').pop()));

function mostrar({ quieto = false } = {}) {
  const chave = telaDaUrl(), def = TELAS[chave], tela = $('#tela');
  if (!def || !tela) return;
  const trocou = chave !== telaAtual;
  // a busca que está sendo digitada continua com o cursor no lugar depois de redesenhar
  const foco = document.activeElement?.closest?.('#tela') && document.activeElement.name ? [document.activeElement.name, document.activeElement.selectionStart] : null;
  const x = $('.quadro')?.scrollLeft || 0, y = scrollY;
  telaAtual = chave;
  esconderDica();
  document.title = def.titulo + ' · CRM · ' + EMPRESA;
  pintarMenu();
  tela.className = trocou ? 'entra' : quieto ? 'quieto' : '';
  def.desenhar(tela, { trocou });
  if (!quieto || trocou) animarContas(tela);
  if (trocou) scrollTo(0, 0); else { scrollTo(0, y); const q = $('.quadro'); if (q) q.scrollLeft = x; }
  if (foco) { const el = tela.querySelector(`[name="${foco[0]}"]`); if (el) { el.focus(); try { el.setSelectionRange(foco[1], foco[1]); } catch (e) {} } }
  document.dispatchEvent(new CustomEvent('crm:tela', { detail: { chave, trocou } }));
}
// Trocar de aba ou de filtro só atualiza o endereço (F5 abre onde você está), sem criar um passo no histórico:
// o Voltar do navegador sai do CRM e volta para a tela de antes (o Hub, por exemplo), não para a aba anterior.
function ir(href, { quieto = false } = {}) {
  const u = new URL(href, location.href);
  history.replaceState(null, '', u.pathname + u.search + u.hash);
  mostrar({ quieto });
}
// links do CRM trocam de tela na hora (Ctrl/Cmd+clique continua abrindo em outra aba)
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const u = new URL(a.href, location.href);
  if (!daCasa(u) || !$('#tela')) return;
  e.preventDefault();
  if (u.pathname === location.pathname && u.search === location.search && u.hash) { history.replaceState(null, '', u.hash); return; }
  ir(u.href);
});
// filtros (formulários GET) também trocam sem recarregar
document.addEventListener('submit', e => {
  const f = e.target;
  if ((f.getAttribute('method') || '').toLowerCase() !== 'get' || !$('#tela')) return;
  e.preventDefault();
  const q = new URLSearchParams();
  for (const [k, v] of new FormData(f)) if (v !== '') q.append(k, v);
  ir(location.pathname + (q.toString() ? '?' + q : ''), { quieto: f.dataset.quieto === '1' });
  delete f.dataset.quieto;
});
function enviarFiltro(f, quieto = false) {
  if (quieto) f.dataset.quieto = '1';
  if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
// busca enquanto digita (sem apertar Enter)
let tBusca;
document.addEventListener('input', e => {
  if (!e.target.matches?.('[data-busca-viva]')) return;
  clearTimeout(tBusca);
  tBusca = setTimeout(() => enviarFiltro(e.target.form, true), 220);
});
addEventListener('popstate', () => mostrar());

// ===== Casca: menu de vidro (como o hub) e área das telas =====
const LOGO = MARCA_CRM.logo ? `<img src="${esc(MARCA_CRM.logo)}" alt="">`
  : '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="28" style="fill:var(--roxo)"/><path fill="#FFFFFF" d="M24 50 50 28l26 22v22a5 5 0 0 1-5 5H29a5 5 0 0 1-5-5z"/><rect x="43" y="56" width="14" height="21" rx="3" style="fill:var(--roxo)"/><circle cx="74" cy="26" r="7" style="fill:var(--acento)"/></svg>';
const INICIAIS_CONTA = (String(MARCA_CRM.iniciais || '').trim() || EMPRESA.split(/\s+/).filter(p => p.length > 2).slice(0, 2).map(p => p[0]).join('') || 'C').toUpperCase().slice(0, 3);
const escuro = () => document.documentElement.dataset.theme === 'dark';

// Menu da esquerda: aberto (com os nomes e os contadores) ou recolhido (só os ícones). Abre aberto; a escolha fica neste navegador.
const CHAVE_MENU = 'hub-crm-menu';
const menuRecolhido = () => { try { return localStorage.getItem(CHAVE_MENU) === 'recolhido'; } catch (e) { return false; } };
function montarCasca() {
  document.body.className = '';
  document.body.innerHTML = `<div class="app${menuRecolhido() ? ' recolhido' : ''}">
  <aside class="lateral"><nav aria-label="Telas do CRM">
    <div class="lado-topo">
      ${HUB ? `<a class="logo" href="${esc(HUB)}" title="Voltar ao Hub">${LOGO}</a>` : `<span class="logo">${LOGO}</span>`}
      <span class="marca-txt"><b>CRM</b><small>${esc(EMPRESA)}</small></span>
      <button class="recolher" id="recolher" type="button">${ico('recolher')}</button>
    </div>
    <span class="linha"></span>
    <div class="itens">${MENU.map(([k, nome, icone]) => `<a class="lado-btn" href="${ARQUIVOS[k]}" data-tela="${k}" aria-label="${nome}">${ico(icone)}<span class="rotulo">${nome}</span><span class="dica">${nome}</span><b class="bolha" hidden></b></a>`).join('')}</div>
    <span class="espaco"></span>
    <div class="lado-rodape">
      ${HUB ? `<a class="lado-btn secundario so-largo" href="${esc(HUB)}" aria-label="Voltar ao Hub">${ico('grade')}<span class="rotulo">Voltar ao Hub</span><span class="dica">Voltar ao Hub</span></a>` : ''}
      <button class="lado-btn secundario" id="tema" type="button"></button>
      <button class="conta-btn" id="conta" type="button" aria-label="Conta e ajustes"><span class="avatar">${esc(INICIAIS_CONTA)}</span><span class="rotulo"><b>${esc(EMPRESA)}</b><small>Conta e ajustes</small></span><span class="dica">Conta e ajustes</span></button>
    </div>
  </nav></aside>
  <main class="conteudo">
    <div class="topo"><span id="hoje"></span><span class="topo-dir"><span class="exemplo" id="exemplo" hidden>dados de exemplo</span><span class="atualizado" id="atualizado"></span></span></div>
    <div id="tela"><div class="carregando" aria-label="Carregando"><i></i><i></i><i></i><i></i><b></b><b></b></div></div>
  </main>
</div>`;
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#hoje').textContent = d.charAt(0).toUpperCase() + d.slice(1);
  pintarTema();
  $('#tema').addEventListener('click', () => {
    const novo = escuro() ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem('hub-imob-tema', novo); } catch (e) {} // mesma chave do hub: no mesmo endereço, o tema é um só
    pintarTema();
  });
  $('#conta').addEventListener('click', abrirConta);
  pintarRecolher();
  $('#recolher').addEventListener('click', () => {
    const recolher = !$('.app').classList.contains('recolhido');
    $('.app').classList.toggle('recolhido', recolher);
    try { localStorage.setItem(CHAVE_MENU, recolher ? 'recolhido' : 'aberto'); } catch (e) {}
    pintarRecolher();
  });
}
function pintarRecolher() {
  const b = $('#recolher'), r = $('.app').classList.contains('recolhido');
  b.setAttribute('aria-label', r ? 'Abrir o menu' : 'Recolher o menu'); b.title = b.getAttribute('aria-label');
  b.setAttribute('aria-expanded', String(!r));
}
function pintarTema() {
  const b = $('#tema'); if (!b) return;
  const rot = escuro() ? 'Modo claro' : 'Modo escuro';
  b.innerHTML = `${ico(escuro() ? 'sol' : 'lua')}<span class="rotulo">${rot}</span><span class="dica">${rot}</span>`;
  b.setAttribute('aria-label', rot);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro() ? '#091416' : '#F3F5F4');
}
// Tela ativa e as bolhas: leads esperando você, sem origem e follow-ups de hoje (coral quando há alguém esperando ou atrasado)
function pintarMenu() {
  const fu = fuContagem(), c = contagemEtapas();
  const bolhas = { dashboard: [0, false], crm: [(c.novo || 0) + (c.respondeu || 0), (c.respondeu || 0) > 0], leads: [CRM.leads.filter(l => !l.origem).length, false], followups: [fu.atrasados + fu.hoje, fu.atrasados > 0] };
  const dicas = { crm: n => n + ' esperando você', leads: n => n + ' sem origem', followups: n => n + ' para hoje' };
  $$('.lado-btn[data-tela]').forEach(a => {
    const k = a.dataset.tela, [n, urgente] = bolhas[k], b = $('.bolha', a), nome = MENU.find(m => m[0] === k)[1];
    a.classList.toggle('ativo', k === telaAtual);
    if (k === telaAtual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n; b.classList.toggle('urgente', urgente);
    $('.dica', a).textContent = n && dicas[k] ? `${nome} · ${dicas[k](n)}` : nome;
  });
  const ex = $('#exemplo'); if (ex) ex.hidden = !DEMO;
}

// ===== Atualizar os dados: depois de cada ação e sozinho, sem recarregar a página =====
let ultimoJson = '', pronto = false, fila = Promise.resolve();
async function buscar({ quieto }) {
  const d = await api('dados');
  marcarAtualizado();
  const json = JSON.stringify(d);
  if (pronto && json === ultimoJson) return false;
  ultimoJson = json;
  if (DEMO) limparCache(); else gravarCache(json);
  aplicar(d);
  mostrar({ quieto: quieto && pronto });
  if (!pronto) { pronto = true; window.CRM_PRONTO = true; document.dispatchEvent(new Event('crm:pronto')); }
  return true;
}
// uma busca por vez, na ordem (a que vem depois de uma ação sempre traz o que acabou de mudar)
function atualizar({ quieto = true } = {}) { fila = fila.catch(() => {}).then(() => buscar({ quieto })); return fila; }
function marcarAtualizado() {
  const el = $('#atualizado'); if (!el) return;
  el.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  el.title = 'Atualiza sozinho a cada minuto e quando você volta para a aba';
}
// Não redesenha no meio de algo: janela aberta, texto sendo digitado, card sendo arrastado, leads marcados
function ocupado() {
  const a = document.activeElement;
  return !!$('dialog[open]') || !!$('.tarefa.aberta') || !!$('.sel:checked') || !!window.ocupadoTela?.() ||
    !!(a && a.matches('input:not([type=hidden]):not([type=checkbox]), textarea') && a.value !== '' && !a.matches('[data-busca-viva]'));
}
async function atualizarSozinho() {
  if (!pronto || document.hidden || ocupado()) return;
  try { await atualizar(); } catch (e) { if (e.status === 401) telaEntrada(); }
}
setInterval(atualizarSozinho, 60e3);
let saiuEm = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saiuEm = Date.now();
  else if (saiuEm && Date.now() - saiuEm > 20e3) atualizarSozinho();
});

// ===== Entrada (usuário e senha: os mesmos do hub; entrar num entra no outro) =====
function telaEntrada() {
  limparCache();
  document.title = 'Entrar · CRM · ' + EMPRESA;
  document.body.innerHTML = `<div class="entrada"><div class="entrada-card">
    <span class="g">${LOGO}</span>
    <h2>CRM</h2>
    <p>${DEMO ? 'Exemplo: digite qualquer usuário e senha para entrar.' : 'Entre com o seu usuário e senha do hub.'}</p>
    <form id="f-entrar" novalidate>
      <input class="campo" id="e-usuario" type="text" placeholder="Usuário" aria-label="Usuário" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false">
      <input class="campo" id="e-senha" type="password" placeholder="Senha" aria-label="Senha">
      <p class="erro-f" id="e-erro" role="alert"></p>
      <button class="b-salvar tap" id="e-ok">Entrar</button>
    </form>
  </div></div>`;
  setTimeout(() => $('#e-usuario')?.focus(), 200);
  $('#f-entrar').addEventListener('submit', async ev => {
    ev.preventDefault();
    const b = $('#e-ok'); b.disabled = true; b.textContent = 'Entrando…'; $('#e-erro').textContent = '';
    try { await api('entrar', { usuario: $('#e-usuario').value.trim(), senha: $('#e-senha').value }); location.reload(); }
    catch (e) { $('#e-erro').textContent = e.message; b.disabled = false; b.textContent = 'Entrar'; }
  });
}
function telaErro(msg) {
  $('#tela').innerHTML = `<div class="card erro-carga"><h2>Não consegui abrir o CRM</h2><p>${esc(msg)}</p><button class="btn" type="button" onclick="location.reload()">Tentar de novo</button></div>`;
}

// ===== Conta: ajustes, voltar ao Hub (se houver) e sair =====
function abrirConta() {
  let dlg = $('#dlg-conta');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-conta'; dlg.className = 'menu-conta'; document.body.append(dlg); }
  const eu = CRM.usuario, nome = eu && eu.papel !== 'admin' ? eu.nome : EMPRESA;
  const avatar = eu && eu.papel !== 'admin' ? iniciais(eu.nome).toUpperCase() : INICIAIS_CONTA;
  dlg.innerHTML = `<div class="conta-cab"><span class="avatar">${esc(avatar)}</span><div><b>${esc(nome)}</b><small>${DEMO ? 'Modo exemplo' : eu ? (eu.papel === 'admin' ? 'Administrador' : 'Colaborador') : 'Conectado ao servidor'}</small></div></div>
    ${ehAdmin() ? `<button type="button" class="item-menu" data-c="ajustes">${ico('ajustes')}<span>Ajustes do CRM<small>Empreendimentos, metas e agenda</small></span></button>` : ''}
    ${HUB ? `<a class="item-menu" href="${esc(HUB)}">${ico('grade')}<span>Voltar ao Hub<small>Todas as ferramentas</small></span></a>` : ''}
    <button type="button" class="item-menu perigo" data-c="sair">${ico('sair')}<span>Sair<small>Pede a senha de novo neste aparelho</small></span></button>`;
  dlg.onclick = async e => {
    if (e.target === dlg) return dlg.close();
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'ajustes') { dlg.close(); abrirAjustes(); }
    if (c === 'sair') { try { await api('sair'); } catch (x) {} telaEntrada(); }
  };
  dlg.showModal();
}

// ===== Ajustes: empreendimentos, metas e agenda (ficam no servidor) =====
function abrirAjustes() {
  let dlg = $('#dlg-ajustes');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-ajustes'; document.body.append(dlg); }
  const a = CRM.ajustes, m = a.metas || {};
  dlg.innerHTML = `<form method="dialog" id="form-ajustes">
    <h3 tabindex="-1" autofocus>Ajustes do CRM</h3>
    <label>Empreendimentos <small class="cinza">· um por linha</small><textarea name="empreendimentos" rows="4">${esc((a.empreendimentos || []).join('\n'))}</textarea></label>
    <p class="aj-dica">Os corretores que aparecem em "Responsável" são os colaboradores ativos do hub. ${HUB ? `Cadastre e edite em <a href="${esc(HUB.replace(/#.*$/, ''))}#colaboradores">Colaboradores</a>.` : 'Cadastre na aba Colaboradores do hub.'}</p>
    <p class="aj-rot">Metas de conversão (% dos leads novos)</p>
    <div class="tres">
      <label>Responderam<input name="respondeu" type="number" min="0" max="100" inputmode="numeric" value="${esc(m.respondeu)}"></label>
      <label>Chegaram à visita<input name="visita_agendada" type="number" min="0" max="100" inputmode="numeric" value="${esc(m.visita_agendada)}"></label>
      <label>Viraram venda<input name="venda" type="number" min="0" max="100" inputmode="numeric" value="${esc(m.venda)}"></label>
    </div>
    <label>Agenda do Google no Dashboard <small class="cinza">· endereço secreto no formato iCal</small>
      <input name="agenda_ical" autocomplete="off" inputmode="url" autocapitalize="off" ${DEMO ? 'disabled placeholder="Não disponível no modo exemplo"' : `placeholder="${a.agenda ? 'Agenda ligada · cole outro endereço para trocar' : 'https://calendar.google.com/calendar/ical/…/basic.ics'}"`}></label>
    <p class="aj-dica">Google Agenda → Configurações → clique na agenda → Integrar agenda → Endereço secreto no formato iCal. Quem tiver esse link vê a agenda: ele fica guardado só no servidor e não aparece mais aqui.</p>
    ${a.agenda ? '<label class="aj-check"><input type="checkbox" name="agenda_remover"> Tirar a agenda do Dashboard</label>' : ''}
    <p class="err" id="aj-erro" role="alert"></p>
    <div class="modal-acoes"><button type="button" class="btn-borda" data-aj="cancelar">Cancelar</button><button type="button" class="btn" data-aj="salvar">Salvar</button></div>
  </form>`;
  dlg.onclick = async e => {
    if (e.target === dlg) return dlg.close();
    const b = e.target.closest('[data-aj]');
    if (!b) return;
    if (b.dataset.aj === 'cancelar') return dlg.close();
    const f = $('#form-ajustes', dlg).elements, linhas = s => s.split('\n').map(x => x.trim()).filter(Boolean);
    b.disabled = true;
    try {
      await api('ajustes_salvar', {
        empreendimentos: linhas(f.empreendimentos.value),
        metas: { respondeu: f.respondeu.value, visita_agendada: f.visita_agendada.value, venda: f.venda.value },
        agenda_ical: f.agenda_ical.value.trim(), agenda_remover: !!(f.agenda_remover && f.agenda_remover.checked)
      });
      dlg.close();
      window.aviso?.('Ajustes salvos ✓');
      await atualizar();
      if (telaAtual === 'dashboard') window.pintarAgenda?.(true); // a agenda pode ter mudado
    } catch (x) {
      if (x.status === 401) return telaEntrada();
      $('#aj-erro', dlg).textContent = x.message; b.disabled = false;
    }
  };
  dlg.showModal();
}

// ===== Dica dos gráficos: mouse, foco do teclado ou toque num elemento com data-dica =====
// data-dica="3 leads|Seg, 12/10": a primeira parte (o número) vem em destaque. Texto entra com textContent.
let dicaEl = null;
function mostrarDica(alvo, x, y) {
  if (!dicaEl) { dicaEl = document.createElement('div'); dicaEl.id = 'dica-graf'; dicaEl.setAttribute('role', 'tooltip'); document.body.append(dicaEl); }
  dicaEl.replaceChildren(...alvo.dataset.dica.split('|').map((t, i) => { const e = document.createElement(i ? 'span' : 'b'); e.textContent = t; return e; }));
  dicaEl.classList.add('on');
  const r = dicaEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2));
  const top = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
  dicaEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}
const esconderDica = () => dicaEl?.classList.remove('on');
document.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  const a = e.target.closest?.('[data-dica]');
  if (a) mostrarDica(a, e.clientX, e.clientY); else esconderDica();
});
document.addEventListener('pointerdown', e => {
  const a = e.target.closest?.('[data-dica]');
  if (e.pointerType === 'touch' && a) mostrarDica(a, e.clientX, e.clientY); else if (!a) esconderDica();
});
document.addEventListener('focusin', e => { const a = e.target.closest?.('[data-dica]'); if (a) { const r = a.getBoundingClientRect(); mostrarDica(a, r.left + r.width / 2, r.top); } });
document.addEventListener('focusout', esconderDica);
addEventListener('scroll', esconderDica, true);

// ===== Números que "correm" até o valor =====
const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
function contarAte(el, alvo, sufixo = '') {
  const de = parseFloat(el.textContent) || 0, id = el._anim = (el._anim || 0) + 1;
  if (calmo || de === alvo) { el.textContent = alvo + sufixo; return; }
  const t0 = performance.now(), dur = 700;
  const passo = t => {
    if (el._anim !== id) return;
    const p = Math.min((t - t0) / dur, 1);
    el.textContent = Math.round(de + (alvo - de) * (1 - (1 - p) ** 3)) + sufixo;
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
function animarContas(raiz) {
  $$('[data-conta]', raiz).forEach(b => {
    const txt = b.textContent.trim(), alvo = parseFloat(txt);
    if (isNaN(alvo)) return;
    b.textContent = '0';
    contarAte(b, alvo, txt.replace(/^[\d.]+/, ''));
  });
}

// ===== Abrir o CRM: casca na hora, a última cópia (se houver) e os dados novos do servidor =====
// Para os scripts que precisam dos dados e da casca prontos (ficha do lead, gestos)
const quandoPronto = fn => window.CRM_PRONTO ? fn() : document.addEventListener('crm:pronto', fn, { once: true });
async function iniciar() {
  montarCasca();
  const copia = lerCache();
  if (copia) {
    try {
      ultimoJson = JSON.stringify(copia);
      aplicar(copia); mostrar(); pronto = true; window.CRM_PRONTO = true; document.dispatchEvent(new Event('crm:pronto'));
    } catch (e) { limparCache(); }
  }
  try { await atualizar(); } catch (e) {
    if (e.status === 401) return telaEntrada();
    if (!copia) telaErro(e.message); else window.aviso?.(e.message);
  }
}
document.addEventListener('DOMContentLoaded', iniciar);
