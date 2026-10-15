'use strict';
// duckV no notebook: todas as contas e sessoes numa janela so. Barra lateral com as contas e as
// sessoes de cada uma, paineis lado a lado com a conversa ou o terminal de verdade, fila unica de
// pedidos, busca rapida (Ctrl+K) e barra de status com o uso das contas.
/* global icone, Terminal, FitAddon */

// ------------------------------------------------------------ utilidades
const SVG = 'http://www.w3.org/2000/svg';

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'for' || k === 'title') node.setAttribute(k, v);
      else node[k] = v;
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const fData = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

function falta(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}
const pasta = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const MAC = /Mac/.test(navigator.platform);
const CTRL = MAC ? '⌘' : 'Ctrl';

let avisoTimer = null;
function avisar(texto) {
  const a = document.getElementById('aviso');
  a.textContent = texto;
  a.classList.add('mostra');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => a.classList.remove('mostra'), 3200);
}

// ------------------------------------------------------------ opcoes desta janela
const LOCAL = { tema: 'sistema', pato: 'animado', ferramentas: true, avisos: true, layout: '1', paineis: [], lateral: 'aberta', fechadas: [] };
try {
  Object.assign(LOCAL, JSON.parse(localStorage.getItem('duckv-notebook') || '{}'));
} catch {
  /* sem armazenamento: fica com o padrao */
}
// No app do computador a janela nao tem a barra de titulo do sistema: o topo da pagina faz esse papel
// e os botoes de minimizar, maximizar e fechar seguem as cores do tema.
const JANELA_APP = !!window.duckvApp?.janelaPropria;
if (JANELA_APP) {
  document.documentElement.classList.add('janela-app');
  if (window.duckvApp.plataforma === 'darwin') document.documentElement.classList.add('mac');
}
function corDaBarra() {
  if (!JANELA_APP) return;
  const css = getComputedStyle(document.documentElement);
  const hex = (v) => {
    const t = v.trim();
    return /^#[0-9a-f]{6}$/i.test(t) ? t : null;
  };
  const fundo = hex(css.getPropertyValue('--surface'));
  const simbolo = hex(css.getPropertyValue('--tinta'));
  if (fundo && simbolo) window.duckvApp.barra(fundo, simbolo);
}
function aplicarLocal() {
  document.documentElement.dataset.tema = LOCAL.tema;
  document.documentElement.dataset.pato = LOCAL.pato;
  corDaBarra();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', corDaBarra);
function guardarLocal(chave, valor) {
  LOCAL[chave] = valor;
  try {
    localStorage.setItem('duckv-notebook', JSON.stringify(LOCAL));
  } catch {
    /* modo privado: vale so nesta visita */
  }
  aplicarLocal();
}
aplicarLocal();

// ------------------------------------------------------------ o pato (o mesmo desenho do celular)
const SPRITE = [
  '.........OOOO...',
  '........OBBBBO..',
  '........OBBeBkkk',
  '........OBBBBqq.',
  '.T......obbbo...',
  'TtT...oobbbbo...',
  'Tttooobbbbbbbo..',
  'obbbbwwwbbbbbo..',
  '.obbbbwwwbbbo...',
  '..obbbbbbbbo....',
  '...oooooooo.....',
  '.....f...g......',
  '....ff..gg......',
];
const PARTES = {
  O: ['cabeca', 'contorno'], B: ['cabeca', 'penas'], e: ['cabeca', 'olho'], k: ['cabeca', 'bico'], q: ['cabeca', 'queixo'],
  o: ['tronco', 'contorno'], b: ['tronco', 'penas'], w: ['tronco', 'asa'],
  T: ['rabo', 'contorno'], t: ['rabo', 'penas'], f: ['pes', 'pe pe-a'], g: ['pes', 'pe pe-b'],
};
const EXTRAS = {
  'olho-fechado': [[10, 2.6, 2, 0.45]],
  som: [[17, 1], [18, 0], [17, 3.6]],
  'sinal exclama': [[11, -5], [11, -4], [11, -3], [11, -1]],
  'sinal sono': [[14, -4], [15, -4], [16, -4], [15, -3], [14, -2], [15, -2], [16, -2]],
};
const TRUQUES = {
  parado: ['grasna', 'bate', 'rabo', 'pisca', 'cisca', 'olha', 'pulinho'],
  trabalha: ['grasna', 'bate', 'rabo', 'pisca', 'pulinho'],
  festa: ['grasna', 'bate'],
  dorme: ['espia', 'rabo'],
  pede: [],
  cansado: [],
};
const DURACAO = { grasna: 900, bate: 800, rabo: 800, pisca: 320, cisca: 1300, olha: 1200, pulinho: 480, espia: 1100 };
const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

function bicho(comGracinhas = true) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '-1 -5.5 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const no = (tag, classe, pai) => {
    const n = document.createElementNS(SVG, tag);
    if (classe) n.setAttribute('class', classe);
    pai.append(n);
    return n;
  };
  const ponto = (pai, x, y, w = 1.03, h = 1.03) => {
    const r = no('rect', null, pai);
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', w);
    r.setAttribute('height', h);
  };
  // A cor da conta aparece so na sombra em pixels sob os pes.
  const sombra = no('g', 'sombra-pato', svg);
  for (let x = 3; x < 12; x++) ponto(sombra, x, 13.4, 1.03, 0.9);
  const partes = {};
  for (const nome of ['pes', 'rabo', 'tronco', 'cabeca']) partes[nome] = { g: no('g', nome, svg), cores: {} };
  const camada = (parte, classe) => (partes[parte].cores[classe] ||= no('g', classe, partes[parte].g));
  SPRITE.forEach((linha, y) => [...linha].forEach((c, x) => PARTES[c] && ponto(camada(...PARTES[c]), x, y)));
  for (const [classe, pontos] of Object.entries(EXTRAS)) {
    const g = no('g', classe, classe.startsWith('sinal') ? svg : partes.cabeca.g);
    for (const [x, y, w, h] of pontos) ponto(g, x, y, w, h);
  }
  const pista = el('div', { class: 'pista', 'data-estado': 'dorme' }, el('div', { class: 'trilho' }, el('div', { class: 'vira' }, el('div', { class: 'bicho' }, svg))));
  let sumiu = 0;
  function gracinha() {
    if (!pista.isConnected && ++sumiu > 3) return;
    const opcoes = TRUQUES[pista.dataset.estado] || [];
    if (pista.isConnected && opcoes.length && !document.hidden && !semMovimento.matches && LOCAL.pato === 'animado') {
      sumiu = 0;
      const truque = opcoes[Math.floor(Math.random() * opcoes.length)];
      pista.dataset.truque = truque;
      setTimeout(() => pista.dataset.truque === truque && delete pista.dataset.truque, DURACAO[truque]);
    }
    setTimeout(gracinha, 3500 + Math.random() * 6000);
  }
  if (comGracinhas) setTimeout(gracinha, 1500 + Math.random() * 4000);
  pista.definir = (estado) => {
    if (pista.dataset.estado === estado) return;
    pista.dataset.estado = estado;
    delete pista.dataset.truque;
  };
  return pista;
}
const miniPato = (estado, cor) => {
  const p = bicho(false);
  p.definir(estado);
  const caixa = el('span', { class: 'mini-pato' }, p);
  if (cor) caixa.style.setProperty('--cor', cor);
  caixa.definir = p.definir;
  return caixa;
};

// ------------------------------------------------------------ estado e ligacao
const S = {
  pronto: false,
  contas: [],
  sessoes: [],
  host: { available: false, agentes: [], folders: [], home: '', sep: '/' },
  prefs: { avisos: {}, rapidas: [] },
  arquivos: [],
  desktop: null, // so o app do notebook recebe: pareamento, aparelhos
  desvio: 0,
  ligado: null,
  pareado: true,
  demo: false,
};
const agora = () => Date.now() - S.desvio;
const conversas = new Map(); // sessao -> mensagens ja recebidas
const ouvintes = { conversa: new Map(), cru: new Map() }; // sessao -> Set de funcoes

let ws = null;
let espera = 800;
let ref = 0;
const pendentes = new Map();

function mandar(obj, aoResponder) {
  if (!ws || ws.readyState !== 1) {
    if (aoResponder) aoResponder('Sem conexão com o duckV.');
    return;
  }
  if (aoResponder) {
    obj.ref = ++ref;
    pendentes.set(obj.ref, aoResponder);
  }
  ws.send(JSON.stringify(obj));
}
const pedir = (obj) => new Promise((resolve, reject) => mandar(obj, (erro, r) => (erro ? reject(new Error(erro)) : resolve(r))));

function ouvir(tipo, id, f) {
  let lista = ouvintes[tipo].get(id);
  if (!lista) ouvintes[tipo].set(id, (lista = new Set()));
  lista.add(f);
  return () => lista.delete(f);
}
const avisarOuvintes = (tipo, id, ...args) => ouvintes[tipo].get(id)?.forEach((f) => f(...args));

function ligar() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss://' : 'ws://'}${location.host}/ws`);
  ws.onopen = () => {
    espera = 800;
    S.ligado = true;
    mandar({ t: 'vis', visible: document.visibilityState === 'visible' });
    for (const p of area.paineis()) p.religou();
    desenhar();
  };
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.t === 'state') {
      const antes = S.pronto ? S.sessoes : null;
      S.pronto = true;
      S.contas = m.accounts;
      S.sessoes = m.instances;
      S.host = m.host || S.host;
      S.demo = !!m.demo;
      S.arquivos = m.arquivos || [];
      S.desktop = m.desktop || null;
      if (m.prefs) S.prefs = m.prefs;
      S.desvio = Date.now() - m.now;
      if (antes) notificarMudancas(antes, S.sessoes);
      desenhar();
    } else if (m.t === 'history') {
      conversas.set(m.instance, m.items);
      avisarOuvintes('conversa', m.instance, true, m.items);
    } else if (m.t === 'msgs') {
      const lista = conversas.get(m.instance) || [];
      lista.push(...m.items);
      conversas.set(m.instance, lista);
      avisarOuvintes('conversa', m.instance, false, m.items);
      marcarNovas(m.instance, m.items);
    } else if (m.t === 'cru') {
      avisarOuvintes('cru', m.instance, m);
    } else if (m.t === 'ack' || m.t === 'err') {
      const f = pendentes.get(m.ref);
      pendentes.delete(m.ref);
      if (f) f(m.t === 'err' ? m.msg : null, m);
    }
  };
  ws.onclose = async () => {
    ws = null;
    S.ligado = false;
    for (const f of pendentes.values()) f('Sem conexão com o duckV.');
    pendentes.clear();
    try {
      const r = await fetch('/api/state', { credentials: 'same-origin' });
      S.pareado = r.status !== 401;
    } catch {
      /* duckV fora do ar: continua tentando */
    }
    desenhar();
    if (S.pareado) setTimeout(ligar, espera);
    espera = Math.min(espera * 1.7, 8000);
  };
  ws.onerror = () => {};
}
document.addEventListener('visibilitychange', () => {
  mandar({ t: 'vis', visible: document.visibilityState === 'visible' });
  if (document.visibilityState === 'visible' && !ws && S.pareado) ligar();
});

// ------------------------------------------------------------ regras de exibicao
const vivas = (contaId) => S.sessoes.filter((s) => s.account === contaId && s.status !== 'ended');
const precisa = (s) => s.status !== 'ended' && (s.status === 'waiting' || s.perms.length > 0 || (s.hosted && !!s.pergunta));
const contaDe = (s) => S.contas.find((c) => c.id === s.account) || { id: s.account, nome: s.account, cor: '#ff7a1a', agente: 'claude', usage: {} };
const sessaoPorId = (id) => S.sessoes.find((s) => s.id === id);
const agenteDaConta = (c) => S.host.agentes?.find((a) => a.id === (c?.agente || 'claude')) || { id: 'claude', nome: 'Claude Code', curto: 'Claude', cor: '#d97757', modelos: [], esforcos: [], modos: [] };
const nomeDaSessao = (s) => s.name || pasta(s.cwd) || 'Sessão';

function estadoDaConta(conta) {
  const ss = vivas(conta.id);
  const cinco = conta.usage?.five_hour;
  const t = agora();
  if (ss.some(precisa)) return { bicho: 'pede', texto: 'Precisa de você', pede: true };
  if (cinco && cinco.pct >= 100 && cinco.resetsAt) return { bicho: 'cansado', texto: `Sem energia até ${fHora.format(cinco.resetsAt)}` };
  const festa = conta.lastReset && t - conta.lastReset.at < 90000;
  const trabalhando = ss.filter((s) => s.status === 'working').length;
  if (trabalhando) return { bicho: festa ? 'festa' : 'trabalha', texto: `Trabalhando em ${plural(trabalhando, 'sessão', 'sessões')}` };
  if (festa) return { bicho: 'festa', texto: 'Limite reiniciado agora' };
  if (ss.some((s) => s.status === 'error')) return { bicho: 'parado', texto: 'Uma sessão parou com erro' };
  if (ss.length) return { bicho: 'parado', texto: `${plural(ss.length, 'sessão esperando', 'sessões esperando')} você` };
  return { bicho: 'dorme', texto: 'Nenhuma sessão aberta' };
}
function oQueFaz(s) {
  if (s.status === 'ended') return 'Encerrada';
  if (s.perms.length) return `Pede permissão: ${s.perms[0].tool}`;
  if (s.hosted && s.pergunta) return s.pergunta.titulo ? `Pergunta: ${s.pergunta.titulo}` : 'Fez uma pergunta';
  if (s.status === 'waiting') return 'Pede permissão no terminal';
  if (s.status === 'working') return s.activity || 'Trabalhando';
  if (s.status === 'error') return s.activity || 'Parou com erro';
  return s.lastText || 'Esperando sua mensagem';
}
const estadoDoPato = (s) => (s.status === 'ended' ? 'dorme' : precisa(s) ? 'pede' : s.status === 'working' ? 'trabalha' : 'parado');

function textoDoReinicio(conta, chave, u) {
  const t = agora();
  if (u?.resetsAt && u.resetsAt > t) {
    const resta = u.resetsAt - t;
    return chave === 'five_hour' || resta < 20 * 3600e3 ? `Reinicia às ${fHora.format(u.resetsAt)}, em ${falta(resta)}` : `Reinicia ${fDia.format(u.resetsAt)} às ${fHora.format(u.resetsAt)}`;
  }
  if (u?.fresh) return 'Reiniciou. A contagem recomeça no próximo uso';
  return 'Horário de reinício ainda não informado';
}
function barra(pct, cor) {
  const b = el('div', { class: `barra${pct == null ? ' sem' : ''}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100' });
  if (cor) b.style.setProperty('--cor', cor);
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const cheia = el('i', { class: 'cheia' });
  cheia.style.width = `calc(${p}% - ${p ? 2 : 0}px)`;
  if (!p) cheia.hidden = true;
  b.append(cheia, el('i', { class: 'trilho-b' }));
  if (pct != null) b.setAttribute('aria-valuenow', String(Math.round(p)));
  if (p >= 100) b.dataset.cheia = 'sim';
  return b;
}
function chipAgente(conta) {
  const ag = agenteDaConta(conta);
  const c = el('span', { class: 'agente', title: ag.nome }, el('i'), ag.curto || ag.nome);
  if (ag.cor) c.style.setProperty('--ag', ag.cor);
  return c;
}

const MODOS_AJUDA = {
  manual: 'Pede sua permissão antes de editar arquivos e rodar comandos.',
  default: 'Pede sua permissão antes de editar arquivos e rodar comandos.',
  acceptEdits: 'Edita arquivos sem perguntar. Comandos ainda pedem permissão.',
  plan: 'Só lê e monta um plano. Não altera nada até você aprovar.',
  auto: 'Um classificador avalia cada ação e só barra o que parecer arriscado.',
};
const ESFORCOS = { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra alto', max: 'Máximo' };
const rotuloDe = (lista, id) => lista?.find((x) => x.id === id)?.rotulo || id;

// ------------------------------------------------------------ escolha automatica de conta
// A conta com mais limite livre: fora as que estouraram o limite, a de menor uso nas 5 horas
// (sem leitura conta como meio caminho), desempatando pela que tem menos sessoes abertas.
function contaAutomatica(agente) {
  const candidatas = S.contas.filter((c) => c.instalado !== false && (!agente || (c.agente || 'claude') === agente));
  const nota = (c) => {
    const u5 = c.usage?.five_hour?.pct;
    const u7 = c.usage?.seven_day?.pct;
    if (u5 >= 100 || u7 >= 100) return 1000 + (u5 || 0);
    return (u5 ?? 50) + Math.max(0, (u7 ?? 0) - 70) + vivas(c.id).length * 4;
  };
  const melhor = [...candidatas].sort((a, b) => nota(a) - nota(b))[0] || null;
  if (!melhor) return null;
  const u5 = melhor.usage?.five_hour?.pct;
  const motivo = u5 == null ? 'sem leitura de uso ainda' : `${Math.round(u5)}% do limite de 5 horas usado`;
  return { conta: melhor, motivo };
}

// ------------------------------------------------------------ texto da conversa (markdown simples, sem HTML)
function inline(texto) {
  const partes = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const t = m[0];
    if (t.startsWith('`')) partes.push(el('code', { text: t.slice(1, -1) }));
    else if (t.startsWith('**')) partes.push(el('b', { text: t.slice(2, -2) }));
    else partes.push(el('a', { href: m[2], target: '_blank', rel: 'noopener noreferrer', text: t.slice(1, t.indexOf(']')) }));
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}
function markdown(texto) {
  const raiz = el('div', { class: 'md' });
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (/^```/.test(l)) {
      const corpo = [];
      i++;
      while (i < linhas.length && !/^```/.test(linhas[i])) corpo.push(linhas[i++]);
      i++;
      raiz.append(el('pre', { tabIndex: 0 }, el('code', { text: corpo.join('\n') })));
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      raiz.append(el(h[1].length <= 2 ? 'h3' : 'h4', null, inline(h[2])));
      i++;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) {
      raiz.append(el('hr'));
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] || '')) {
      const celulas = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const cab = celulas(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      raiz.append(el('table', null, el('thead', null, el('tr', null, cab.map((c) => el('th', null, inline(c))))), el('tbody', null, corpo.map((r) => el('tr', null, r.map((c) => el('td', null, inline(c))))))));
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) q.push(linhas[i++].replace(/^\s*>\s?/, ''));
      raiz.append(el('blockquote', null, inline(q.join(' '))));
      continue;
    }
    const lista = /^\s*([-*+]|\d+[.)])\s+/;
    if (lista.test(l)) {
      const ordenada = /^\s*\d/.test(l);
      const itens = [];
      while (i < linhas.length && lista.test(linhas[i])) itens.push(linhas[i++].replace(lista, ''));
      raiz.append(el(ordenada ? 'ol' : 'ul', null, itens.map((t) => el('li', null, inline(t)))));
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !/^```|^#{1,6}\s|^\s*>|^\s*\|/.test(linhas[i]) && !lista.test(linhas[i])) par.push(linhas[i++]);
    if (!par.length) par.push(linhas[i++]);
    raiz.append(el('p', null, inline(par.join('\n'))));
  }
  return raiz;
}
function criarMensagem(m) {
  if (m.role === 'tool') return el('div', { class: 'm tool' }, icone('caret-right', 14), el('span', null, el('b', { text: m.tool }), m.text || ''));
  if (m.role === 'sys') return el('div', { class: 'm sys', text: m.text });
  if (m.role === 'image' && /^[0-9a-f]{24}$/.test(m.img || '')) {
    const src = `/api/img/${m.img}`;
    return el('div', { class: `m imagem ${m.via === 'user' ? 'user' : ''}` }, el('img', { src, alt: 'Imagem da conversa', loading: 'lazy' }));
  }
  if (m.role === 'file') {
    const a = S.arquivos.find((x) => x.id === m.arq);
    return el('div', { class: 'm arquivo' }, icone('paperclip', 18), el('span', null, el('b', { text: a?.nome || 'Arquivo enviado ao celular' }), m.text ? ` · ${m.text}` : ''));
  }
  if (m.role === 'user') return el('div', { class: 'm user' }, markdown(m.text), m.via === 'celular' ? el('span', { class: 'via', text: 'Enviada pelo duckV' }) : null);
  return el('div', { class: 'm assistant' }, markdown(m.text));
}
const visiveis = (itens) => (LOCAL.ferramentas ? itens : itens.filter((m) => m.role !== 'tool'));

// ------------------------------------------------------------ menus e confirmacoes
let menuAberto = null;
function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
}
function abrirMenu(ancora, itens) {
  fecharMenu();
  const menu = el('div', { class: 'menu', role: 'menu' });
  for (const it of itens) {
    if (it === '-') menu.append(el('hr'));
    else if (it.rotulo) menu.append(el('p', { class: 'rotulo', text: it.rotulo }));
    else {
      menu.append(
        el(
          'button',
          {
            type: 'button',
            role: it.marcado != null ? 'menuitemradio' : 'menuitem',
            'aria-checked': it.marcado != null ? String(!!it.marcado) : null,
            class: it.perigo ? 'perigo' : null,
            disabled: !!it.desligado,
            onclick: () => {
              fecharMenu();
              it.acao();
            },
          },
          it.icone ? icone(it.icone, 18) : el('span', { style: 'width:18px' }),
          it.texto,
        ),
      );
    }
  }
  document.body.append(menu);
  const r = ancora.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menu.style.top = `${r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  menuAberto = menu;
  menu.querySelector('button:not(:disabled)')?.focus();
  menu.addEventListener('keydown', (ev) => {
    const bs = [...menu.querySelectorAll('button:not(:disabled)')];
    const i = bs.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') bs[(i + 1) % bs.length]?.focus();
    else if (ev.key === 'ArrowUp') bs[(i - 1 + bs.length) % bs.length]?.focus();
    else if (ev.key === 'Escape') {
      fecharMenu();
      ancora.focus();
    } else return;
    ev.preventDefault();
  });
}
document.addEventListener('pointerdown', (ev) => {
  if (menuAberto && !menuAberto.contains(ev.target)) fecharMenu();
  if (usoAberto && !usoAberto.contains(ev.target) && !ev.target.closest('.uso-chip')) fecharUso();
});
// Acoes que apagam ou encerram pedem um segundo clique no proprio botao.
function duasVezes(botao, texto, acao) {
  let armado = null;
  const rotulo = () => botao.querySelector('span') || botao;
  botao.addEventListener('click', () => {
    if (armado) {
      clearTimeout(armado);
      armado = null;
      botao.classList.remove('armado');
      rotulo().textContent = texto;
      return acao();
    }
    botao.classList.add('armado');
    rotulo().textContent = 'Clique de novo para confirmar';
    armado = setTimeout(() => {
      armado = null;
      botao.classList.remove('armado');
      rotulo().textContent = texto;
    }, 3500);
  });
  return botao;
}

// ------------------------------------------------------------ pedidos (permissao, pergunta, aviso)
function cartaoPedido(sessao, perm, comOrigem) {
  const conta = contaDe(sessao);
  const aceitar = el('button', { class: 'botao principal', type: 'button', 'data-acao': 'aceitar' }, icone('check', 18), el('span', { text: 'Aceitar' }));
  const recusar = el('button', { class: 'botao', type: 'button', 'data-acao': 'recusar' }, icone('x', 18), el('span', { text: 'Recusar' }));
  const recado = el('textarea', { rows: 2, 'aria-label': 'O que fazer no lugar', placeholder: 'Diga o que ele deve fazer no lugar' });
  const enviarRecado = el('button', { class: 'botao', type: 'button', text: 'Recusar com este recado' });
  const caixaRecado = el('div', { class: 'recado', hidden: true }, recado, el('div', { class: 'botoes' }, enviarRecado));
  const abrirRecado = el('button', {
    class: 'botao texto pequeno',
    type: 'button',
    text: 'Recusar e dizer o que fazer',
    onclick: () => {
      caixaRecado.hidden = !caixaRecado.hidden;
      if (!caixaRecado.hidden) recado.focus();
    },
  });
  const botoes = [aceitar, recusar, enviarRecado];
  const responder = (behavior, note) => {
    for (const b of botoes) b.disabled = true;
    mandar({ t: 'verdict', instance: sessao.id, request_id: perm.id, behavior, note }, (erro) => {
      if (erro) {
        for (const b of botoes) b.disabled = false;
        avisar(erro);
      } else avisar(behavior === 'allow' ? `Aceito: ${perm.tool}` : `Recusado: ${perm.tool}`);
    });
  };
  aceitar.addEventListener('click', () => responder('allow'));
  recusar.addEventListener('click', () => responder('deny'));
  enviarRecado.addEventListener('click', () => (recado.value.trim() ? responder('deny', recado.value.trim()) : recado.focus()));
  const cartao = el(
    'section',
    { class: 'pedido', 'data-id': perm.id, 'aria-label': `Pedido de permissão: ${perm.tool}`, tabIndex: -1 },
    comOrigem ? origem(conta, sessao) : null,
    el('h3', null, icone('shield-check', 18), `Pode usar ${perm.tool}?`),
    perm.desc ? el('p', { class: 'oque', text: perm.desc }) : null,
    perm.preview ? el('pre', { text: perm.preview, tabIndex: 0 }) : null,
    el('div', { class: 'botoes' }, aceitar, recusar, el('span', { class: 'espaco' }), abrirRecado),
    caixaRecado,
  );
  cartao.style.setProperty('--cor', conta.cor);
  return cartao;
}
function origem(conta, sessao) {
  const o = el(
    'p',
    { class: 'de' },
    el('i'),
    `${conta.nome} · ${nomeDaSessao(sessao)}`,
    el('button', { class: 'botao texto pequeno', type: 'button', text: 'Abrir sessão', onclick: () => area.abrir(sessao.id) }),
  );
  o.style.setProperty('--cor', conta.cor);
  return o;
}
function cartaoPergunta(sessao, id, comOrigem) {
  const conta = contaDe(sessao);
  const p = sessao.pergunta;
  const tecla = (k) => mandar({ t: 'key', instance: sessao.id, key: k }, (erro) => erro && avisar(erro));
  const cartao = el(
    'section',
    { class: 'pedido', 'data-id': id, 'aria-label': 'Pergunta do agente', tabIndex: -1 },
    comOrigem ? origem(conta, sessao) : null,
    el('h3', null, icone('chat-text', 18), p.titulo || `O ${agenteDaConta(conta).curto} pergunta`),
    p.contexto ? el('pre', { text: p.contexto, tabIndex: 0 }) : null,
    el(
      'div',
      { class: 'respostas' },
      p.opcoes.map((o) => {
        const b = el('button', { class: 'botao', type: 'button', onclick: o.confirmar || o.livre ? null : () => tecla(o.tecla) }, el('span', { class: 'numero', text: o.tecla }), el('span', { text: o.rotulo }));
        if (o.livre) {
          b.addEventListener('click', () => {
            const resposta = prompt(o.rotulo);
            if (resposta?.trim()) mandar({ t: 'responder', instance: sessao.id, tecla: o.tecla, texto: resposta.trim() }, (erro) => erro && avisar(erro));
          });
          return b;
        }
        return o.confirmar ? duasVezes(b, o.rotulo, () => tecla(o.tecla)) : b;
      }),
    ),
    el('div', { class: 'botoes' }, el('button', { class: 'botao', type: 'button', onclick: () => tecla('esc') }, el('span', { text: 'Cancelar' })), sessao.hosted ? el('button', { class: 'botao texto pequeno', type: 'button', text: 'Ver no terminal', onclick: () => area.abrir(sessao.id, { modo: 'terminal' }) }) : null),
  );
  return cartao;
}
function cartaoLocal(sessao, comOrigem) {
  const conta = contaDe(sessao);
  return el(
    'section',
    { class: 'pedido local', 'data-id': `local-${sessao.id}` },
    comOrigem ? origem(conta, sessao) : null,
    el('h3', null, icone('terminal-window', 18), 'Esperando resposta no terminal'),
    el('p', {
      class: 'oque',
      text: sessao.localAsk?.tool ? `${sessao.localAsk.tool} ${sessao.localAsk.text || ''}`.trim() : 'Esse pedido apareceu só na janela do terminal desta sessão. Responda por lá.',
    }),
  );
}
function pedidosDe(sessoes, comOrigem) {
  const itens = [];
  for (const s of sessoes) {
    if (s.status === 'ended') continue;
    for (const p of s.perms) itens.push({ id: p.id, at: p.at, criar: () => cartaoPedido(s, p, comOrigem) });
    if (s.hosted && s.pergunta && !s.perms.length) {
      const id = `q:${s.id}:${s.pergunta.titulo}:${s.pergunta.opcoes.map((o) => o.rotulo).join('|')}`.slice(0, 300);
      itens.push({ id, at: s.updatedAt, criar: () => cartaoPergunta(s, id, comOrigem) });
    } else if (!s.perms.length && s.status === 'waiting') itens.push({ id: `local-${s.id}`, at: s.updatedAt, criar: () => cartaoLocal(s, comOrigem) });
  }
  return itens.sort((a, b) => a.at - b.at);
}
function sincronizarPedidos(caixa, itens) {
  const querem = new Map(itens.map((i) => [i.id, i]));
  for (const no of [...caixa.children]) if (!querem.has(no.dataset.id)) no.remove();
  const tem = new Set([...caixa.children].map((n) => n.dataset.id));
  for (const [id, i] of querem) if (!tem.has(id)) caixa.append(i.criar());
}
const todosOsPedidos = () => pedidosDe(S.sessoes, true);

// ------------------------------------------------------------ avisos do sistema
const novasMsgs = new Set(); // sessoes com resposta que voce ainda nao viu
function marcarNovas(id, itens) {
  if (!itens.some((m) => m.role === 'assistant')) return;
  if (area.visivel(id) && document.hasFocus()) return;
  novasMsgs.add(id);
}
function notificar(titulo, corpo, sessaoId) {
  if (!LOCAL.avisos || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.hasFocus() && document.visibilityState === 'visible') return;
  try {
    const n = new Notification(titulo, { body: corpo, tag: sessaoId, silent: false });
    n.onclick = () => {
      window.focus();
      if (sessaoId) area.abrir(sessaoId);
      n.close();
    };
  } catch {
    /* sem avisos neste sistema */
  }
}
function notificarMudancas(antes, depois) {
  const velhas = new Map(antes.map((s) => [s.id, s]));
  for (const s of depois) {
    const a = velhas.get(s.id);
    const conta = contaDe(s);
    const permsAntes = new Set((a?.perms || []).map((p) => p.id));
    for (const p of s.perms) if (!permsAntes.has(p.id)) notificar(`${conta.nome} pede permissão`, `${p.tool}: ${p.preview || p.desc}`.slice(0, 180), s.id);
    if (s.hosted && s.pergunta && !a?.pergunta) notificar(`${conta.nome} precisa de você`, s.pergunta.titulo || 'Uma pergunta espera sua resposta.', s.id);
    if (a?.status === 'working' && s.status === 'idle') notificar(`${conta.nome} terminou`, s.lastText || nomeDaSessao(s), s.id);
  }
}
// No app do computador: o numero de pedidos vai para a bandeja e para o aviso do canto da tela,
// e o botao Abrir desse aviso traz a sessao para um painel.
let contagemAnterior = -1;
function contarParaOApp() {
  const n = todosOsPedidos().length;
  if (n === contagemAnterior) return;
  contagemAnterior = n;
  window.duckvApp?.contagem?.(n);
}
window.duckvApp?.aoAbrirSessao?.((id) => S.pronto && area.abrir(id));

// ------------------------------------------------------------ painel de uma sessao
// Um painel mostra uma sessao: a conversa (com os pedidos e a caixa de mensagem) ou o terminal de verdade.
function criarPainel(id, opts = {}) {
  let modo = opts.modo === 'terminal' ? 'terminal' : 'conversa';
  const pista = miniPato('dorme');
  const titulo = el('h2');
  const linha = el('p');
  const segConversa = el('button', { type: 'button', role: 'tab', onclick: () => trocarModo('conversa') }, icone('chat-text', 16), 'Conversa');
  const segTerminal = el('button', { type: 'button', role: 'tab', onclick: () => trocarModo('terminal') }, icone('terminal-window', 16), 'Terminal');
  const mais = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Mais ações desta sessão', title: 'Mais ações', onclick: () => abrirMenu(mais, menuDaSessao()) }, icone('dots-three', 20));
  const fechar = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Fechar painel', title: `Fechar painel (${CTRL}+W)`, onclick: () => area.fechar(raiz) }, icone('x', 18));
  const topo = el('header', { class: 'p-topo' }, pista, el('div', { class: 'p-titulo' }, titulo, linha), el('div', { class: 'segmentos', role: 'tablist', 'aria-label': 'Ver' }, segConversa, segTerminal), mais, fechar);

  // --- conversa
  const fazendo = el('span', { class: 'fazendo' });
  const ctxTexto = el('span');
  const ctxCaixa = el('span', { class: 'ctx', title: 'Quanto da memória da conversa já foi usado' }, ctxTexto);
  const gasto = el('span');
  const tarefasTexto = el('summary');
  const tarefasLista = el('ol');
  const tarefas = el('details', { class: 'tarefas' }, tarefasTexto, tarefasLista);
  const info = el('div', { class: 'p-info' }, fazendo, ctxCaixa, gasto, tarefas);
  const conversa = el('div', { class: 'conversa', role: 'log', 'aria-label': 'Conversa', tabIndex: 0 });
  const pedidos = el('div', { class: 'pedidos' });
  const rapidas = el('div', { class: 'rapidas', role: 'group', 'aria-label': 'Mensagens rápidas' });
  const campo = el('textarea', { rows: 1, 'aria-label': 'Mensagem' });
  const enviar = el('button', { class: 'enviar', type: 'submit', 'aria-label': 'Enviar', title: 'Enviar (Enter)' }, icone('paper-plane-right', 20));
  const anexar = el('button', { class: 'so-icone anexar', type: 'button', 'aria-label': 'Anexar arquivo', title: 'Anexar arquivo (ou arraste para cá)' }, icone('paperclip', 18));
  const escolherArquivo = el('input', { type: 'file', hidden: true, multiple: true });
  const listaComandos = el('ul', { class: 'comandos-lista', role: 'listbox', hidden: true });
  const form = el('form', { class: 'escrever' }, listaComandos, anexar, campo, enviar, escolherArquivo);
  const nota = el('p', { class: 'p-nota' });
  const baixo = el('div', { class: 'p-baixo' }, pedidos, rapidas, nota, form);
  const vistaConversa = el('div', { class: 'p-corpo' }, info, conversa, baixo);

  // --- terminal de verdade (xterm.js com a saida crua do terminal virtual)
  const caixaTerminal = el('div', { class: 'terminal-caixa' });
  const avisoTerminal = el('div', { class: 'terminal-aviso', hidden: true });
  const vistaTerminal = el('div', { class: 'p-corpo' }, caixaTerminal, avisoTerminal);

  const corpo = el('div', { class: 'p-corpo' });
  const raiz = el('section', { class: 'painel', 'aria-label': 'Sessão', tabIndex: -1 }, topo, corpo);
  raiz.dataset.sessao = id;

  const sessao = () => sessaoPorId(id);
  const tecla = (k, ok) => mandar({ t: 'key', instance: id, key: k }, (erro) => (erro ? avisar(erro) : ok && avisar(ok)));
  const enviarTexto = (texto, ok) => mandar({ t: 'send', instance: id, text: texto }, (erro) => avisar(erro || ok));

  function menuDaSessao() {
    const s = sessao();
    if (!s) return [{ texto: 'Fechar painel', icone: 'x', acao: () => area.fechar(raiz) }];
    const conta = contaDe(s);
    const ag = agenteDaConta(conta);
    const vivo = s.status !== 'ended';
    const itens = [];
    if (s.hosted && vivo) {
      itens.push({ texto: 'Interromper', icone: 'hand-palm', acao: () => tecla('esc', 'Interrompido') });
      if (ag.id === 'claude') {
        itens.push({ texto: 'Compactar conversa', icone: 'stack', acao: () => enviarTexto('/compact', 'Compactação pedida') });
        itens.push({ texto: 'Limpar conversa', icone: 'broom', acao: () => confirm('Limpar a conversa desta sessão?') && enviarTexto('/clear', 'Conversa limpa') });
      }
      if (ag.modelos?.length > 1) {
        itens.push('-', { rotulo: 'Modelo' });
        const atual = String(s.model || '').toLowerCase();
        for (const m of ag.modelos) itens.push({ texto: m.rotulo, marcado: m.id !== 'default' && atual.includes(m.id), acao: () => enviarTexto(`/model ${m.id}`, `Modelo: ${m.rotulo}`) });
      }
      if (ag.id === 'claude' && ag.esforcos?.length) {
        itens.push('-', { rotulo: 'Esforço de raciocínio' });
        for (const e of ag.esforcos) itens.push({ texto: e.rotulo, marcado: s.effort === e.id, acao: () => enviarTexto(`/effort ${e.id}`, `Esforço: ${e.rotulo}`) });
      }
      if (ag.id === 'claude') {
        itens.push('-', { rotulo: 'Modo de permissão' });
        for (const m of ag.modos) {
          const atual = s.permMode === m.id || (m.id === 'manual' && (!s.permMode || s.permMode === 'default'));
          itens.push({ texto: m.rotulo, marcado: atual, acao: () => mandar({ t: 'modo', instance: id, mode: m.id }, (erro) => avisar(erro || `Modo: ${m.rotulo}`)) });
        }
      }
      itens.push('-');
    }
    itens.push({ texto: 'Abrir ao lado', icone: 'square-split-horizontal', acao: () => area.abrir(id, { aoLado: true, modo }) });
    if (s.cwd && S.desktop && vivo === false) itens.push({ texto: 'Continuar no terminal do sistema', icone: 'arrow-square-out', acao: () => abrirNoTerminalDoSistema(conta.id, s.cwd) });
    if (S.desktop && s.cwd) itens.push({ texto: 'Nova sessão nesta pasta, no terminal do sistema', icone: 'arrow-square-out', acao: () => abrirNoTerminalDoSistema(conta.id, s.cwd) });
    if (s.cwd) itens.push({ texto: 'Copiar caminho da pasta', icone: 'copy', acao: () => navigator.clipboard.writeText(s.cwd).then(() => avisar('Caminho copiado')) });
    if (s.hosted && vivo) itens.push('-', { texto: 'Encerrar sessão', icone: 'power', perigo: true, acao: () => confirm(`Encerrar ${nomeDaSessao(s)}? O agente fecha no computador.`) && mandar({ t: 'stop', instance: id }, (erro) => avisar(erro || 'Sessão encerrada')) });
    if ((s.desktop || s.historico) && S.host.available && !s.hosted) itens.push('-', { texto: 'Continuar aqui no duckV', icone: 'arrows-clockwise', acao: () => continuar(s) });
    return itens;
  }
  function continuar(s) {
    mandar({ t: 'start', resume: s.sessionId, account: s.account, cols: 100, rows: 32 }, (erro, r) => {
      if (erro) return avisar(erro);
      area.trocar(raiz, r.instance);
    });
  }

  // --- composer: Enter envia, Shift+Enter quebra linha, "/" lista os comandos
  let comandos = null;
  let selecionado = 0;
  const ajustarAltura = () => {
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight, 240)}px`;
    enviar.dataset.pronto = campo.value.trim() ? 'sim' : 'nao';
  };
  function filtrarComandos() {
    const v = campo.value;
    if (!/^\/\S*$/.test(v) || !comandos) {
      listaComandos.hidden = true;
      return;
    }
    const q = v.slice(1).toLowerCase();
    const achados = comandos.filter((c) => c.nome.toLowerCase().startsWith(q)).slice(0, 40);
    if (!achados.length) {
      listaComandos.hidden = true;
      return;
    }
    selecionado = Math.min(selecionado, achados.length - 1);
    listaComandos.replaceChildren(
      ...achados.map((c, i) =>
        el(
          'li',
          {
            role: 'option',
            'aria-selected': String(i === selecionado),
            onmousedown: (ev) => {
              ev.preventDefault();
              completar(c);
            },
          },
          el('b', { text: `/${c.nome}` }),
          el('span', { text: c.descricao || '' }),
        ),
      ),
    );
    listaComandos.hidden = false;
    listaComandos.achados = achados;
    listaComandos.children[selecionado]?.scrollIntoView({ block: 'nearest' });
  }
  function completar(c) {
    campo.value = `/${c.nome} `;
    listaComandos.hidden = true;
    ajustarAltura();
    campo.focus();
  }
  campo.addEventListener('input', () => {
    ajustarAltura();
    if (campo.value.startsWith('/') && !comandos) {
      comandos = [];
      mandar({ t: 'comandos', instance: id }, (erro, r) => {
        comandos = erro ? [] : (r.itens || []).map((c) => ({ nome: String(c.nome || c.name || '').replace(/^\//, ''), descricao: c.descricao || c.description || '' })).filter((c) => c.nome);
        filtrarComandos();
      });
    }
    selecionado = 0;
    filtrarComandos();
  });
  campo.addEventListener('keydown', (ev) => {
    if (!listaComandos.hidden) {
      const n = listaComandos.achados?.length || 0;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        selecionado = (selecionado + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n;
        filtrarComandos();
        return ev.preventDefault();
      }
      if (ev.key === 'Tab' || (ev.key === 'Enter' && !ev.shiftKey && campo.value.trim() !== `/${listaComandos.achados[selecionado]?.nome}`)) {
        completar(listaComandos.achados[selecionado]);
        return ev.preventDefault();
      }
      if (ev.key === 'Escape') {
        listaComandos.hidden = true;
        return ev.preventDefault();
      }
    }
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  campo.addEventListener('blur', () => setTimeout(() => (listaComandos.hidden = true), 120));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const texto = campo.value.trim();
    if (!texto) return;
    enviar.disabled = true;
    mandar({ t: 'send', instance: id, text: texto }, (erro) => {
      enviar.disabled = false;
      if (erro) return avisar(erro);
      campo.value = '';
      ajustarAltura();
    });
  });

  // --- anexos: o arquivo vai para a pasta do duckV e o caminho entra na mensagem
  async function anexarArquivos(arquivos) {
    for (const f of arquivos) {
      if (f.size > 25 * 1024 * 1024) {
        avisar(`${f.name}: grande demais (máximo de 25 MB).`);
        continue;
      }
      try {
        const r = await fetch(`/api/anexo?nome=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', body: f });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || 'falhou');
        campo.value = `${campo.value}${campo.value && !/\s$/.test(campo.value) ? ' ' : ''}${j.caminho} `;
        ajustarAltura();
        avisar(`Anexado: ${f.name}`);
      } catch (e) {
        avisar(`Não consegui anexar ${f.name}: ${e.message}`);
      }
    }
    campo.focus();
  }
  anexar.addEventListener('click', () => escolherArquivo.click());
  escolherArquivo.addEventListener('change', () => {
    anexarArquivos([...escolherArquivo.files]);
    escolherArquivo.value = '';
  });
  form.addEventListener('dragover', (ev) => {
    if (![...ev.dataTransfer.types].includes('Files')) return;
    ev.preventDefault();
    form.classList.add('solta');
  });
  form.addEventListener('dragleave', () => form.classList.remove('solta'));
  form.addEventListener('drop', (ev) => {
    form.classList.remove('solta');
    if (!ev.dataTransfer.files.length) return;
    ev.preventDefault();
    anexarArquivos([...ev.dataTransfer.files]);
  });
  campo.addEventListener('paste', (ev) => {
    const fs = [...(ev.clipboardData?.files || [])];
    if (fs.length) {
      ev.preventDefault();
      anexarArquivos(fs);
    }
  });

  // --- conversa
  const textoVazio = (s) =>
    s?.hosted ? 'A conversa aparece aqui depois da sua primeira mensagem. Se o agente perguntar algo ao abrir, a pergunta surge logo abaixo, com botões.' : 'A conversa aparece aqui assim que a sessão trocar mensagens.';
  function desenharConversa(tudo, novas) {
    const noFim = conversa.scrollHeight - conversa.scrollTop - conversa.clientHeight < 160;
    if (tudo) {
      const itens = visiveis(conversas.get(id) || []);
      conversa.replaceChildren(...(itens.length ? itens.slice(-600).map(criarMensagem) : [el('p', { class: 'vazio', text: textoVazio(sessao()) })]));
      conversa.scrollTop = conversa.scrollHeight;
      return;
    }
    const itens = visiveis(novas);
    if (!itens.length) return;
    conversa.querySelector(':scope > .vazio')?.remove();
    conversa.append(...itens.map(criarMensagem));
    if (noFim) conversa.scrollTop = conversa.scrollHeight;
  }
  const largarConversa = ouvir('conversa', id, desenharConversa);

  // --- terminal
  let term = null;
  let fit = null;
  let ligadoCru = false;
  let tamanhoTimer = null;
  const observador = new ResizeObserver(() => {
    clearTimeout(tamanhoTimer);
    tamanhoTimer = setTimeout(ajustarTerminal, 120);
  });
  function temaTerminal() {
    return {
      background: '#120d0a',
      foreground: '#f1dfd6',
      cursor: '#ff8c3a',
      cursorAccent: '#120d0a',
      selectionBackground: 'rgba(255, 140, 58, 0.35)',
      black: '#221a15', red: '#ff6b5e', green: '#7fd48a', yellow: '#ffd84a', blue: '#7aa7ff', magenta: '#e58ac9', cyan: '#6fd3d1', white: '#d8c2b6',
      brightBlack: '#85736a', brightRed: '#ffb4ab', brightGreen: '#a8e6b0', brightYellow: '#ffe58a', brightBlue: '#a9c4ff', brightMagenta: '#f3b5df', brightCyan: '#a3e8e6', brightWhite: '#fff8f5',
    };
  }
  function montarTerminal() {
    if (term || typeof Terminal === 'undefined') return;
    term = new Terminal({
      fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: temaTerminal(),
      macOptionIsMeta: true,
    });
    fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(caixaTerminal);
    term.onData((data) => ligadoCru && mandar({ t: 'cruEntrada', instance: id, data }));
    // Ctrl+C com texto marcado copia; o resto vai para o programa. Os atalhos do duckV, dentro do
    // terminal, levam Shift junto (Ctrl+Shift+K...), para nao roubar as teclas do agente.
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        return false;
      }
      if (mod && ev.shiftKey && ev.key.toLowerCase() === 'v') {
        navigator.clipboard.readText().then((t) => t && ligadoCru && mandar({ t: 'cruEntrada', instance: id, data: t.slice(0, 8000) }));
        return false;
      }
      if (mod && ev.shiftKey) return false;
      return true;
    });
    observador.observe(caixaTerminal);
  }
  function ajustarTerminal() {
    if (!term || modo !== 'terminal' || !caixaTerminal.clientWidth) return;
    try {
      fit.fit();
    } catch {
      return;
    }
    if (ligadoCru) mandar({ t: 'cruTamanho', instance: id, cols: term.cols, rows: term.rows });
  }
  function ligarCru() {
    const s = sessao();
    if (!S.desktop) return mostrarAvisoTerminal('O terminal de verdade só abre no app do duckV para o computador.');
    if (!s?.hosted) {
      const conta = s && contaDe(s);
      return mostrarAvisoTerminal(
        s?.status === 'ended' ? 'Esta sessão foi encerrada.' : 'Esta sessão roda numa janela de terminal do computador, fora do duckV. A conversa e os pedidos aparecem aqui; o terminal dela fica naquela janela.',
        s?.cwd && conta && S.desktop ? el('button', { class: 'botao quieto', type: 'button', onclick: () => abrirNoTerminalDoSistema(conta.id, s.cwd) }, icone('arrow-square-out', 18), 'Abrir outra no terminal do sistema') : null,
      );
    }
    avisoTerminal.hidden = true;
    montarTerminal();
    if (!term) return mostrarAvisoTerminal('Não consegui carregar o terminal (xterm.js).');
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* painel escondido */
      }
      mandar({ t: 'cru', instance: id, on: true, cols: term.cols, rows: term.rows }, (erro) => {
        if (erro) return mostrarAvisoTerminal(erro);
        ligadoCru = true;
        term.focus();
      });
    });
  }
  function desligarCru() {
    if (!ligadoCru) return;
    ligadoCru = false;
    mandar({ t: 'cru', instance: id, on: false });
  }
  function mostrarAvisoTerminal(texto, extra) {
    avisoTerminal.replaceChildren(el('div', null, icone('terminal-window', 28), el('p', { text: texto }), extra));
    avisoTerminal.hidden = false;
  }
  const largarCru = ouvir('cru', id, (m) => {
    if (!term) return;
    if (m.inicio) term.reset();
    if (m.data) term.write(m.data);
    if (m.fim) {
      ligadoCru = false;
      term.write('\r\n\x1b[38;2;160;141;132m[sessão encerrada]\x1b[0m\r\n');
    }
  });

  function trocarModo(novo) {
    if (novo === modo && corpo.firstChild) return;
    if (modo === 'terminal' && novo !== 'terminal') desligarCru();
    modo = novo;
    area.salvar();
    atualizar();
    if (modo === 'terminal') ligarCru();
    else {
      conversa.scrollTop = conversa.scrollHeight;
      campo.focus();
    }
  }

  // --- rapidas
  let ultimasRapidas = '';
  function desenharRapidas(s) {
    const pode = s.canSend && s.status !== 'ended';
    rapidas.hidden = !pode;
    if (!pode) return;
    const trabalhando = s.hosted && s.status === 'working';
    const marca = JSON.stringify([trabalhando, S.prefs.rapidas]);
    if (marca === ultimasRapidas) return;
    ultimasRapidas = marca;
    rapidas.replaceChildren(
      ...(trabalhando ? [el('button', { class: 'botao', type: 'button', onclick: () => tecla('esc', 'Interrompido') }, icone('hand-palm', 16), 'Interromper')] : []),
      ...S.prefs.rapidas.map((r) => el('button', { class: 'botao quieto', type: 'button', text: r, title: 'Enviar esta mensagem', onclick: () => enviarTexto(r, 'Enviada') })),
    );
  }

  function atualizar() {
    const s = sessao();
    const vista = modo === 'terminal' ? vistaTerminal : vistaConversa;
    if (corpo.firstChild !== vista) corpo.replaceChildren(vista);
    segConversa.setAttribute('aria-selected', String(modo === 'conversa'));
    segTerminal.setAttribute('aria-selected', String(modo === 'terminal'));
    if (!s) {
      titulo.textContent = S.pronto ? 'Sessão encerrada' : 'Carregando';
      linha.replaceChildren(S.pronto ? 'Ela não está mais aberta no computador.' : 'Buscando a sessão.');
      pista.definir('dorme');
      baixo.hidden = true;
      info.hidden = true;
      return;
    }
    const conta = contaDe(s);
    raiz.style.setProperty('--cor', conta.cor);
    pista.style.setProperty('--cor', conta.cor);
    titulo.textContent = nomeDaSessao(s);
    titulo.title = s.cwd || '';
    const ondeTxt = [conta.nome, s.model, s.cwd].filter(Boolean).join(' · ');
    linha.replaceChildren(chipAgente(conta), el('span', { class: 'onde', text: ondeTxt, title: ondeTxt }));
    pista.definir(estadoDoPato(s));
    segTerminal.disabled = !S.desktop;
    segTerminal.title = S.desktop ? (s.hosted ? 'Terminal de verdade desta sessão' : 'Esta sessão roda num terminal do computador') : 'Só no app do duckV para o computador';
    if (area.visivel(id)) novasMsgs.delete(id);

    info.hidden = false;
    fazendo.textContent = s.status === 'idle' ? 'Esperando sua mensagem' : oQueFaz(s);
    fazendo.classList.toggle('pede', precisa(s));
    ctxCaixa.hidden = !s.ctx?.size;
    if (s.ctx?.size) {
      const p = s.ctx.pct ?? 0;
      const b = barra(p, conta.cor);
      ctxCaixa.replaceChildren('Contexto ', el('b', { text: `${Math.round(p)}%` }), b);
      ctxCaixa.title = `${compacto.format(s.ctx.in)} de ${compacto.format(s.ctx.size)} tokens da memória da conversa`;
    }
    const gastos = s.tokens.in + s.tokens.cw + s.tokens.out;
    gasto.hidden = !gastos;
    if (gastos) gasto.replaceChildren('Gasto ', el('b', { text: compacto.format(gastos) }), ' tokens', ...(s.lines && (s.lines.add || s.lines.rem) ? ['  ·  Linhas ', el('b', { text: `+${s.lines.add} −${s.lines.rem}` })] : []));
    tarefas.hidden = !s.tasks.length;
    if (s.tasks.length) {
      const feitas = s.tasks.filter((t) => t.status === 'completed').length;
      tarefasTexto.replaceChildren(icone('list-checks', 16), `Tarefas: ${feitas} de ${s.tasks.length}`);
      tarefasLista.replaceChildren(...s.tasks.map((t) => el('li', { 'data-s': t.status }, icone(t.status === 'completed' ? 'check' : 'caret-right', 14), el('span', { text: t.subject }))));
    }
    const vazio = conversa.querySelector(':scope > .vazio');
    if (vazio) vazio.textContent = textoVazio(s);

    sincronizarPedidos(pedidos, pedidosDe([s], false));
    desenharRapidas(s);
    const viva = s.status !== 'ended';
    baixo.hidden = false;
    form.hidden = !viva;
    campo.disabled = enviar.disabled = !s.canSend;
    anexar.disabled = !s.canSend;
    campo.placeholder = s.canSend ? (s.hosted ? `Mensagem para ${conta.nome} ou /comando  ·  Enter envia, Shift+Enter quebra linha` : `Mensagem para ${conta.nome}`) : '';
    nota.textContent = !viva
      ? 'Sessão encerrada.'
      : s.canSend
        ? ''
        : s.login
          ? 'Siga a entrada na conta pelo Terminal.'
          : 'Esta sessão não recebe mensagens do duckV. Abra-a pelo atalho da conta, com o duckV ligado, ou continue a conversa aqui pelo menu ⋯.';
    nota.hidden = !nota.textContent;
    if (modo === 'terminal' && !ligadoCru && avisoTerminal.hidden && term == null) ligarCru();
  }

  return {
    raiz,
    get id() {
      return id;
    },
    get modo() {
      return modo;
    },
    atualizar,
    focar: () => (modo === 'terminal' ? term?.focus() : campo.focus()),
    iniciar() {
      mandar({ t: 'open', instance: id, junto: true });
      desenharConversa(true);
      atualizar();
      if (modo === 'terminal') ligarCru();
    },
    religou() {
      mandar({ t: 'open', instance: id, junto: true });
      if (modo === 'terminal' && sessao()?.hosted) ligarCru();
    },
    fechar() {
      desligarCru();
      largarConversa();
      largarCru();
      observador.disconnect();
      term?.dispose();
      mandar({ t: 'close', instance: id });
    },
  };
}

function abrirNoTerminalDoSistema(contaId, cwd) {
  mandar({ t: 'terminalDoSistema', account: contaId, cwd }, (erro) => avisar(erro || 'Abrindo uma janela de terminal'));
}

// ------------------------------------------------------------ area de trabalho (paineis)
const LAYOUTS = [
  ['1', 'Um painel', 'square', 1],
  ['2c', 'Dois lado a lado', 'square-split-horizontal', 2],
  ['2l', 'Dois empilhados', 'square-split-vertical', 2],
  ['3', 'Três', 'stack', 3],
  ['4', 'Quatro em grade', 'squares-four', 4],
];
const vagas = (layout) => LAYOUTS.find((l) => l[0] === layout)?.[3] || 1;

const area = (() => {
  const grade = el('div', { class: 'paineis' });
  let lista = []; // paineis na ordem da grade
  let foco = null;
  function salvar() {
    guardarLocal('paineis', lista.map((p) => ({ id: p.id, modo: p.modo })));
  }
  function aplicar() {
    const layout = LOCAL.layout;
    grade.dataset.layout = vagas(layout) >= lista.length ? layout : lista.length >= 4 ? '4' : lista.length === 3 ? '3' : '2c';
    grade.replaceChildren(...lista.map((p) => p.raiz));
    for (const p of lista) p.raiz.dataset.foco = p === foco && lista.length > 1 ? 'sim' : 'nao';
  }
  function focar(p) {
    foco = p;
    for (const x of lista) x.raiz.dataset.foco = x === foco && lista.length > 1 ? 'sim' : 'nao';
  }
  function criar(id, modo) {
    const p = criarPainel(id, { modo });
    p.raiz.addEventListener('focusin', () => focar(p));
    p.raiz.addEventListener('pointerdown', () => focar(p));
    // Arrastar uma sessao da barra lateral para um painel troca o que ele mostra.
    p.raiz.addEventListener('dragover', (ev) => {
      if (!ev.dataTransfer.types.includes('text/duckv-sessao')) return;
      ev.preventDefault();
      p.raiz.classList.add('alvo');
    });
    p.raiz.addEventListener('dragleave', (ev) => !p.raiz.contains(ev.relatedTarget) && p.raiz.classList.remove('alvo'));
    p.raiz.addEventListener('drop', (ev) => {
      p.raiz.classList.remove('alvo');
      const sid = ev.dataTransfer.getData('text/duckv-sessao');
      if (sid) {
        ev.preventDefault();
        trocar(p.raiz, sid);
      }
    });
    return p;
  }
  // Abre uma sessao: se ja esta num painel, vai ate ele; "aoLado" cria um painel novo; sem isso,
  // ocupa o painel em foco (ou cria um, se ainda houver vaga no layout).
  let esperando = null; // sessao recem-criada que ainda nao chegou no estado
  function abrir(id, opts = {}) {
    if (!sessaoPorId(id) && S.pronto) {
      // Sessao que acabou de abrir chega no proximo estado (o servidor junta as mudancas em ~80 ms).
      if (!opts.esperou) {
        esperando = { id, opts: { ...opts, esperou: true }, ate: Date.now() + 5000 };
        return;
      }
      return avisar('Essa sessão não está mais aberta.');
    }
    novasMsgs.delete(id);
    const ja = lista.find((p) => p.id === id);
    if (ja && !opts.aoLado) {
      if (opts.modo && ja.modo !== opts.modo) {
        trocar(ja.raiz, id, opts.modo);
        return;
      }
      focar(ja);
      ja.focar();
      vista.mostrar('paineis');
      return;
    }
    const novo = criar(id, opts.modo);
    if (opts.aoLado || lista.length < vagas(LOCAL.layout) || !foco) {
      const i = foco ? lista.indexOf(foco) + 1 : lista.length;
      lista.splice(i, 0, novo);
      if (lista.length > vagas(LOCAL.layout)) guardarLocal('layout', lista.length === 2 ? '2c' : lista.length === 3 ? '3' : '4');
      if (lista.length > 4) {
        const sai = lista.find((p) => p !== novo);
        lista = lista.filter((p) => p !== sai);
        sai.fechar();
      }
    } else {
      const i = lista.indexOf(foco);
      foco.fechar();
      lista[i] = novo;
    }
    vista.mostrar('paineis');
    aplicar();
    novo.iniciar();
    focar(novo);
    setTimeout(() => novo.focar(), 50);
    salvar();
    desenhar();
  }
  function trocar(raiz, id, modo) {
    const i = lista.findIndex((p) => p.raiz === raiz);
    if (i < 0) return abrir(id, { modo });
    const outro = lista.findIndex((p) => p.id === id);
    if (outro >= 0 && outro !== i) {
      lista[outro].fechar();
      lista.splice(outro, 1);
    }
    const j = lista.findIndex((p) => p.raiz === raiz);
    lista[j].fechar();
    const novo = criar(id, modo);
    lista[j] = novo;
    aplicar();
    novo.iniciar();
    focar(novo);
    salvar();
    desenhar();
  }
  function fechar(raiz) {
    const p = lista.find((x) => x.raiz === raiz);
    if (!p) return;
    p.fechar();
    lista = lista.filter((x) => x !== p);
    if (foco === p) foco = lista[0] || null;
    aplicar();
    salvar();
    desenhar();
  }
  function layout(l) {
    guardarLocal('layout', l);
    while (lista.length > vagas(l)) {
      const p = lista.pop();
      p.fechar();
    }
    aplicar();
    salvar();
    desenhar();
  }
  function restaurar() {
    for (const { id, modo } of LOCAL.paineis || []) {
      if (!sessaoPorId(id) || lista.some((p) => p.id === id)) continue;
      const p = criar(id, modo);
      lista.push(p);
      p.iniciar();
    }
    foco = lista[0] || null;
    aplicar();
    salvar();
  }
  return {
    grade,
    abrir,
    trocar,
    fechar,
    layout,
    restaurar,
    salvar,
    paineis: () => lista,
    focado: () => foco,
    visivel: (id) => vista.atual === 'paineis' && lista.some((p) => p.id === id),
    proximo(delta) {
      if (!lista.length) return;
      const i = (lista.indexOf(foco) + delta + lista.length) % lista.length;
      focar(lista[i]);
      lista[i].focar();
    },
    atualizar() {
      if (esperando && (sessaoPorId(esperando.id) || Date.now() > esperando.ate)) {
        const e = esperando;
        esperando = null;
        return abrir(e.id, e.opts);
      }
      for (const p of lista) p.atualizar();
    },
  };
})();

// ------------------------------------------------------------ barra lateral
const lateral = (() => {
  const novaSessao = el('button', { class: 'botao principal', type: 'button', onclick: () => abrirNova() }, icone('plus', 20), 'Nova sessão');
  const busca = el('button', { class: 'busca-botao', type: 'button', onclick: () => abrirBusca() }, icone('magnifying-glass', 18), el('span', { text: 'Buscar ou comandar' }), el('kbd', { class: 'atalho', text: `${CTRL} K` }));
  const contPedidos = el('span', { class: 'contador' });
  const navVisao = el('button', { class: 'nav-item', type: 'button', onclick: () => vista.mostrar('visao') }, icone('squares-four', 20), el('span', { text: 'Visão geral' }));
  const navPaineis = el('button', { class: 'nav-item', type: 'button', onclick: () => vista.mostrar('paineis') }, icone('square-split-horizontal', 20), el('span', { text: 'Painéis' }), el('span', { class: 'contador quieto' }));
  const navFila = el('button', { class: 'nav-item', type: 'button', onclick: () => fila.alternar() }, icone('bell', 20), el('span', { text: 'Precisa de você' }), contPedidos);
  const contas = el('div');
  const navCelulares = el('button', { class: 'nav-item', type: 'button', onclick: () => vista.mostrar('celulares') }, icone('device-mobile', 20), el('span', { text: 'Celulares' }), el('span', { class: 'contador quieto' }));
  const navOpcoes = el('button', { class: 'nav-item', type: 'button', onclick: () => vista.mostrar('opcoes') }, icone('gear-six', 20), el('span', { text: 'Opções' }));
  const recolher = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Recolher barra lateral', title: `Recolher barra lateral (${CTRL}+B)`, onclick: () => alternarLateral() }, icone('sidebar-simple', 20));
  const raiz = el(
    'aside',
    { class: 'lateral', 'aria-label': 'Contas e sessões' },
    el('div', { class: 'lateral-topo' }, el('div', { class: 'marca-duckv', 'aria-label': 'duckV' }, 'duck', el('b', { text: 'V' })), recolher),
    el('div', { class: 'lateral-acoes' }, novaSessao, busca),
    el('nav', { class: 'nav', 'aria-label': 'Seções' }, navVisao, navPaineis, navFila),
    el('div', { class: 'lateral-rolo' }, el('div', { class: 'secao-titulo' }, el('span', { text: 'Contas' }), el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Adicionar conta', title: 'Adicionar conta', onclick: () => vista.mostrar('opcoes', 'contas') }, icone('user-plus', 18))), contas),
    el('div', { class: 'lateral-pe' }, navCelulares, navOpcoes),
  );
  const grupos = new Map();

  function grupoConta(c) {
    const pato = miniPato('dorme', c.cor);
    const nome = el('span');
    const estado = el('span', { class: 'estado' });
    const usoTxt = el('span');
    const uso = el('span', { class: 'uso' }, usoTxt);
    const linhaConta = el('button', { class: 'conta-linha', type: 'button', 'aria-expanded': 'true' }, pato, el('span', { class: 'quem' }, el('span', { class: 'nome' }, nome), estado), uso);
    const sessoes = el('div', { class: 'sessoes-conta', role: 'list' });
    const raizG = el('div', { class: 'grupo-conta', 'data-aberto': 'sim' }, linhaConta, sessoes);
    linhaConta.addEventListener('click', () => {
      const aberto = raizG.dataset.aberto !== 'sim';
      raizG.dataset.aberto = aberto ? 'sim' : 'nao';
      linhaConta.setAttribute('aria-expanded', String(aberto));
      sessoes.hidden = !aberto;
      guardarLocal('fechadas', aberto ? LOCAL.fechadas.filter((x) => x !== c.id) : [...LOCAL.fechadas, c.id]);
    });
    linhaConta.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      abrirMenu(linhaConta, [
        { texto: 'Nova sessão nesta conta', icone: 'plus', acao: () => abrirNova({ conta: c.id }) },
        ...(S.desktop ? [{ texto: 'Abrir no terminal do sistema', icone: 'arrow-square-out', acao: () => abrirNova({ conta: c.id, onde: 'sistema' }) }] : []),
        { texto: 'Todas as conversas', icone: 'chats', acao: () => abrirHistorico(c.id) },
        '-',
        { texto: 'Ajustes da conta', icone: 'gear-six', acao: () => vista.mostrar('opcoes', 'contas') },
      ]);
    });
    if (LOCAL.fechadas.includes(c.id)) {
      raizG.dataset.aberto = 'nao';
      linhaConta.setAttribute('aria-expanded', 'false');
      sessoes.hidden = true;
    }
    let marca = '';
    function atualizar(conta) {
      c = conta;
      raizG.style.setProperty('--cor', conta.cor);
      pato.style.setProperty('--cor', conta.cor);
      const e = estadoDaConta(conta);
      pato.definir(e.bicho);
      nome.textContent = conta.nome;
      if (!nome.nextSibling) nome.after(chipAgente(conta));
      else nome.nextSibling.replaceWith(chipAgente(conta));
      estado.textContent = e.texto;
      estado.classList.toggle('pede', !!e.pede);
      const u5 = conta.usage?.five_hour;
      usoTxt.textContent = typeof u5?.pct === 'number' ? `${Math.round(u5.pct)}%` : '';
      uso.querySelector('.barra')?.remove();
      if (typeof u5?.pct === 'number') uso.append(barra(u5.pct, conta.cor));
      uso.title = typeof u5?.pct === 'number' ? `Limite de 5 horas: ${Math.round(u5.pct)}% usado. ${textoDoReinicio(conta, 'five_hour', u5)}.` : 'Sem leitura do limite ainda';
      const ss = S.sessoes.filter((s) => s.account === conta.id && (s.status !== 'ended' || area.paineis().some((p) => p.id === s.id))).sort((a, b) => a.startedAt - b.startedAt);
      const focada = area.focado()?.id;
      const nova = JSON.stringify([ss.map((s) => [s.id, s.status, nomeDaSessao(s), oQueFaz(s), Math.round(s.ctx?.pct ?? -1), novasMsgs.has(s.id), area.visivel(s.id), s.id === focada]), S.host.available]);
      if (nova === marca) return;
      marca = nova;
      sessoes.replaceChildren(
        ...ss.map((s) => {
          const b = el(
            'button',
            {
              class: `sessao-linha${precisa(s) ? ' pede' : ''}${novasMsgs.has(s.id) ? ' nova-msg' : ''}`,
              type: 'button',
              role: 'listitem',
              draggable: true,
              'aria-current': area.visivel(s.id) ? 'true' : 'false',
              title: `${nomeDaSessao(s)}${s.cwd ? `\n${s.cwd}` : ''}\n\nClique para abrir; ${CTRL}+clique abre ao lado; arraste para um painel.`,
              onclick: (ev) => area.abrir(s.id, { aoLado: ev.ctrlKey || ev.metaKey }),
            },
            el('span', { class: 'ponto', 'data-s': precisa(s) ? 'waiting' : s.status, 'aria-hidden': 'true' }),
            el('span', { class: 't' }, el('b', { text: nomeDaSessao(s) }), el('span', { text: oQueFaz(s) })),
            el('span', { class: 'lado', text: s.ctx?.pct != null ? `${Math.round(s.ctx.pct)}%` : '' }),
          );
          b.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/duckv-sessao', s.id);
            ev.dataTransfer.effectAllowed = 'move';
          });
          b.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            abrirMenu(b, [
              { texto: 'Abrir', icone: 'chat-text', acao: () => area.abrir(s.id) },
              { texto: 'Abrir ao lado', icone: 'square-split-horizontal', acao: () => area.abrir(s.id, { aoLado: true }) },
              ...(s.hosted && S.desktop ? [{ texto: 'Abrir o terminal', icone: 'terminal-window', acao: () => area.abrir(s.id, { modo: 'terminal' }) }] : []),
            ]);
          });
          return b;
        }),
      );
      if (!ss.length) {
        sessoes.append(
          el(
            'p',
            { class: 'vazio-conta' },
            'Nenhuma sessão. ',
            S.host.available ? el('button', { type: 'button', text: 'Abrir uma', onclick: () => abrirNova({ conta: conta.id }) }) : null,
          ),
        );
      }
    }
    return { raiz: raizG, atualizar };
  }

  function atualizar() {
    const n = todosOsPedidos().length;
    contPedidos.textContent = String(n);
    contPedidos.hidden = !n;
    navFila.setAttribute('aria-label', n ? `Precisa de você: ${n}` : 'Precisa de você');
    navVisao.setAttribute('aria-current', String(vista.atual === 'visao'));
    navPaineis.setAttribute('aria-current', String(vista.atual === 'paineis'));
    navPaineis.lastChild.textContent = String(area.paineis().length);
    navPaineis.lastChild.hidden = !area.paineis().length;
    navOpcoes.setAttribute('aria-current', String(vista.atual === 'opcoes'));
    navCelulares.setAttribute('aria-current', String(vista.atual === 'celulares'));
    navCelulares.hidden = !S.desktop;
    const nAp = S.desktop?.aparelhos?.length || 0;
    navCelulares.lastChild.textContent = S.desktop?.pedidos?.length ? '!' : String(nAp);
    navCelulares.lastChild.className = S.desktop?.pedidos?.length ? 'contador' : 'contador quieto';
    navCelulares.lastChild.hidden = !nAp && !S.desktop?.pedidos?.length;
    novaSessao.disabled = !S.pronto || !S.host.available;
    for (const c of S.contas) {
      let g = grupos.get(c.id);
      if (!g) {
        g = grupoConta(c);
        grupos.set(c.id, g);
      }
      contas.append(g.raiz);
      g.atualizar(c);
    }
    for (const [id, g] of grupos) {
      if (!S.contas.some((c) => c.id === id)) {
        g.raiz.remove();
        grupos.delete(id);
      }
    }
  }
  return { raiz, atualizar };
})();

function alternarLateral() {
  const app = document.getElementById('app');
  const estreita = matchMedia('(max-width: 860px)').matches;
  const atual = app.dataset.lateral || (estreita ? 'fechada' : 'aberta');
  const nova = atual === 'aberta' ? 'fechada' : 'aberta';
  app.dataset.lateral = nova;
  if (!estreita) guardarLocal('lateral', nova);
}

// ------------------------------------------------------------ fila de pedidos (gaveta da direita)
const fila = (() => {
  const corpo = el('div', { class: 'gaveta-corpo' });
  const vazia = el('div', { class: 'gaveta-vazia' }, miniPato('parado'), el('b', { text: 'Nada esperando você' }), el('p', { text: 'Pedidos de permissão e perguntas de todas as contas aparecem aqui, do mais antigo para o mais novo.' }));
  const lista = el('div', { class: 'pedidos' });
  corpo.append(vazia, lista);
  const raiz = el(
    'aside',
    { class: 'gaveta', 'aria-label': 'Precisa de você', 'data-aberta': 'nao', tabIndex: -1 },
    el(
      'div',
      { class: 'gaveta-topo' },
      el('h2', { text: 'Precisa de você' }),
      el('span', { class: 'atalho', title: 'Aceitar o primeiro pedido' }, 'A aceita'),
      el('span', { class: 'atalho', title: 'Recusar o primeiro pedido' }, 'R recusa'),
      el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Fechar', onclick: () => alternar(false) }, icone('x', 20)),
    ),
    corpo,
  );
  raiz.inert = true;
  function alternar(abrir) {
    const aberta = abrir ?? raiz.dataset.aberta !== 'sim';
    raiz.dataset.aberta = aberta ? 'sim' : 'nao';
    raiz.inert = !aberta;
    if (aberta) setTimeout(() => (lista.querySelector('.pedido') || raiz).focus(), 60);
  }
  // A e R respondem o primeiro pedido de permissao da fila (o mais antigo), com a gaveta aberta.
  raiz.addEventListener('keydown', (ev) => {
    if (ev.target.closest('textarea, input')) return;
    if (ev.key === 'Escape') return alternar(false);
    const k = ev.key.toLowerCase();
    if (k !== 'a' && k !== 'r') return;
    const alvo = ev.target.closest('.pedido') || lista.querySelector('.pedido');
    alvo?.querySelector(`[data-acao='${k === 'a' ? 'aceitar' : 'recusar'}']`)?.click();
  });
  function atualizar() {
    const itens = todosOsPedidos();
    sincronizarPedidos(lista, itens);
    vazia.hidden = !!itens.length;
  }
  return { raiz, alternar, atualizar, aberta: () => raiz.dataset.aberta === 'sim' };
})();

// ------------------------------------------------------------ barra de status
let usoAberto = null;
function fecharUso() {
  usoAberto?.remove();
  usoAberto = null;
}
function abrirUso() {
  if (usoAberto) return fecharUso();
  const caixa = el('div', { class: 'uso-popover', role: 'dialog', 'aria-label': 'Uso das contas' }, el('h3', { text: 'Uso das contas' }));
  const ordenadas = [...S.contas].sort((a, b) => (b.usage?.five_hour?.pct ?? -1) - (a.usage?.five_hour?.pct ?? -1));
  for (const c of ordenadas) {
    const item = el('div', { class: 'item' }, el('div', { class: 'cab' }, el('i'), c.nome, chipAgente(c)));
    item.style.setProperty('--cor', c.cor);
    const temUso = typeof c.usage?.five_hour?.pct === 'number' || typeof c.usage?.seven_day?.pct === 'number';
    if (!temUso) item.append(el('p', { class: 'reinicio', text: c.usage?.erro === 'login' ? 'A conta saiu do login. Entre de novo para ver o limite.' : 'Sem leitura ainda: o número aparece depois da primeira resposta nesta conta.' }));
    for (const [k, r] of [['five_hour', 'Limite de 5 h'], ['seven_day', 'Semana']]) {
      const u = c.usage?.[k];
      if (typeof u?.pct !== 'number') continue;
      item.append(el('div', { class: 'janela' }, el('span', { text: r }), barra(u.pct, c.cor), el('b', { text: `${Math.round(u.pct)}%` })), el('p', { class: 'reinicio', text: textoDoReinicio(c, k, u) }));
    }
    if (c.usage?.at && agora() - c.usage.at > 5 * 60000) item.append(el('p', { class: 'reinicio', text: `Leitura de ${falta(agora() - c.usage.at)} atrás.` }));
    caixa.append(item);
  }
  document.body.append(caixa);
  usoAberto = caixa;
}
const status = (() => {
  const ligacao = el('button', { class: 'ligacao', type: 'button', title: 'Ligação com o duckV' }, el('i'), el('span'));
  const usos = el('div', { class: 'usos' });
  const demo = el('span', { class: 'demo', text: 'Demonstração', hidden: true });
  const sino = el('button', { class: 'sino', type: 'button', onclick: () => fila.alternar() }, icone('bell', 16), el('span'));
  const celulares = el('button', { type: 'button', onclick: () => vista.mostrar('celulares') }, icone('device-mobile', 16), el('span'));
  const raiz = el('footer', { class: 'status' }, ligacao, demo, usos, celulares, sino);
  function atualizar() {
    ligacao.dataset.ok = S.ligado ? 'sim' : S.ligado === false ? 'nao' : '';
    ligacao.lastChild.textContent = S.ligado ? (S.desktop?.tailnet ? `Ligado · ${S.desktop.tailnet}` : 'Ligado') : S.ligado === false ? 'Sem conexão: tentando de novo' : 'Conectando';
    demo.hidden = !S.demo;
    usos.replaceChildren(
      ...S.contas
        .filter((c) => typeof c.usage?.five_hour?.pct === 'number')
        .map((c) => {
          const u = c.usage.five_hour;
          const b = el('button', { class: 'uso-chip', type: 'button', onclick: abrirUso, title: `${c.nome}: ${Math.round(u.pct)}% do limite de 5 horas. ${textoDoReinicio(c, 'five_hour', u)}.` }, el('i'), c.nome, el('b', { text: `${Math.round(u.pct)}%` }));
          b.style.setProperty('--cor', c.cor);
          b.dataset.alerta = u.pct >= 100 ? 'cheio' : u.pct >= 80 ? 'sim' : 'nao';
          return b;
        }),
    );
    if (!usos.childElementCount && S.contas.length) usos.append(el('button', { type: 'button', onclick: abrirUso, text: 'Uso das contas' }));
    const n = todosOsPedidos().length;
    sino.dataset.tem = n ? 'sim' : 'nao';
    sino.lastChild.textContent = n ? plural(n, 'pedido', 'pedidos') : 'Nada esperando';
    celulares.hidden = !S.desktop;
    celulares.lastChild.textContent = plural(S.desktop?.aparelhos?.length || 0, 'celular', 'celulares');
  }
  return { raiz, atualizar };
})();

// ------------------------------------------------------------ visao geral
function criarVisao() {
  const cabTitulo = el('h2');
  const cabSub = el('p');
  const abrir = el('button', { class: 'botao principal', type: 'button', onclick: () => abrirNova() }, icone('plus', 18), 'Nova sessão');
  const resumoFila = el('div', { class: 'fila-resumo' });
  const grade = el('div', { class: 'contas-grade' });
  const dicas = el(
    'div',
    { class: 'atalhos-dicas' },
    el('span', null, el('kbd', { class: 'atalho', text: `${CTRL} K` }), 'buscar sessões e comandos'),
    el('span', null, el('kbd', { class: 'atalho', text: `${CTRL} N` }), 'nova sessão'),
    el('span', null, el('kbd', { class: 'atalho', text: `${CTRL} J` }), 'precisa de você'),
    el('span', null, el('kbd', { class: 'atalho', text: `${CTRL} 1–4` }), 'layout dos painéis'),
    el('span', null, el('kbd', { class: 'atalho', text: `${CTRL} B` }), 'barra lateral'),
  );
  const raiz = el('div', { class: 'visao' }, el('div', { class: 'visao-cabeca' }, el('div', null, cabTitulo, cabSub), abrir), resumoFila, grade, dicas);
  const cartoes = new Map();

  function cartao(c) {
    const pista = bicho();
    const nome = el('h3');
    const estado = el('p');
    const cinco = el('div', { class: 'limite' });
    const semana = el('div', { class: 'limite-semana' });
    const lista = el('div', { class: 'lista' });
    const acoes = el('div', { class: 'acoes' });
    const raizC = el('section', { class: 'conta-cartao' }, el('div', { class: 'cabeca' }, el('div', null, nome, estado), el('div', { class: 'pato-grande' }, pista)), cinco, semana, lista, acoes);
    function atualizar(conta) {
      raizC.style.setProperty('--cor', conta.cor);
      const e = estadoDaConta(conta);
      pista.definir(e.bicho);
      nome.replaceChildren(conta.nome, chipAgente(conta));
      estado.textContent = conta.email ? `${e.texto} · ${conta.email}` : e.texto;
      estado.classList.toggle('pede', !!e.pede);
      const u = conta.usage?.five_hour;
      const tem = typeof u?.pct === 'number';
      cinco.replaceChildren(
        el('div', { class: 'linha' }, el('span', { class: 'rotulo', text: 'Limite de 5 horas' }), tem ? el('span', { class: 'valor' }, String(Math.round(u.pct)), el('small', { text: '%' })) : el('span', { class: 'valor sem', text: 'sem leitura' })),
        barra(tem ? u.pct : null, conta.cor),
        el('p', { class: 'quando', text: tem ? `${textoDoReinicio(conta, 'five_hour', u)}.` : conta.usage?.erro === 'login' ? 'A conta saiu do login. Entre de novo nela.' : (conta.agente || 'claude') === 'claude' || conta.agente === 'codex' ? 'O número aparece depois da primeira resposta nesta conta.' : 'Este agente não informa limite de uso.' }),
      );
      const s7 = conta.usage?.seven_day;
      const tok = conta.tokens ? conta.tokens.in + conta.tokens.cw + conta.tokens.out : null;
      semana.replaceChildren(
        el('div', null, 'Semana', el('b', { text: typeof s7?.pct === 'number' ? `${Math.round(s7.pct)}%` : '—' }), typeof s7?.pct === 'number' && s7.resetsAt ? textoDoReinicio(conta, 'seven_day', s7) : ''),
        el('div', null, 'Tokens nesta janela', el('b', { text: tok != null ? compacto.format(tok) : '—' })),
      );
      const ss = vivas(conta.id);
      lista.replaceChildren(
        ...ss.map((s) =>
          el(
            'button',
            { class: `sessao-linha${precisa(s) ? ' pede' : ''}`, type: 'button', onclick: (ev) => area.abrir(s.id, { aoLado: ev.ctrlKey || ev.metaKey }) },
            el('span', { class: 'ponto', 'data-s': precisa(s) ? 'waiting' : s.status }),
            el('span', { class: 't' }, el('b', { text: nomeDaSessao(s) }), el('span', { text: oQueFaz(s) })),
            el('span', { class: 'lado', text: s.ctx?.pct != null ? `${Math.round(s.ctx.pct)}%` : '' }),
          ),
        ),
      );
      lista.hidden = !ss.length;
      acoes.replaceChildren(
        ...[
          el('button', { class: 'botao quieto pequeno', type: 'button', disabled: !S.host.available || conta.instalado === false, onclick: () => abrirNova({ conta: conta.id }) }, icone('plus', 16), 'Abrir sessão'),
          el('button', { class: 'botao texto pequeno', type: 'button', onclick: () => abrirHistorico(conta.id) }, 'Todas as conversas'),
          conta.instalado === false ? el('span', { class: 'p-nota', text: `${agenteDaConta(conta).nome} não está instalado` }) : null,
        ].filter(Boolean),
      );
    }
    return { raiz: raizC, atualizar };
  }
  function atualizar() {
    const pedidos = todosOsPedidos();
    const ativas = S.sessoes.filter((s) => s.status !== 'ended');
    const trabalhando = ativas.filter((s) => s.status === 'working').length;
    cabTitulo.textContent = pedidos.length ? `${plural(pedidos.length, 'coisa espera', 'coisas esperam')} você` : trabalhando ? `${plural(trabalhando, 'sessão trabalhando', 'sessões trabalhando')}` : 'Tudo em dia';
    cabSub.textContent = `${plural(S.contas.length, 'conta', 'contas')} · ${plural(ativas.length, 'sessão aberta', 'sessões abertas')}`;
    abrir.disabled = !S.host.available;
    sincronizarPedidos(resumoFila, pedidos.slice(0, 3).map((p) => ({ ...p })));
    if (pedidos.length > 3) resumoFila.append(el('button', { class: 'botao texto', type: 'button', onclick: () => fila.alternar(true), text: `Ver os outros ${pedidos.length - 3}` }));
    for (const c of S.contas) {
      let v = cartoes.get(c.id);
      if (!v) {
        v = cartao(c);
        cartoes.set(c.id, v);
      }
      grade.append(v.raiz);
      v.atualizar(c);
    }
    for (const [id, v] of cartoes) if (!S.contas.some((c) => c.id === id)) (v.raiz.remove(), cartoes.delete(id));
  }
  return { raiz, atualizar };
}

// ------------------------------------------------------------ dialogo de nova sessao
function dialogo(titulo, sub) {
  const corpo = el('div', { class: 'dialogo-corpo' });
  const pe = el('div', { class: 'dialogo-pe' });
  const d = el('dialog', null, el('form', { class: 'dialogo', method: 'dialog', noValidate: true }, el('div', { class: 'dialogo-topo' }, el('h2', { text: titulo }), sub ? el('p', { text: sub }) : null), corpo, pe));
  d.addEventListener('close', () => setTimeout(() => d.remove(), 200));
  document.body.append(d);
  return { d, corpo, pe, form: d.firstChild };
}

function abrirNova(opts = {}) {
  if (!S.host.available) return avisar('Este computador não conseguiu carregar o terminal virtual. Rode a instalação de novo.');
  const { d, corpo, pe, form } = dialogo('Nova sessão', 'Abre no computador. Você acompanha e comanda daqui, do celular ou pelo terminal.');
  let contaId = opts.conta || 'auto';
  let onde = opts.onde === 'sistema' && S.desktop ? 'sistema' : 'duckv';
  const contas = el('div', { class: 'escolhas', role: 'radiogroup', 'aria-label': 'Conta' });
  const caminho = el('input', { id: 'nova-pasta', type: 'text', autocomplete: 'off', spellcheck: false, placeholder: S.host.home || '' });
  const procurar = el('button', { class: 'botao quieto', type: 'button' }, icone('folder-open', 18), 'Procurar');
  const navegador = el('div', { class: 'navegador', hidden: true });
  const recentes = el('div', { class: 'chips' });
  const erroPasta = el('p', { class: 'erro', role: 'alert', hidden: true });
  const nome = el('input', { id: 'nova-nome', type: 'text', autocomplete: 'off', maxLength: 50, placeholder: 'Opcional' });
  const modelo = el('select', { id: 'nova-modelo' });
  const esforco = el('select', { id: 'nova-esforco' });
  const modo = el('select', { id: 'nova-modo' });
  const ajudaModo = el('p', { class: 'ajuda' });
  const ondeChips = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Onde abrir' });
  const erroGeral = el('p', { class: 'erro', role: 'alert', hidden: true });
  const abrir = el('button', { class: 'botao principal', type: 'submit', value: 'abrir', text: 'Abrir sessão' });
  const ajustes = el('div', { class: 'lado-a-lado' }, el('div', { class: 'campo' }, el('label', { for: 'nova-modelo', text: 'Modelo' }), modelo), el('div', { class: 'campo' }, el('label', { for: 'nova-esforco', text: 'Esforço' }), esforco), el('div', { class: 'campo' }, el('label', { for: 'nova-modo', text: 'Permissões' }), modo));

  corpo.append(
    el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Conta' }), contas),
    el('div', { class: 'campo' }, el('label', { for: 'nova-pasta', text: 'Pasta do projeto' }), el('div', { class: 'pasta-linha' }, caminho, procurar), erroPasta, navegador, recentes),
    el('div', { class: 'campo' }, el('label', { for: 'nova-nome', text: 'Nome da sessão' }), nome),
    ajustes,
    ajudaModo,
    S.desktop ? el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Onde abrir' }), ondeChips) : null,
    erroGeral,
  );
  pe.append(el('button', { class: 'botao texto', type: 'button', text: 'Cancelar', onclick: () => d.close() }), abrir);

  const contaEscolhida = () => (contaId === 'auto' ? contaAutomatica('claude')?.conta || contaAutomatica()?.conta : S.contas.find((c) => c.id === contaId));
  function desenharContas() {
    const auto = contaAutomatica('claude') || contaAutomatica();
    const linhaEscolha = (id, rotulo, apoio, cor, uso) => {
      const b = el(
        'button',
        { class: 'escolha', type: 'button', role: 'radio', 'aria-checked': String(contaId === id), onclick: () => ((contaId = id), desenharContas(), aplicarAgente(true)) },
        cor ? el('i', { class: 'ponto-conta' }) : icone('sparkle', 18),
        el('span', { class: 't' }, el('b', { text: rotulo }), el('span', { text: apoio })),
        el('span', { class: 'uso-escolha', text: uso || '' }),
      );
      if (cor) b.style.setProperty('--cor', cor);
      return b;
    };
    contas.replaceChildren(
      linhaEscolha('auto', 'Automática', auto ? `Agora seria ${auto.conta.nome}: ${auto.motivo}` : 'Nenhuma conta disponível', null, ''),
      ...S.contas.map((c) => {
        const u = c.usage?.five_hour?.pct;
        return linhaEscolha(c.id, c.nome, `${agenteDaConta(c).nome}${c.instalado === false ? ' · não instalado' : ''}${c.email ? ` · ${c.email}` : ''}`, c.cor, typeof u === 'number' ? `${Math.round(u)}% em 5 h` : '');
      }),
    );
  }
  function desenharOnde() {
    ondeChips.replaceChildren(
      ...[
        ['duckv', 'Aqui no duckV', 'chat-text'],
        ['sistema', 'Terminal do sistema', 'terminal-window'],
      ].map(([v, t, ic]) => el('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(onde === v), onclick: () => ((onde = v), desenharOnde(), aplicarAgente(false)) }, icone(ic, 16), t)),
    );
  }
  let agenteAtual = null;
  function aplicarAgente(trocouConta) {
    const c = contaEscolhida();
    const ag = agenteDaConta(c);
    const p = c?.padroes || {};
    if (agenteAtual !== ag.id) {
      agenteAtual = ag.id;
      modelo.replaceChildren(...ag.modelos.map((m) => el('option', { value: m.id, text: m.rotulo })));
      esforco.replaceChildren(el('option', { value: '', text: 'Padrão' }), ...ag.esforcos.map((e) => el('option', { value: e.id, text: e.rotulo })));
      modo.replaceChildren(...ag.modos.map((m) => el('option', { value: m.id, text: m.rotulo })));
    }
    if (trocouConta) {
      if (p.model) modelo.value = p.model;
      esforco.value = p.effort || '';
      if (p.mode) modo.value = p.mode;
      if (p.cwd && !caminho.value.trim()) caminho.value = p.cwd;
    }
    esforco.disabled = !ag.esforcos.length;
    ajustes.hidden = onde === 'sistema';
    ajudaModo.hidden = onde === 'sistema';
    ajudaModo.textContent = MODOS_AJUDA[modo.value] || '';
    abrir.textContent = onde === 'sistema' ? 'Abrir no terminal' : 'Abrir sessão';
  }
  modo.addEventListener('change', () => (ajudaModo.textContent = MODOS_AJUDA[modo.value] || ''));
  function navegar(dir) {
    mandar({ t: 'ls', path: dir }, (erro, r) => {
      navegador.hidden = false;
      if (erro) return navegador.replaceChildren(el('p', { class: 'sem', text: erro }));
      caminho.value = r.path;
      erroPasta.hidden = true;
      navegador.replaceChildren(
        el('p', { class: 'onde-estou', text: r.path }),
        el(
          'ul',
          null,
          r.parent ? el('li', null, el('button', { type: 'button', onclick: () => navegar(r.parent) }, icone('arrow-up', 16), 'Pasta de cima')) : null,
          r.dirs.map((x) => el('li', null, el('button', { type: 'button', onclick: () => navegar(r.path + (r.path.endsWith(S.host.sep) ? '' : S.host.sep) + x) }, icone('folder', 16), x))),
        ),
        ...(r.dirs.length ? [] : [el('p', { class: 'sem', text: 'Sem subpastas. Esta pasta já está escolhida.' })]),
      );
    });
  }
  procurar.addEventListener('click', () => navegar(caminho.value.trim() || S.host.home));
  recentes.replaceChildren(
    ...S.host.folders.slice(0, 6).map((f) =>
      el('button', { class: 'chip', type: 'button', title: f, onclick: () => ((caminho.value = f), (erroPasta.hidden = true), (navegador.hidden = true)) }, icone('folder', 16), pasta(f) || f),
    ),
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    erroGeral.hidden = true;
    const c = contaEscolhida();
    const cwd = caminho.value.trim();
    if (!c) return Object.assign(erroGeral, { hidden: false, textContent: 'Escolha uma conta.' });
    if (!cwd) {
      erroPasta.textContent = 'Escolha a pasta do projeto.';
      erroPasta.hidden = false;
      return caminho.focus();
    }
    abrir.disabled = true;
    if (onde === 'sistema') {
      return mandar({ t: 'terminalDoSistema', account: c.id, cwd }, (erro) => {
        abrir.disabled = false;
        if (erro) return Object.assign(erroGeral, { hidden: false, textContent: erro });
        avisar(`Abrindo ${c.nome} numa janela de terminal`);
        d.close();
      });
    }
    mandar({ t: 'start', account: c.id, cwd, name: nome.value.trim(), model: modelo.value, effort: esforco.value || null, mode: modo.value, cols: 110, rows: 34 }, (erro, r) => {
      abrir.disabled = false;
      if (erro) return Object.assign(erroGeral, { hidden: false, textContent: erro });
      d.close();
      area.abrir(r.instance, { aoLado: opts.aoLado });
    });
  });
  desenharContas();
  desenharOnde();
  aplicarAgente(true);
  d.showModal();
  (caminho.value ? nome : caminho).focus();
}

// ------------------------------------------------------------ historico de conversas
function abrirHistorico(contaId) {
  const conta = S.contas.find((c) => c.id === contaId);
  if (!conta) return;
  const { d, corpo, pe } = dialogo(`Conversas de ${conta.nome}`, 'Inclusive as feitas no computador e no app Claude desktop. Abra para ler ou continuar.');
  const filtro = el('input', { type: 'search', placeholder: 'Filtrar por título ou pasta', 'aria-label': 'Filtrar conversas' });
  const lista = el('div', { class: 'escolhas' }, el('p', { class: 'p-nota', text: 'Carregando…' }));
  corpo.append(filtro, lista);
  pe.append(el('button', { class: 'botao texto', type: 'button', text: 'Fechar', onclick: () => d.close() }));
  let itens = [];
  const desenharLista = () => {
    const q = filtro.value.trim().toLowerCase();
    const achados = itens.filter((x) => !q || `${x.titulo} ${x.cwd}`.toLowerCase().includes(q)).slice(0, 200);
    lista.replaceChildren(
      ...(achados.length
        ? achados.map((x) =>
            el(
              'button',
              {
                class: 'escolha',
                type: 'button',
                onclick: () =>
                  mandar({ t: 'abrirHistorico', account: contaId, sid: x.sid }, (erro, r) => {
                    if (erro) return avisar(erro);
                    d.close();
                    area.abrir(r.instance);
                  }),
              },
              icone('chat-text', 18),
              el('span', { class: 't' }, el('b', { text: x.titulo || 'Sem título' }), el('span', { text: [pasta(x.cwd), x.mtime ? `${fData.format(x.mtime)} ${fHora.format(x.mtime)}` : ''].filter(Boolean).join(' · ') })),
              el('span'),
            ),
          )
        : [el('p', { class: 'p-nota', text: q ? 'Nada com esse filtro.' : 'Nenhuma conversa ainda.' })]),
    );
  };
  filtro.addEventListener('input', desenharLista);
  mandar({ t: 'historico', account: contaId }, (erro, r) => {
    if (erro) return lista.replaceChildren(el('p', { class: 'erro', text: erro }));
    itens = r.itens || [];
    desenharLista();
  });
  d.showModal();
  filtro.focus();
}

// ------------------------------------------------------------ busca rapida (Ctrl+K)
function abrirBusca() {
  if (document.querySelector('dialog.busca-dialogo[open]')) return;
  const campo = el('input', { type: 'search', placeholder: 'Buscar sessões, contas e comandos', 'aria-label': 'Buscar', autocomplete: 'off' });
  const lista = el('ul', { class: 'busca-lista', role: 'listbox' });
  const d = el(
    'dialog',
    { class: 'busca-dialogo' },
    el('div', { class: 'busca-campo' }, icone('magnifying-glass', 20), campo),
    lista,
    el('div', { class: 'busca-pe' }, el('span', null, el('kbd', { class: 'atalho', text: '↑↓' }), 'escolher'), el('span', null, el('kbd', { class: 'atalho', text: 'Enter' }), 'abrir'), el('span', null, el('kbd', { class: 'atalho', text: `${CTRL} Enter` }), 'abrir ao lado'), el('span', null, el('kbd', { class: 'atalho', text: 'Esc' }), 'fechar')),
  );
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (ev) => ev.target === d && d.close());
  document.body.append(d);
  let opcoes = [];
  let sel = 0;
  function itens() {
    const r = [];
    for (const p of todosOsPedidos()) {
      const s = S.sessoes.find((x) => x.perms.some((y) => y.id === p.id) || p.id.includes(x.id));
      if (s) r.push({ grupo: 'Precisa de você', icone: 'bell', titulo: nomeDaSessao(s), apoio: `${contaDe(s).nome} · ${oQueFaz(s)}`, acao: (lado) => area.abrir(s.id, { aoLado: lado }) });
    }
    for (const s of S.sessoes.filter((x) => x.status !== 'ended')) r.push({ grupo: 'Sessões', icone: 'chat-text', titulo: nomeDaSessao(s), apoio: `${contaDe(s).nome} · ${oQueFaz(s)}`, busca: s.cwd, acao: (lado) => area.abrir(s.id, { aoLado: lado }) });
    for (const s of S.sessoes.filter((x) => x.status !== 'ended' && x.hosted) ) if (S.desktop) r.push({ grupo: 'Terminais', icone: 'terminal-window', titulo: `Terminal de ${nomeDaSessao(s)}`, apoio: contaDe(s).nome, acao: (lado) => area.abrir(s.id, { modo: 'terminal', aoLado: lado }) });
    for (const c of S.contas) {
      r.push({ grupo: 'Contas', icone: 'plus', titulo: `Nova sessão em ${c.nome}`, apoio: agenteDaConta(c).nome, acao: () => abrirNova({ conta: c.id }) });
      r.push({ grupo: 'Contas', icone: 'chats', titulo: `Conversas de ${c.nome}`, apoio: 'Histórico para ler ou continuar', acao: () => abrirHistorico(c.id) });
    }
    r.push({ grupo: 'Comandos', icone: 'plus', titulo: 'Nova sessão', apoio: `${CTRL}+N`, acao: () => abrirNova() });
    r.push({ grupo: 'Comandos', icone: 'bell', titulo: 'Precisa de você', apoio: `${CTRL}+J`, acao: () => fila.alternar(true) });
    r.push({ grupo: 'Comandos', icone: 'squares-four', titulo: 'Visão geral', acao: () => vista.mostrar('visao') });
    for (const [l, t, ic] of LAYOUTS) r.push({ grupo: 'Comandos', icone: ic, titulo: `Layout: ${t}`, acao: () => (area.layout(l), vista.mostrar('paineis')) });
    if (S.desktop) r.push({ grupo: 'Comandos', icone: 'qr-code', titulo: 'Conectar um celular', acao: () => vista.mostrar('celulares') });
    r.push({ grupo: 'Comandos', icone: 'gear-six', titulo: 'Opções', acao: () => vista.mostrar('opcoes') });
    return r;
  }
  const todos = itens();
  function filtrar() {
    const q = campo.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    opcoes = todos.filter((o) => !q || q.split(/\s+/).every((p) => norm(`${o.titulo} ${o.apoio} ${o.busca || ''} ${o.grupo}`).includes(p))).slice(0, 60);
    sel = Math.min(sel, Math.max(0, opcoes.length - 1));
    const filhos = [];
    let grupo = '';
    opcoes.forEach((o, i) => {
      if (o.grupo !== grupo) filhos.push(el('li', { class: 'grupo-b', role: 'presentation', text: (grupo = o.grupo) }));
      filhos.push(el('li', { role: 'option', 'aria-selected': String(i === sel), onclick: (ev) => escolher(i, ev.ctrlKey || ev.metaKey), onmousemove: () => sel !== i && ((sel = i), marcar()) }, icone(o.icone, 18), el('span', { class: 't' }, el('b', { text: o.titulo }), o.apoio ? el('span', { text: o.apoio }) : null)));
    });
    if (!opcoes.length) filhos.push(el('li', { class: 'grupo-b', text: 'Nada encontrado.' }));
    lista.replaceChildren(...filhos);
  }
  function marcar() {
    [...lista.querySelectorAll('[role=option]')].forEach((li, i) => li.setAttribute('aria-selected', String(i === sel)));
    lista.querySelectorAll('[role=option]')[sel]?.scrollIntoView({ block: 'nearest' });
  }
  function escolher(i, lado) {
    const o = opcoes[i];
    if (!o) return;
    d.close();
    o.acao(lado);
  }
  campo.addEventListener('input', () => ((sel = 0), filtrar()));
  campo.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + opcoes.length) % Math.max(1, opcoes.length);
      marcar();
      ev.preventDefault();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      escolher(sel, ev.ctrlKey || ev.metaKey);
    }
  });
  filtrar();
  d.showModal();
  campo.focus();
}

// ------------------------------------------------------------ pareamento de celulares
function qrSvg(linhas) {
  const n = linhas.length;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `-2 -2 ${n + 4} ${n + 4}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Código QR de pareamento');
  svg.setAttribute('shape-rendering', 'crispEdges');
  let d = '';
  linhas.forEach((l, y) => [...l].forEach((c, x) => c === '1' && (d += `M${x} ${y}h1v1h-1z`)));
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', '#1a120e');
  svg.append(p);
  return svg;
}
// Um celular pediu para entrar: a janela pede os 4 numeros que so aparecem nele.
let dialogoPar = null;
function verificarPareamento() {
  const pedidos = S.desktop?.pedidos || [];
  if (!pedidos.length) {
    dialogoPar?.d.close();
    dialogoPar = null;
    return;
  }
  if (dialogoPar) return;
  const p = pedidos[0];
  const dl = dialogo('Um aparelho quer se conectar', `${p.nome} pediu para entrar no duckV. Para liberar, digite os 4 números que aparecem na tela dele.`);
  dialogoPar = dl;
  const caixas = Array.from({ length: 4 }, (_, i) => el('input', { type: 'text', inputMode: 'numeric', maxLength: 1, autocomplete: 'off', 'aria-label': `Número ${i + 1}` }));
  const erro = el('p', { class: 'erro', role: 'alert', hidden: true });
  dl.corpo.append(el('div', { class: 'par-numeros' }, caixas), erro, el('p', { class: 'p-nota', text: 'Se não foi você, recuse. Três números errados derrubam o pedido.' }));
  const liberar = el('button', { class: 'botao principal', type: 'submit', text: 'Liberar' });
  dl.pe.append(el('button', { class: 'botao perigo', type: 'button', onclick: () => mandar({ t: 'parearRecusar' }, () => (avisar('Pedido recusado'), dl.d.close())) }, el('span', { text: 'Não fui eu, recusar' })), el('span', { class: 'espaco' }), liberar);
  caixas.forEach((c, i) => {
    c.addEventListener('input', () => {
      c.value = c.value.replace(/\D/g, '').slice(-1);
      if (c.value && caixas[i + 1]) caixas[i + 1].focus();
      if (caixas.every((x) => x.value)) dl.form.requestSubmit();
    });
    c.addEventListener('keydown', (ev) => ev.key === 'Backspace' && !c.value && caixas[i - 1]?.focus());
    c.addEventListener('paste', (ev) => {
      const t = (ev.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
      if (t.length === 4) {
        ev.preventDefault();
        t.split('').forEach((d, k) => (caixas[k].value = d));
        dl.form.requestSubmit();
      }
    });
  });
  dl.form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const numeros = caixas.map((c) => c.value).join('');
    if (numeros.length !== 4) return caixas.find((c) => !c.value)?.focus();
    liberar.disabled = true;
    mandar({ t: 'parear', numeros }, (e, r) => {
      liberar.disabled = false;
      if (e) {
        erro.textContent = e;
        erro.hidden = false;
        caixas.forEach((c) => (c.value = ''));
        caixas[0].focus();
        return;
      }
      avisar(r.msg || 'Aparelho conectado');
      dl.d.close();
    });
  });
  dl.d.addEventListener('close', () => {
    if (dialogoPar === dl) dialogoPar = null;
  });
  dl.d.showModal();
  caixas[0].focus();
  notificar('Um aparelho quer se conectar', `${p.nome}: digite os 4 números na janela do duckV.`);
}

function criarCelulares() {
  const raiz = el('div', { class: 'pagina' });
  let marca = '';
  function atualizar() {
    const dk = S.desktop;
    const nova = JSON.stringify([dk?.link, dk?.aparelhos, !!dk]);
    if (nova === marca) return;
    marca = nova;
    if (!dk) {
      raiz.replaceChildren(el('div', { class: 'pagina-largura' }, el('h2', { class: 'titulo-pagina', text: 'Celulares' }), el('p', { class: 'sub', text: 'Conectar celulares só pelo app do duckV no computador.' })));
      return;
    }
    const lista = el(
      'ul',
      { class: 'aparelhos' },
      dk.aparelhos.length
        ? dk.aparelhos.map((a) =>
            el(
              'li',
              null,
              icone('device-mobile', 22),
              el('span', { class: 't' }, el('b', { text: a.nome }), el('span', { text: `Conectado em ${fData.format(a.criado)}` })),
              duasVezes(el('button', { class: 'botao perigo pequeno', type: 'button' }, el('span', { text: 'Desconectar' })), 'Desconectar', () => mandar({ t: 'aparelhoTirar', id: a.id }, (e) => avisar(e || `${a.nome} desconectado`))),
            ),
          )
        : el('li', { class: 'p-nota', text: 'Nenhum celular conectado ainda.' }),
    );
    raiz.replaceChildren(
      el(
        'div',
        { class: 'pagina-largura' },
        el('div', null, el('h2', { class: 'titulo-pagina', text: 'Celulares' }), el('p', { class: 'sub', text: 'Acompanhe e comande as mesmas sessões pelo app duckV no Android.' })),
        el(
          'section',
          { class: 'bloco' },
          el('h3', { text: 'Conectar um celular' }),
          el(
            'div',
            { class: 'par-grade' },
            el('div', { class: 'qr-caixa' }, qrSvg(dk.qr)),
            el(
              'div',
              { class: 'campo' },
              el(
                'ol',
                { class: 'passos' },
                el('li', null, 'Abra o app ', el('b', { text: 'duckV' }), ' no celular e toque em ', el('b', { text: 'Conectar' }), '.'),
                el('li', null, 'Aponte a câmera para o código ao lado.'),
                el('li', null, 'O celular mostra ', el('b', { text: '4 números' }), ': esta janela vai pedir que você os digite.'),
              ),
              dk.tailnet ? el('p', { class: 'ajuda', text: `Pelo Tailscale (${dk.tailnet}), o celular conecta de qualquer lugar.` }) : el('p', { class: 'ajuda', text: 'Sem o Tailscale, o celular só conecta pela rede deste computador. Instale o Tailscale no computador e no celular para usar de qualquer lugar.' }),
              el('p', { class: 'ajuda', text: 'O código muda depois de cada celular conectado. Não compartilhe a imagem.' }),
              el('div', { class: 'chips' }, el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => mandar({ t: 'parearNovoCodigo' }, (e) => avisar(e || 'Código novo gerado')) }, icone('arrows-clockwise', 16), 'Gerar outro código')),
            ),
          ),
        ),
        el('section', { class: 'bloco' }, el('h3', { text: 'Celulares conectados' }), el('p', { class: 'ajuda', text: 'Cada celular tem a própria chave. Desconectar apaga a chave daquele aparelho na hora.' }), lista),
      ),
    );
  }
  return { raiz, atualizar };
}

// ------------------------------------------------------------ opcoes
const CORES = [
  ['#ff7a1a', 'Clássico'], ['#f2a900', 'De borracha'], ['#2b8a6e', 'Marreco'], ['#f26b4e', 'Pêssego'],
  ['#b5651d', 'Chocolate'], ['#3d8bfd', 'Do mar'], ['#7e57c2', 'Noturno'], ['#e0569a', 'Rosa'],
  ['#ffb22e', 'Âmbar'], ['#c4420a', 'Queimado'],
];
function criarOpcoes() {
  const raiz = el('div', { class: 'pagina' });
  let marcaContas = '';
  const caixaContas = el('section', { class: 'bloco', id: 'opcoes-contas' });
  const salvar = (msg, ok = 'Salvo') => mandar({ t: 'prefs', ...msg }, (erro) => avisar(erro || ok));
  const linhaSwitch = (titulo, apoio, marcado, aoMudar) => {
    const c = el('input', { type: 'checkbox', class: 'interruptor', checked: !!marcado, onchange: () => aoMudar(c.checked), 'aria-label': titulo });
    return el('label', { class: 'linha-opcao' }, el('span', { class: 't' }, el('b', { text: titulo }), apoio ? el('span', { text: apoio }) : null), c);
  };
  const chipsUnicos = (rotulo, opcoes, atual, aoEscolher) => {
    const caixa = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': rotulo });
    const pintarSel = (v) => [...caixa.children].forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(v))));
    for (const [v, t] of opcoes) caixa.append(el('button', { class: 'chip', type: 'button', role: 'radio', 'data-v': String(v), text: t, onclick: () => (pintarSel(v), aoEscolher(v)) }));
    pintarSel(atual);
    return el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: rotulo }), caixa);
  };

  function blocoConta(c) {
    const ag = agenteDaConta(c);
    const p = c.padroes || {};
    const nome = el('input', { type: 'text', value: c.nome, maxLength: 30, 'aria-label': `Nome de ${c.nome}` });
    nome.addEventListener('change', () => salvar({ op: 'conta', id: c.id, nome: nome.value }));
    const cores = el('div', { class: 'amostras', role: 'radiogroup', 'aria-label': 'Cor da conta' });
    for (const [hex, rotulo] of CORES) {
      const b = el('button', { type: 'button', role: 'radio', class: 'amostra', title: rotulo, 'aria-label': rotulo, 'aria-checked': String(hex === c.cor.toLowerCase()), onclick: () => ([...cores.children].forEach((o) => o.setAttribute('aria-checked', String(o === b))), salvar({ op: 'conta', id: c.id, cor: hex })) });
      b.style.setProperty('--cor', hex);
      cores.append(b);
    }
    const sel = (rotulo, opcoes, atual, chave) => {
      const s = el('select', { 'aria-label': rotulo, onchange: () => salvar({ op: 'conta', id: c.id, padroes: { [chave]: s.value || null } }) }, opcoes.map(([v, t]) => el('option', { value: v, text: t, selected: String(v) === String(atual ?? '') })));
      return el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: rotulo }), s);
    };
    const pastaPadrao = el('input', { type: 'text', value: p.cwd || '', spellcheck: false, placeholder: S.host.home || '', 'aria-label': 'Pasta padrão' });
    pastaPadrao.addEventListener('change', () => salvar({ op: 'conta', id: c.id, padroes: { cwd: pastaPadrao.value } }));
    const entrar = el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => entrarNaConta(c) }, icone('sign-in', 16), c.email ? 'Entrar de novo' : 'Entrar nesta conta');
    const remover = duasVezes(el('button', { class: 'botao perigo pequeno', type: 'button' }, icone('trash', 16), el('span', { text: 'Remover conta' })), 'Remover conta', () => mandar({ t: 'conta', op: 'remover', id: c.id }, (e) => avisar(e || 'Conta removida')));
    const pato = miniPato('parado', c.cor);
    return el(
      'div',
      { class: 'conta-edicao' },
      el('div', { class: 'cab' }, pato, el('span', { class: 't' }, el('b', null, c.nome, chipAgente(c)), el('span', { text: [c.email || 'Sem login', c.plano].filter(Boolean).join(' · ') })), entrar),
      el('div', { class: 'lado-a-lado' }, el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Nome' }), nome), el('div', { class: 'campo', style: 'grid-column: span 2' }, el('span', { class: 'rotulo', text: 'Cor' }), cores)),
      el('div', { class: 'lado-a-lado' }, sel('Modelo ao abrir', ag.modelos.map((m) => [m.id, m.rotulo]), p.model || 'default', 'model'), sel('Esforço', [['', 'Padrão'], ...ag.esforcos.map((e) => [e.id, e.rotulo])], p.effort || '', 'effort'), sel('Permissões', ag.modos.map((m) => [m.id, m.rotulo]), p.mode || ag.modos[0]?.id, 'mode')),
      el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Pasta padrão' }), pastaPadrao),
      el('div', { class: 'chips' }, remover),
    );
  }
  function desenharContas() {
    const nova = JSON.stringify(S.contas.map((c) => [c.id, c.nome, c.cor, c.email, c.padroes, c.agente, c.instalado]));
    if (nova === marcaContas) return;
    if (caixaContas.contains(document.activeElement) && marcaContas) return;
    marcaContas = nova;
    const nomeNova = el('input', { type: 'text', maxLength: 30, placeholder: 'Nome da conta nova', 'aria-label': 'Nome da conta nova' });
    const agNova = el('select', { 'aria-label': 'Agente da conta nova' }, (S.host.agentes || []).map((a) => el('option', { value: a.id, text: a.nome })));
    const add = el('form', { class: 'form-linha', noValidate: true }, nomeNova, agNova, el('button', { class: 'botao', type: 'submit' }, icone('user-plus', 18), 'Adicionar'));
    add.addEventListener('submit', (ev) => {
      ev.preventDefault();
      mandar({ t: 'conta', op: 'nova', nome: nomeNova.value.trim(), agente: agNova.value }, (e) => {
        if (e) return avisar(e);
        avisar('Conta criada. Agora entre nela.');
        nomeNova.value = '';
      });
    });
    caixaContas.replaceChildren(el('h3', { text: 'Contas' }), el('p', { class: 'ajuda', text: 'Nome, cor e como cada conta começa uma sessão aberta pelo duckV.' }), ...S.contas.map(blocoConta), el('div', { class: 'conta-edicao' }, el('span', { class: 'rotulo', text: 'Adicionar conta' }), add));
  }
  let montado = false;
  function montar() {
    montado = true;
    const a = S.prefs.avisos || {};
    let rapidas = [...(S.prefs.rapidas || [])];
    const caixaRapidas = el('ul', { class: 'lista-rapidas' });
    const desenharRapidas = () => {
      caixaRapidas.replaceChildren(
        ...rapidas.map((t, i) => el('li', null, el('span', { text: t }), el('button', { class: 'so-icone', type: 'button', 'aria-label': `Remover: ${t}`, onclick: () => ((rapidas = rapidas.filter((_, n) => n !== i)), desenharRapidas(), salvar({ op: 'rapidas', lista: rapidas })) }, icone('trash', 18)))),
      );
      if (!rapidas.length) caixaRapidas.append(el('li', { class: 'p-nota', text: 'Nenhuma mensagem rápida.' }));
    };
    desenharRapidas();
    const nova = el('input', { type: 'text', maxLength: 200, placeholder: 'Rode o lint e corrija o que aparecer.', 'aria-label': 'Nova mensagem rápida' });
    const formR = el('form', { class: 'form-linha', noValidate: true }, nova, el('button', { class: 'botao', type: 'submit' }, icone('plus', 18), 'Adicionar'));
    formR.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = nova.value.trim();
      if (!t) return nova.focus();
      if (rapidas.length >= 12) return avisar('O limite é de 12 mensagens rápidas.');
      rapidas = [...rapidas, t];
      nova.value = '';
      desenharRapidas();
      salvar({ op: 'rapidas', lista: rapidas });
    });
    const permissaoAvisos = 'Notification' in window ? Notification.permission : 'denied';
    raiz.replaceChildren(
      el(
        'div',
        { class: 'pagina-largura' },
        el('div', null, el('h2', { class: 'titulo-pagina', text: 'Opções' }), el('p', { class: 'sub', text: 'Aparência desta janela, contas, avisos e mensagens rápidas.' })),
        el(
          'section',
          { class: 'bloco' },
          el('h3', { text: 'Aparência' }),
          chipsUnicos('Tema', [['sistema', 'Igual ao sistema'], ['claro', 'Claro'], ['escuro', 'Escuro']], LOCAL.tema, (v) => guardarLocal('tema', v)),
          chipsUnicos('Pato', [['animado', 'Animado, com gracinhas'], ['calmo', 'Sem gracinhas'], ['parado', 'Parado']], LOCAL.pato, (v) => guardarLocal('pato', v)),
          linhaSwitch('Mostrar as ferramentas na conversa', 'As linhas com cada ferramenta que o agente usa.', LOCAL.ferramentas, (v) => (guardarLocal('ferramentas', v), area.paineis().forEach((p) => p.iniciar()))),
        ),
        caixaContas,
        el(
          'section',
          { class: 'bloco' },
          el('h3', { text: 'Avisos' }),
          linhaSwitch('Avisos nesta janela', permissaoAvisos === 'denied' ? 'O sistema bloqueou os avisos desta janela.' : 'Quando a janela não está em foco: pedidos, perguntas e fim de tarefa.', LOCAL.avisos && permissaoAvisos !== 'denied', async (v) => {
            if (v && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
            guardarLocal('avisos', v);
          }),
          el('p', { class: 'ajuda', text: 'Nos celulares conectados:' }),
          linhaSwitch('Quando uma conta pedir permissão', null, a.perm, (v) => salvar({ op: 'avisos', perm: v })),
          linhaSwitch('Quando uma sessão terminar a vez', null, a.fim, (v) => salvar({ op: 'avisos', fim: v })),
          linhaSwitch('Quando um limite reiniciar', null, a.reset, (v) => salvar({ op: 'avisos', reset: v })),
        ),
        el('section', { class: 'bloco' }, el('h3', { text: 'Mensagens rápidas' }), el('p', { class: 'ajuda', text: 'Botões acima da caixa de mensagem de cada sessão, aqui e no celular.' }), caixaRapidas, formR),
        el(
          'section',
          { class: 'bloco' },
          el('h3', { text: 'Pelo terminal' }),
          el('p', { class: 'ajuda', text: 'Prefere o terminal? Tudo continua funcionando por ele: o atalho de cada conta (conta1, conta2...) abre o agente numa janela de terminal ligada ao duckV, e o “iniciar-duckv” liga o duckV sem esta janela. Em Nova sessão, escolha “Terminal do sistema”.' }),
        ),
      ),
    );
    desenharContas();
  }
  function atualizar() {
    if (!S.pronto) return;
    if (!montado) montar();
    else desenharContas();
  }
  return { raiz, atualizar, irPara: (secao) => secao === 'contas' && setTimeout(() => caixaContas.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) };
}

// Entrar numa conta: no Claude Code, a pagina da Anthropic e o codigo que ela mostra; nos outros agentes,
// o proprio login do agente no terminal de verdade.
function entrarNaConta(c) {
  mandar({ t: 'login', account: c.id, cols: 100, rows: 30 }, (erro, r) => {
    if (erro) return avisar(erro);
    if (r.instance) return area.abrir(r.instance, { modo: S.desktop ? 'terminal' : 'conversa' });
    const { d, corpo, pe, form } = dialogo(`Entrar em ${c.nome}`, 'A página de entrada abriu no navegador. Entre na conta e copie o código que ela mostra no fim.');
    const codigo = el('input', { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'Cole o código aqui', 'aria-label': 'Código da página de entrada' });
    const erroC = el('p', { class: 'erro', role: 'alert', hidden: true });
    corpo.append(el('p', null, el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: 'Abrir a página de entrada de novo' })), codigo, erroC);
    const ok = el('button', { class: 'botao principal', type: 'submit', text: 'Entrar' });
    pe.append(el('button', { class: 'botao texto', type: 'button', text: 'Cancelar', onclick: () => d.close() }), ok);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      ok.disabled = true;
      mandar({ t: 'loginCodigo', account: c.id, codigo: codigo.value.trim() }, (e, rr) => {
        ok.disabled = false;
        if (e) return Object.assign(erroC, { hidden: false, textContent: e });
        avisar(`Pronto: ${rr.email || c.nome}`);
        d.close();
      });
    });
    window.open(r.url, '_blank', 'noopener');
    d.showModal();
    codigo.focus();
  });
}

// ------------------------------------------------------------ vistas da area principal
const vista = (() => {
  const titulo = el('span');
  const apoio = el('span', { class: 'apoio' });
  const abrirLateral = el('button', { class: 'so-icone so-estreita', type: 'button', 'aria-label': 'Mostrar contas', onclick: alternarLateral }, icone('sidebar-simple', 20));
  const layouts = el(
    'div',
    { class: 'layouts', role: 'group', 'aria-label': 'Layout dos painéis' },
    LAYOUTS.map(([l, t, ic], i) => el('button', { class: 'so-icone', type: 'button', 'aria-label': t, title: `${t} (${CTRL}+${i + 1})`, 'data-l': l, onclick: () => area.layout(l) }, icone(ic, 18))),
  );
  const fila = el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => window.fila.alternar() }, icone('bell', 16), el('span'));
  const topo = el('header', { class: 'area-topo' }, abrirLateral, el('h1', null, titulo, apoio), layouts, fila);
  const corpo = el('div', { class: 'area-corpo' });
  const raiz = el('main', { class: 'area' }, topo, corpo);
  const vazio = el(
    'div',
    { class: 'visao' },
    el(
      'div',
      { class: 'inteira', style: 'position:absolute' },
      el('div', null, miniPato('parado'), el('h1', { text: 'Nenhum painel aberto' }), el('p', { text: 'Clique numa sessão na barra lateral para abrir aqui. Com Ctrl, ela abre ao lado; também dá para arrastar uma sessão até um painel.' }), el('button', { class: 'botao principal', type: 'button', onclick: () => abrirNova() }, icone('plus', 18), 'Nova sessão')),
    ),
  );
  const telas = { visao: criarVisao(), opcoes: criarOpcoes(), celulares: criarCelulares() };
  const obj = {
    atual: LOCAL.paineis?.length ? 'paineis' : 'visao',
    raiz,
    mostrar(nome, secao) {
      obj.atual = nome;
      if (nome === 'paineis') corpo.replaceChildren(area.paineis().length ? area.grade : vazio);
      else corpo.replaceChildren(telas[nome].raiz);
      telas[nome]?.irPara?.(secao);
      if (matchMedia('(max-width: 860px)').matches) document.getElementById('app').dataset.lateral = 'fechada';
      desenhar();
    },
    atualizar() {
      if (obj.atual === 'paineis' && corpo.firstChild !== (area.paineis().length ? area.grade : vazio)) corpo.replaceChildren(area.paineis().length ? area.grade : vazio);
      const nomes = { paineis: 'Painéis', visao: 'Visão geral', opcoes: 'Opções', celulares: 'Celulares' };
      titulo.textContent = nomes[obj.atual];
      apoio.textContent = obj.atual === 'paineis' ? plural(area.paineis().length, 'sessão', 'sessões') : '';
      layouts.hidden = obj.atual !== 'paineis';
      for (const b of layouts.children) b.setAttribute('aria-pressed', String(b.dataset.l === LOCAL.layout));
      const n = todosOsPedidos().length;
      fila.hidden = !n;
      fila.lastChild.textContent = `${plural(n, 'pedido', 'pedidos')} esperando`;
      telas[obj.atual]?.atualizar();
    },
  };
  return obj;
})();
window.fila = fila;

// ------------------------------------------------------------ teclado
document.addEventListener('keydown', (ev) => {
  const mod = ev.ctrlKey || ev.metaKey;
  if (!mod || ev.altKey) return;
  // No terminal, os atalhos do duckV pedem Shift (Ctrl+Shift+K); sem ele, a tecla e do agente.
  if (ev.target.closest?.('.xterm') && !ev.shiftKey) return;
  const k = ev.key.toLowerCase();
  if (document.querySelector('dialog[open]') && k !== 'k') return;
  if (k === 'k') abrirBusca();
  else if (k === 'n') abrirNova();
  else if (k === 'j') fila.alternar();
  else if (k === 'b') alternarLateral();
  else if (k === 'w' && vista.atual === 'paineis' && area.focado()) area.fechar(area.focado().raiz);
  else if (k === 'tab') area.proximo(ev.shiftKey ? -1 : 1);
  else if (/^[1-5]$/.test(k)) {
    area.layout(LAYOUTS[Number(k) - 1][0]);
    vista.mostrar('paineis');
  } else if (k === ',') vista.mostrar('opcoes');
  else return;
  ev.preventDefault();
});

// ------------------------------------------------------------ desenho geral
const app = document.getElementById('app');
let telaInteira = null;
function mostrarInteira(titulo, texto, extra) {
  if (!telaInteira) {
    telaInteira = el('div', { class: 'inteira' });
    document.body.append(telaInteira);
  }
  telaInteira.replaceChildren(el('div', null, miniPato('dorme'), el('h1', { text: titulo }), el('p', { text: texto }), extra));
}
let montado = false;
function desenhar() {
  if (!S.pareado) {
    mostrarInteira('Esta janela não está conectada', 'Abra o duckV pelo app do computador. Se ele já está aberto num terminal, feche aquela janela e abra o app, ou continue pelo terminal.');
    return;
  }
  if (telaInteira && S.pronto) {
    telaInteira.remove();
    telaInteira = null;
  }
  if (!S.pronto) {
    mostrarInteira(S.ligado === false ? 'Sem conexão com o duckV' : 'Conectando', S.ligado === false ? 'Esperando o servidor do duckV responder neste computador. A janela continua tentando.' : 'Buscando as contas e as sessões.');
    return;
  }
  if (!montado) {
    montado = true;
    app.dataset.lateral = matchMedia('(max-width: 860px)').matches ? 'fechada' : LOCAL.lateral;
    app.replaceChildren(lateral.raiz, vista.raiz, status.raiz);
    document.body.append(fila.raiz);
    area.restaurar();
    vista.mostrar(area.paineis().length ? 'paineis' : 'visao');
    if (LOCAL.avisos && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    return;
  }
  lateral.atualizar();
  vista.atualizar();
  area.atualizar();
  fila.atualizar();
  status.atualizar();
  verificarPareamento();
  contarParaOApp();
  document.title = todosOsPedidos().length ? `(${todosOsPedidos().length}) duckV` : 'duckV';
}
setInterval(() => S.pronto && desenhar(), 20000); // contagens regressivas em dia
window.addEventListener('focus', () => S.pronto && desenhar());

desenhar();
ligar();
