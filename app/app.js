'use strict';
// duckV: app do celular. Mostra as contas, o uso, as sessoes e os pedidos de
// permissao, e comanda as sessoes abertas por aqui.
/* global icone */

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
      else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'for') node.setAttribute(k, v);
      else node[k] = v;
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

// ------------------------------------------------------------ controles proprios
// Nada de controle do navegador: no iPhone e no Android, o menu suspenso abre como uma folha que sobe
// do pe da tela (com alvos grandes para o dedo), e a caixa de marcar e desenhada no estilo do app.
let seqControle = 0;
// Uso: const s = folhaSeletor({ id, rotulo, opcoes: [{ v, t, apoio }] | [[v, t]], valor, aoMudar });
//      s.value, s.disabled e s.definirOpcoes(lista) funcionam como num <select>; s dispara 'change'.
function folhaSeletor({ id, rotulo, opcoes = [], valor, aoMudar } = {}) {
  let lista = [];
  let atual = valor == null ? '' : String(valor);
  let desligado = false;
  const texto = el('span', { class: 'seletor-texto' });
  const campo = el('button', { class: 'seletor-campo', type: 'button', id, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': rotulo || null }, texto, icone('caret-down', 20));
  const raiz = el('div', { class: 'seletor' }, campo);
  const indice = (v) => lista.findIndex((o) => o.v === v);
  const pintar = () => (texto.textContent = lista[indice(atual)]?.t || '');
  function abrir() {
    if (desligado || !lista.length) return;
    const titulo = rotulo || document.querySelector(`label[for='${id}']`)?.textContent || 'Escolha';
    const opcoesEl = lista.map((o) =>
      el(
        'button',
        { class: 'folha-opcao', type: 'button', role: 'radio', 'aria-checked': String(o.v === atual), onclick: () => escolher(o.v) },
        el('span', { class: 'folha-marca', 'aria-hidden': 'true' }, o.v === atual ? icone('check', 20) : null),
        el('span', { class: 't' }, el('b', { text: o.t }), o.apoio ? el('span', { text: o.apoio }) : null),
      ),
    );
    const d = el('dialog', { class: 'folha', 'aria-label': titulo }, el('div', { class: 'folha-alca', 'aria-hidden': 'true' }), el('h2', { text: titulo }), el('div', { class: 'folha-lista', role: 'radiogroup', 'aria-label': titulo }, opcoesEl));
    d.addEventListener('click', (ev) => ev.target === d && d.close());
    d.addEventListener('close', () => {
      campo.setAttribute('aria-expanded', 'false');
      campo.focus({ preventScroll: true });
      setTimeout(() => d.remove(), 260);
    });
    d.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      const i = opcoesEl.indexOf(document.activeElement);
      opcoesEl[(i + (ev.key === 'ArrowDown' ? 1 : -1) + opcoesEl.length) % opcoesEl.length]?.focus();
      ev.preventDefault();
    });
    function escolher(v) {
      d.close();
      if (v === atual) return;
      atual = v;
      pintar();
      aoMudar?.(v);
      raiz.dispatchEvent(new Event('change'));
    }
    document.body.append(d);
    campo.setAttribute('aria-expanded', 'true');
    d.showModal();
    (opcoesEl[indice(atual)] || opcoesEl[0]).focus();
  }
  campo.addEventListener('click', abrir);
  raiz.definirOpcoes = (novas) => {
    lista = novas.map((o) => (Array.isArray(o) ? { v: String(o[0]), t: o[1] } : { ...o, v: String(o.v) }));
    if (indice(atual) < 0) atual = lista[0]?.v ?? '';
    pintar();
  };
  Object.defineProperties(raiz, {
    value: { get: () => atual, set: (v) => ((atual = indice(String(v ?? '')) >= 0 ? String(v ?? '') : atual), pintar()) },
    disabled: { get: () => desligado, set: (v) => ((desligado = !!v), (campo.disabled = desligado)) },
  });
  raiz.definirOpcoes(opcoes);
  return raiz;
}
// Caixa de marcar desenhada (quadrada, borda grossa, como os botoes do app).
function caixaMarcar(marcado, aoMudar, rotulo) {
  const b = el('button', { class: 'caixa-marcar', type: 'button', role: 'checkbox', 'aria-checked': String(!!marcado), 'aria-label': rotulo || null }, icone('check', 18));
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    aoMudar(v);
  });
  return b;
}
// Confirmacao propria, no lugar do confirm() do navegador.
function confirmarNoCelular({ titulo, texto, sim = 'Confirmar', perigo = false }) {
  return new Promise((resolver) => {
    let r = false;
    const ok = el('button', { class: `botao ${perigo ? 'perigo' : 'principal'}`, type: 'button', text: sim, onclick: () => ((r = true), d.close()) });
    const d = el('dialog', { class: 'folha', 'aria-label': titulo }, el('div', { class: 'folha-alca', 'aria-hidden': 'true' }), el('h2', { text: titulo }), texto ? el('p', { class: 'folha-texto', text: texto }) : null, el('div', { class: 'acoes' }, el('button', { class: 'botao', type: 'button', text: 'Cancelar', onclick: () => d.close() }), ok));
    d.addEventListener('click', (ev) => ev.target === d && d.close());
    d.addEventListener('close', () => (resolver(r), setTimeout(() => d.remove(), 260)));
    document.body.append(d);
    d.showModal();
    ok.focus();
  });
}

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

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

let avisoTimer = null;
function avisar(texto) {
  const a = document.getElementById('aviso');
  a.textContent = texto;
  a.classList.add('mostra');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => a.classList.remove('mostra'), 2800);
}

// Cor do texto que fica legivel em cima da cor de uma conta.
function luminancia(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function pintar(no, cor) {
  no.style.setProperty('--cor', cor);
  no.style.setProperty('--sobre', contraste('#1d1410', cor) >= contraste('#fff6ee', cor) ? '#1d1410' : '#fff6ee');
}

// ------------------------------------------------------------ opcoes deste celular
const LOCAL = { tema: 'sistema', texto: 'normal', pato: 'animado', ferramentas: true };
try {
  Object.assign(LOCAL, JSON.parse(localStorage.getItem('claudev-opcoes') || '{}'));
} catch {
  /* sem armazenamento: fica com o padrao */
}
function aplicarLocal() {
  const raiz = document.documentElement;
  raiz.dataset.tema = LOCAL.tema;
  raiz.dataset.texto = LOCAL.texto;
  raiz.dataset.pato = LOCAL.pato;
}
function guardarLocal(chave, valor) {
  LOCAL[chave] = valor;
  try {
    localStorage.setItem('claudev-opcoes', JSON.stringify(LOCAL));
  } catch {
    /* modo privado: vale so nesta visita */
  }
  aplicarLocal();
}
aplicarLocal();

// ------------------------------------------------------------ o bichinho
// Pato em pixels, desenhado para este app. Letras: O/B contorno e penas da
// cabeca, o/b contorno e penas do corpo, T/t rabo, w asa, k bico de cima,
// q bico de baixo, e olho, f e g os dois pes.
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
// grupo de cada letra: [parte que se move, classe de cor]
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
// De vez em quando o pato faz uma gracinha sozinho. Cada estado tem as suas.
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

// `truques` desligado: o pato fica parado no estado que receber, para os patinhos pequenos dos chips.
function bicho(truques = true) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '-1 -5.5 20 19');
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
  const partes = {};
  for (const nome of ['pes', 'rabo', 'tronco', 'cabeca']) partes[nome] = { g: no('g', nome, svg), cores: {} };
  const camada = (parte, classe) => (partes[parte].cores[classe] ||= no('g', classe, partes[parte].g));
  SPRITE.forEach((linha, y) =>
    [...linha].forEach((c, x) => {
      if (PARTES[c]) ponto(camada(...PARTES[c]), x, y);
    }),
  );
  for (const [classe, pontos] of Object.entries(EXTRAS)) {
    const g = no('g', classe, classe.startsWith('sinal') ? svg : partes.cabeca.g);
    for (const [x, y, w, h] of pontos) ponto(g, x, y, w, h);
  }

  const pista = el('div', { class: 'pista', 'data-estado': 'dorme' }, el('div', { class: 'trilho' }, el('div', { class: 'vira' }, el('div', { class: 'bicho' }, svg))));

  let sumiu = 0;
  function gracinha() {
    if (!pista.isConnected && ++sumiu > 3) return; // a tela foi trocada: para de agendar
    const opcoes = TRUQUES[pista.dataset.estado] || [];
    if (pista.isConnected && opcoes.length && !document.hidden && !semMovimento.matches && LOCAL.pato === 'animado') {
      sumiu = 0;
      const truque = opcoes[Math.floor(Math.random() * opcoes.length)];
      pista.dataset.truque = truque;
      setTimeout(() => {
        if (pista.dataset.truque === truque) delete pista.dataset.truque;
      }, DURACAO[truque]);
    }
    setTimeout(gracinha, 3500 + Math.random() * 6000);
  }
  if (truques) setTimeout(gracinha, 1500 + Math.random() * 4000);

  pista.definir = (estado) => {
    if (pista.dataset.estado === estado) return;
    pista.dataset.estado = estado;
    delete pista.dataset.truque;
  };
  return pista;
}

// Patinho pequeno e parado, com a cor da conta: serve de icone, como no chip "Todas as contas".
function miniPato(estado, cor) {
  const p = bicho(false);
  p.definir(estado);
  const caixa = el('span', { class: 'mini-pato' }, p);
  if (cor) caixa.style.setProperty('--cor', cor);
  return caixa;
}

// ------------------------------------------------------------ estado e ligacao
const S = {
  pronto: false,
  contas: [],
  sessoes: [],
  host: { available: false, models: [], efforts: [], modes: [], folders: [], home: '', sep: '/' },
  prefs: { avisos: { perm: true, fim: true, reset: true, limiar: 80 }, rapidas: [] },
  desvio: 0, // diferenca entre o relogio do celular e o do computador
  ligado: null,
  pareado: true,
  aberta: null,
  conversa: [],
  tela: null, // ultima tela do terminal recebida
};
const agora = () => Date.now() - S.desvio;

let ws = null;
let espera = 800;
let ref = 0;
const pendentes = new Map();

// Envia ao computador. Com `aoResponder`, chama de volta com (erro, resposta).
function mandar(obj, aoResponder) {
  if (!ws || ws.readyState !== 1) {
    if (aoResponder) aoResponder('Sem conexão com o computador.');
    return;
  }
  if (aoResponder) {
    obj.ref = ++ref;
    pendentes.set(obj.ref, aoResponder);
  }
  ws.send(JSON.stringify(obj));
}

function ligar() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(`${proto}${location.host}/ws`);
  ws.onopen = () => {
    espera = 800;
    S.ligado = true;
    mandar({ t: 'vis', visible: document.visibilityState === 'visible' });
    if (S.aberta) mandar({ t: 'open', instance: S.aberta });
    telaAtual?.religou?.();
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
      S.pronto = true;
      S.contas = m.accounts;
      S.sessoes = m.instances;
      S.host = m.host || S.host;
      S.demo = !!m.demo;
      if (m.prefs) S.prefs = m.prefs;
      S.desvio = Date.now() - m.now;
      desenhar();
    } else if (m.t === 'history' && m.instance === S.aberta) {
      S.conversa = m.items;
      telaAtual?.conversa?.(true);
    } else if (m.t === 'msgs' && m.instance === S.aberta) {
      S.conversa.push(...m.items);
      telaAtual?.conversa?.(false, m.items);
    } else if (m.t === 'screen' && m.instance === S.aberta) {
      S.tela = m;
      telaAtual?.terminal?.();
    } else if (m.t === 'ack' || m.t === 'err') {
      const f = pendentes.get(m.ref);
      pendentes.delete(m.ref);
      if (f) f(m.t === 'err' ? m.msg : null, m);
    }
  };
  ws.onclose = async () => {
    ws = null;
    S.ligado = false;
    for (const f of pendentes.values()) f('Sem conexão com o computador.');
    pendentes.clear();
    try {
      const r = await fetch('/api/state', { credentials: 'same-origin' });
      S.pareado = r.status !== 401;
    } catch {
      /* computador fora do ar: continua tentando */
    }
    desenhar();
    if (S.pareado) setTimeout(ligar, espera);
    espera = Math.min(espera * 1.7, 10000);
  };
  ws.onerror = () => {};
}

document.addEventListener('visibilitychange', () => {
  const visivel = document.visibilityState === 'visible';
  mandar({ t: 'vis', visible: visivel });
  if (visivel && !ws && S.pareado) ligar();
});

// ------------------------------------------------------------ regras de exibicao
const vivas = (contaId) => S.sessoes.filter((s) => s.account === contaId && s.status !== 'ended');
const precisa = (s) => s.status === 'waiting' || s.perms.length > 0;
const contaDe = (s) => S.contas.find((c) => c.id === s.account) || { id: s.account, nome: s.account, cor: '#ff7a1a' };

function estadoDaConta(conta) {
  const ss = vivas(conta.id);
  const cinco = conta.usage?.five_hour;
  const t = agora();
  if (ss.some(precisa)) return { bicho: 'pede', vida: 'ativa', texto: 'Precisa de você' };
  if (cinco && cinco.pct >= 100 && cinco.resetsAt) {
    return { bicho: 'cansado', vida: 'esgotada', texto: `Sem energia até ${fHora.format(cinco.resetsAt)}` };
  }
  const festa = conta.lastReset && t - conta.lastReset.at < 90000;
  const trabalhando = ss.filter((s) => s.status === 'working').length;
  if (trabalhando) {
    return { bicho: festa ? 'festa' : 'trabalha', vida: 'ativa', texto: `Trabalhando em ${plural(trabalhando, 'sessão', 'sessões')}` };
  }
  if (festa) return { bicho: 'festa', vida: 'ativa', texto: 'Limite reiniciado agora' };
  if (ss.some((s) => s.status === 'error')) return { bicho: 'parado', vida: 'ativa', texto: 'Uma sessão parou com erro' };
  if (ss.length) return { bicho: 'parado', vida: 'ativa', texto: 'Esperando sua mensagem' };
  return { bicho: 'dorme', vida: 'apagada', texto: 'Nenhuma sessão aberta' };
}

const nomeDaSessao = (s) => s.name || pasta(s.cwd) || 'Sessão';

function oQueFaz(s) {
  if (s.status === 'ended') return 'Encerrada';
  if (precisa(s)) return s.perms.length ? 'Pedindo permissão' : 'Pedindo permissão no computador';
  if (s.status === 'working') return s.activity || 'Trabalhando';
  if (s.status === 'error') return s.activity || 'Parou com erro';
  return s.lastText || 'Esperando sua mensagem';
}

const estadoDoPato = (s) => (s.status === 'ended' ? 'dorme' : precisa(s) ? 'pede' : s.status === 'working' ? 'trabalha' : 'parado');

// "Todas as contas": as contas que entram numa equipe sao as instaladas, com login e com limite sobrando.
const contasDaEquipe = () =>
  S.contas.filter((c) => c.instalado !== false && c.usage?.erro !== 'login' && !(c.usage?.five_hour?.pct >= 100) && !(c.usage?.seven_day?.pct >= 100));

// As equipes com alguma sessao viva (sessoes com o mesmo equipe.id), da mais nova para a mais antiga.
function equipesVivas() {
  const mapa = new Map();
  for (const s of S.sessoes) {
    if (!s.equipe?.id) continue;
    const g = mapa.get(s.equipe.id) || { id: s.equipe.id, sessoes: [] };
    g.sessoes.push(s);
    mapa.set(g.id, g);
  }
  for (const g of mapa.values()) g.sessoes.sort((a, b) => (a.equipe.ordem || 0) - (b.equipe.ordem || 0));
  return [...mapa.values()]
    .filter((g) => g.sessoes.some((s) => s.status !== 'ended'))
    .sort((a, b) => Math.max(...b.sessoes.map((s) => s.startedAt)) - Math.max(...a.sessoes.map((s) => s.startedAt)));
}

// O que o pato da equipe faz agora, em duas palavras: o estado fica sempre escrito embaixo dele.
const fazNaEquipe = (s) =>
  s.status === 'ended' ? 'Terminou' : precisa(s) ? 'Pede você' : s.status === 'working' ? s.activity || 'Trabalhando' : s.status === 'error' ? 'Parou com erro' : 'Esperando você';

// A equipe em uma frase: quantas pedem voce, quantas trabalham, quantas ja terminaram.
function resumoDaEquipe(ss) {
  const pedem = ss.filter((s) => s.status !== 'ended' && precisa(s)).length;
  const trabalham = ss.filter((s) => s.status !== 'ended' && !precisa(s) && s.status === 'working').length;
  if (pedem) return { texto: pedem === 1 ? '1 pede você' : `${pedem} pedem você`, como: 'pede' };
  if (trabalham) return { texto: `${trabalham} trabalhando`, como: 'trabalha' };
  if (ss.every((s) => s.status === 'ended')) return { texto: 'Todas terminaram', como: 'fim' };
  return { texto: 'Esperando sua mensagem', como: 'parado' };
}

function celulas(caixa, total, cheias, opts = {}) {
  if (caixa.childElementCount !== total) {
    caixa.replaceChildren(...Array.from({ length: total }, () => document.createElement('i')));
  }
  [...caixa.children].forEach((c, i) => {
    let cls = '';
    if (i < cheias) cls = opts.quenteDe != null && i >= opts.quenteDe ? 'on quente' : 'on';
    if (opts.agora === i) cls += ' agora';
    if (c.className !== cls) c.className = cls;
  });
}

const MODELOS = { default: 'Padrão da conta', best: 'O melhor disponível', fable: 'Fable', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', opusplan: 'Opus para planejar' };
const ESFORCOS = { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra alto', max: 'Máximo' };
const MODOS = {
  manual: ['Perguntar sempre', 'O Claude pede sua permissão antes de editar arquivos e rodar comandos.'],
  acceptEdits: ['Aceitar edições', 'Edita arquivos sem perguntar. Comandos ainda pedem permissão.'],
  plan: ['Planejar antes', 'Só lê e monta um plano. Não altera nada até você aprovar.'],
  auto: ['Automático', 'Um classificador avalia cada ação no seu lugar e só barra o que parecer arriscado.'],
};
const nomeDoModo = (m) => (MODOS[m === 'default' ? 'manual' : m] || [m || 'ainda não informado'])[0];

// ------------------------------------------------------------ pedido de permissao
function cartaoPedido(conta, sessao, perm) {
  const aceitar = el('button', { class: 'botao principal', type: 'button' }, icone('check', 18), 'Aceitar');
  const recusar = el('button', { class: 'botao', type: 'button' }, icone('x', 18), 'Recusar');
  const recado = el('textarea', { rows: 2, 'aria-label': 'Recado para o Claude', placeholder: 'Diga o que ele deve fazer no lugar' });
  const enviarRecado = el('button', { class: 'botao', type: 'button', text: 'Recusar com este recado' });
  const caixaRecado = el('div', { class: 'recado', hidden: true }, recado, enviarRecado);
  const abrirRecado = el('button', {
    class: 'ligacao-texto',
    type: 'button',
    'aria-expanded': 'false',
    text: 'Recusar e dizer o que fazer',
    onclick: () => {
      caixaRecado.hidden = !caixaRecado.hidden;
      abrirRecado.setAttribute('aria-expanded', String(!caixaRecado.hidden));
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
      } else avisar(behavior === 'allow' ? 'Aceito' : 'Recusado');
    });
  };
  aceitar.addEventListener('click', () => responder('allow'));
  recusar.addEventListener('click', () => responder('deny'));
  enviarRecado.addEventListener('click', () => {
    if (!recado.value.trim()) return recado.focus();
    responder('deny', recado.value.trim());
  });
  return el(
    'section',
    { class: 'pedido', 'data-id': perm.id, 'aria-label': 'Pedido de permissão' },
    el('h2', { text: `${conta.nome} pede permissão em ${nomeDaSessao(sessao)}` }),
    el('p', { class: 'oque' }, el('b', { text: perm.tool }), perm.desc ? ` ${perm.desc}` : ''),
    perm.preview ? el('pre', { text: perm.preview, tabIndex: 0 }) : null,
    el('div', { class: 'botoes' }, recusar, aceitar),
    abrirRecado,
    caixaRecado,
  );
}

// Pergunta que o Claude Code mostra no terminal de uma sessao aberta pelo
// celular (por exemplo, se voce confia na pasta): vira botoes.
function cartaoPergunta(conta, sessao, id) {
  const tecla = (k, ok) => mandar({ t: 'key', instance: sessao.id, key: k }, (erro) => erro && avisar(erro));
  return el(
    'section',
    { class: 'pedido', 'data-id': id, 'aria-label': 'Pergunta do Claude Code' },
    el('h2', { text: `O Claude Code pergunta em ${nomeDaSessao(sessao)}` }),
    // A tela inteira acima das opcoes: se for um pedido de permissao, o comando aparece completo.
    sessao.pergunta.contexto
      ? el('pre', { text: sessao.pergunta.contexto, tabIndex: 0 })
      : sessao.pergunta.titulo ? el('p', { class: 'oque', text: sessao.pergunta.titulo }) : null,
    el(
      'div',
      { class: 'respostas' },
      sessao.pergunta.opcoes.map((o) => {
        const b = el('button', { class: 'botao', type: 'button', onclick: o.confirmar ? null : () => tecla(o.tecla) }, el('span', { class: 'numero', text: o.tecla }), el('span', { text: o.rotulo }));
        // Permissao que vale para sempre pede um segundo toque.
        return o.confirmar ? duasVezes(b, o.rotulo, () => tecla(o.tecla)) : b;
      }),
    ),
    el(
      'div',
      { class: 'botoes' },
      el('button', { class: 'botao', type: 'button', onclick: () => tecla('esc') }, 'Cancelar'),
      el('button', { class: 'botao', type: 'button', onclick: () => (location.hash = `#/s/${encodeURIComponent(sessao.id)}/terminal`) }, 'Ver a tela'),
    ),
  );
}

function cartaoLocal(conta, sessao) {
  return el(
    'section',
    { class: 'pedido local', 'data-id': `local-${sessao.id}` },
    el('h2', { text: `${conta.nome} espera uma resposta ${sessao.hosted ? 'na tela da sessão' : 'no computador'}` }),
    el('p', {
      class: 'oque',
      text: sessao.hosted
        ? 'O pedido está na tela do terminal desta sessão. Abra Controles e toque em Ver a tela do terminal.'
        : sessao.localAsk?.tool
          ? `${sessao.localAsk.tool} ${sessao.localAsk.text || ''}`.trim()
          : 'Esse pedido não chegou ao celular. Responda na janela da sessão.',
    }),
  );
}

// Atualiza uma lista de pedidos sem recriar os cartoes que ja estao na tela.
function sincronizarPedidos(caixa, itens) {
  const querem = new Map(itens.map((i) => [i.id, i]));
  for (const no of [...caixa.children]) if (!querem.has(no.dataset.id)) no.remove();
  const tem = new Set([...caixa.children].map((n) => n.dataset.id));
  for (const [id, i] of querem) if (!tem.has(id)) caixa.append(i.criar());
}

function pedidosDe(sessoes) {
  const itens = [];
  for (const s of sessoes) {
    if (s.status === 'ended') continue;
    const conta = contaDe(s);
    for (const p of s.perms) itens.push({ id: p.id, criar: () => cartaoPedido(conta, s, p) });
    if (s.hosted && s.pergunta && !s.perms.length) {
      const id = `q:${s.id}:${s.pergunta.titulo}:${s.pergunta.opcoes.map((o) => o.rotulo).join('|')}`.slice(0, 300);
      itens.push({ id, criar: () => cartaoPergunta(conta, s, id) });
    } else if (!s.perms.length && s.status === 'waiting') itens.push({ id: `local-${s.id}`, criar: () => cartaoLocal(conta, s) });
  }
  return itens;
}

// ------------------------------------------------------------ cartao da equipe ("Todas as contas")
// As sessoes abertas juntas, uma por conta, dividindo a mesma tarefa, ficam num cartao so, acima das
// contas: o pato de cada conta anda na mesma pista, e embaixo dele vem o nome da conta e o que ele faz
// agora, sempre escrito. Trabalhando ele anda, pedindo pula com a exclamacao, parado respira e
// encerrado dorme. Tocar num pato abre a sessao dele.
function blocoEquipe() {
  const selo = el('span', { class: 'equipe-selo' }, el('i'), el('b'));
  // Uma linha so de apoio: quantos patos, a pasta e a tarefa, cortada com reticencias se nao couber.
  const tarefa = el('p', { class: 'equipe-tarefa' });
  const pista = el('div', { class: 'equipe-pista', role: 'list' });
  const raiz = el('section', { class: 'equipe' }, el('div', { class: 'equipe-cabeca' }, el('h2', { text: 'Equipe' }), selo), tarefa, pista);
  const colunas = new Map();

  // Uma coluna por pato: a pista dele, o nome da conta e o que ele faz agora.
  function coluna() {
    const p = bicho();
    const nome = el('b');
    const faz = el('span', { class: 'equipe-faz' });
    const botao = el(
      'button',
      { class: 'equipe-pato', type: 'button', role: 'listitem' },
      el('span', { class: 'equipe-trilha' }, p),
      el('span', { class: 'equipe-nome' }, el('i'), nome),
      faz,
    );
    let sessao = null;
    botao.addEventListener('click', () => sessao && (location.hash = `#/s/${encodeURIComponent(sessao.id)}`));
    return {
      raiz: botao,
      atualizar(s) {
        sessao = s;
        const c = contaDe(s);
        pintar(botao, c.cor);
        p.definir(estadoDoPato(s));
        nome.textContent = c.nome;
        faz.textContent = fazNaEquipe(s);
        faz.classList.toggle('pede', precisa(s) && s.status !== 'ended');
        botao.setAttribute('aria-label', `${c.nome}: ${fazNaEquipe(s)}. Abrir a sessão.`);
      },
    };
  }

  return {
    raiz,
    atualizar(g) {
      const onde = pasta(g.sessoes[0]?.cwd);
      tarefa.textContent = [plural(g.sessoes.length, 'pato', 'patos'), onde, g.sessoes[0] ? nomeDaSessao(g.sessoes[0]) : ''].filter(Boolean).join(' · ');
      tarefa.hidden = !tarefa.textContent;
      const r = resumoDaEquipe(g.sessoes);
      selo.lastChild.textContent = r.texto;
      selo.dataset.como = r.como;
      for (const s of g.sessoes) {
        let col = colunas.get(s.id);
        if (!col) {
          col = coluna();
          colunas.set(s.id, col);
        }
        if (col.raiz.parentElement !== pista) pista.append(col.raiz);
        col.atualizar(s);
      }
      for (const [id, col] of colunas) {
        if (g.sessoes.some((s) => s.id === id)) continue;
        col.raiz.remove();
        colunas.delete(id);
      }
    },
  };
}

// Mantem um cartao por equipe dentro da caixa, criando e tirando conforme elas abrem e fecham.
function sincronizarEquipes(caixa, blocos) {
  const times = equipesVivas();
  for (const g of times) {
    let b = blocos.get(g.id);
    if (!b) {
      b = blocoEquipe();
      blocos.set(g.id, b);
    }
    if (b.raiz.parentElement !== caixa) caixa.append(b.raiz);
    b.atualizar(g);
  }
  for (const [id, b] of blocos) {
    if (times.some((g) => g.id === id)) continue;
    b.raiz.remove();
    blocos.delete(id);
  }
  return times;
}

// A equipe que acabou de ser aberta: a tela inicial traz o cartao dela para a vista uma vez.
let equipeFoco = null;

// ------------------------------------------------------------ tela inicial
function criarConta(conta) {
  const pista = bicho();
  const nome = el('h2');
  const estado = el('p', { class: 'estado' });
  const faixa = el('div', { class: 'faixa' }, el('div', { class: 'quem' }, nome, estado), pista);
  const medidores = {};
  const caixaMedidores = el('div');
  for (const [chave, rotulo] of [['five_hour', 'Limite de 5 horas'], ['seven_day', 'Limite da semana']]) {
    const valor = el('span', { class: 'valor' });
    const cels = el('div', { class: 'celulas', role: 'meter', 'aria-label': rotulo, 'aria-valuemin': '0', 'aria-valuemax': '100' });
    const quando = el('p', { class: 'quando' });
    medidores[chave] = { valor, cels, quando };
    caixaMedidores.append(el('div', { class: 'medidor' }, el('span', { class: 'rotulo', text: rotulo }), valor, cels, quando));
  }
  const gasto = el('p', { class: 'gasto' });
  const lista = el('ul', { class: 'sessoes' });
  const vazio = el('p', { class: 'vazio' });
  const raiz = el('section', { class: 'conta', 'aria-label': conta.nome }, faixa, caixaMedidores, gasto, lista, vazio);

  function medidor(chave, u, lidoEm, erro) {
    const m = medidores[chave];
    const t = agora();
    if (!u || typeof u.pct !== 'number') {
      m.valor.className = 'valor sem';
      m.valor.textContent = 'sem leitura';
      celulas(m.cels, 20, 0);
      m.cels.removeAttribute('aria-valuenow');
      m.quando.textContent = erro === 'login' ? 'A conta saiu do login. Entre de novo nela para ver o limite.' : 'O número aparece depois da primeira resposta do Claude nesta conta.';
      return;
    }
    const pct = Math.round(u.pct);
    m.valor.className = 'valor';
    m.valor.replaceChildren(String(pct), el('small', { text: '%' }));
    celulas(m.cels, 20, Math.min(20, Math.ceil(u.pct / 5)), { quenteDe: 16 });
    m.cels.setAttribute('aria-valuenow', String(pct));
    let texto;
    if (u.resetsAt && u.resetsAt > t) {
      const resta = u.resetsAt - t;
      texto =
        chave === 'five_hour' || resta < 20 * 3600 * 1000
          ? `Reinicia às ${fHora.format(u.resetsAt)}, em ${falta(resta)}.`
          : `Reinicia ${fDia.format(u.resetsAt)} às ${fHora.format(u.resetsAt)}, em ${falta(resta)}.`;
    } else if (u.fresh) {
      const r = conta.lastReset?.win === chave ? ` às ${fHora.format(conta.lastReset.at)}` : '';
      texto = `Reiniciou${r}. A contagem recomeça no próximo uso.`;
    } else texto = 'Horário de reinício ainda não informado.';
    if (lidoEm && t - lidoEm > 5 * 60000 && !u.fresh) texto += ` Leitura de ${falta(t - lidoEm)} atrás.`;
    m.quando.textContent = texto;
  }

  let ultimaLista = '';
  function desenharLista(ss) {
    lista.replaceChildren(
      ...ss.map((s) =>
        el(
          'li',
          null,
          el(
            'button',
            { class: 'sessao', type: 'button', onclick: () => (location.hash = `#/s/${encodeURIComponent(s.id)}`) },
            el('span', { class: 'marca', 'data-s': s.status }),
            el('span', null, el('span', { class: 'nome', text: nomeDaSessao(s) }), el('span', { class: 'fazendo', text: oQueFaz(s) })),
            s.ctx?.pct != null ? el('span', { class: 'ctx', title: 'Contexto usado', text: `${Math.round(s.ctx.pct)}%` }) : el('span'),
            icone('caret-right', 18),
          ),
        ),
      ),
    );
  }

  function atualizar(c) {
    conta = c;
    pintar(raiz, c.cor);
    nome.textContent = c.nome;
    const e = estadoDaConta(c);
    pista.definir(e.bicho);
    faixa.dataset.vida = e.vida;
    estado.textContent = e.texto;
    medidor('five_hour', c.usage?.five_hour, c.usage?.at, c.usage?.erro);
    medidor('seven_day', c.usage?.seven_day, c.usage?.at, c.usage?.erro);

    if (c.tokens) {
      const novos = c.tokens.in + c.tokens.cw + c.tokens.out;
      gasto.replaceChildren(
        el('b', { text: compacto.format(novos) }),
        ' de tokens nesta janela de 5 horas',
        c.tokens.cr ? `, mais ${compacto.format(c.tokens.cr)} relidos do cache` : '',
        '.',
      );
    }
    gasto.hidden = !c.tokens;

    const ss = S.sessoes.filter((s) => s.account === c.id).sort((a, b) => a.startedAt - b.startedAt);
    // So refaz a lista quando algo visivel mudou, para nao perder um toque no meio.
    const marca = JSON.stringify(ss.map((s) => [s.id, s.status, nomeDaSessao(s), oQueFaz(s), Math.round(s.ctx?.pct ?? -1)]));
    if (marca !== ultimaLista) {
      ultimaLista = marca;
      desenharLista(ss);
    }
    lista.hidden = !ss.length;
    vazio.hidden = !!ss.length;
    vazio.textContent = S.host.available
      ? `Para pôr esta conta para trabalhar, toque em Abrir sessão no topo ou abra o atalho ${c.id} no computador.`
      : `Para pôr esta conta para trabalhar, abra o atalho ${c.id} no computador.`;
  }
  return { raiz, atualizar };
}

function criarInicio() {
  const ligacao = el('p', { class: 'ligacao' }, el('i'), el('span'));
  const abrir = el('button', { class: 'botao quieto', type: 'button', hidden: true, onclick: () => (location.hash = '#/nova/_') }, icone('plus', 18), 'Abrir sessão');
  const semLigacao = el(
    'div',
    { class: 'faixa-aviso', role: 'alert', hidden: true },
    el('b', { text: 'Sem conexão com o computador' }),
    'Confira se ele está ligado, com o duckV aberto, e se o Tailscale está ativo neste celular. O app continua tentando.',
  );
  const demo = el('div', { class: 'faixa-aviso neutra', hidden: true }, el('b', { text: 'Modo demonstração' }), 'As contas, as sessões e os números desta tela são de mentira.');
  const pedidos = el('div', { class: 'pedidos' });
  const equipes = el('div', { class: 'equipes' });
  const blocosEquipe = new Map();
  const contas = el('div');
  const esqueleto = el('div', { 'aria-hidden': 'true' }, ...[0, 1].map(() => el('div', { class: 'esqueleto' }, el('i'), el('i'), el('i'))));
  const porId = new Map();
  const botaoAvisos = el('button', { class: 'botao quieto', type: 'button', onclick: ativarAvisos }, icone('bell', 18), 'Ativar avisos neste celular');
  const notaAvisos = el('p');
  const semTerminal = el('p', { hidden: true });
  const rodape = el('footer', { class: 'rodape' }, ligacao, botaoAvisos, notaAvisos, semTerminal);
  const opcoes = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Opções', onclick: () => (location.hash = '#/opcoes') }, icone('gear-six', 24));
  const raiz = el('div', null, el('header', { class: 'barra' }, el('h1', { text: 'duckV' }), el('div', { class: 'barra-acoes' }, abrir, opcoes)), semLigacao, demo, pedidos, equipes, esqueleto, contas, rodape);

  function avisos() {
    const pode = 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
    // No iPhone, o Safari so manda avisos para o duckV adicionado a Tela de Inicio (iOS 16.4 ou mais novo).
    const iphoneNoSafari = /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone;
    if (iphoneNoSafari && window.isSecureContext) {
      botaoAvisos.hidden = true;
      notaAvisos.textContent = 'Para receber avisos no iPhone: toque em Compartilhar, depois em "Adicionar à Tela de Início", e abra o duckV pelo ícone novo.';
    } else if (!pode) {
      botaoAvisos.hidden = true;
      notaAvisos.textContent = 'Avisos com o app fechado só funcionam pelo endereço https do Tailscale.';
    } else if (Notification.permission === 'granted' && localStorage.getItem('avisos') === 'sim') {
      botaoAvisos.hidden = true;
      notaAvisos.textContent = 'Avisos ativados: pedido de permissão, fim de tarefa e reinício de limite.';
    } else if (Notification.permission === 'denied') {
      botaoAvisos.hidden = true;
      notaAvisos.textContent = 'Os avisos estão bloqueados. Libere as notificações deste site nas configurações do navegador.';
    } else {
      botaoAvisos.hidden = false;
      notaAvisos.textContent = 'Receba um aviso quando uma conta pedir permissão, terminar ou reiniciar o limite.';
    }
  }

  function atualizar() {
    ligacao.lastChild.textContent = S.ligado ? 'Ligado ao computador' : S.ligado === false ? 'Sem conexão' : 'Conectando';
    ligacao.dataset.ok = S.ligado ? 'sim' : S.ligado === false ? 'nao' : '';
    semLigacao.hidden = S.ligado !== false;
    demo.hidden = !S.demo;
    esqueleto.hidden = S.pronto;
    abrir.hidden = !S.pronto || !S.host.available;
    rodape.hidden = !S.pronto;
    sincronizarPedidos(pedidos, pedidosDe(S.sessoes));
    // As equipes vem acima das contas, porque as sessoes delas chegam juntas e se leem juntas.
    sincronizarEquipes(equipes, blocosEquipe);
    // A equipe aberta agora chega um instante depois da resposta: quando o cartao dela existir, a vista vai nele.
    if (equipeFoco && blocosEquipe.has(equipeFoco)) {
      blocosEquipe.get(equipeFoco).raiz.scrollIntoView({ block: 'nearest', behavior: semMovimento.matches ? 'auto' : 'smooth' });
      equipeFoco = null;
    }
    for (const c of S.contas) {
      let v = porId.get(c.id);
      if (!v) {
        v = criarConta(c);
        porId.set(c.id, v);
        contas.append(v.raiz);
      }
      v.atualizar(c);
    }
    for (const [id, v] of porId) {
      if (!S.contas.some((c) => c.id === id)) {
        v.raiz.remove();
        porId.delete(id);
      }
    }
    avisos();
    semTerminal.hidden = !S.pronto || S.host.available;
    semTerminal.textContent = 'Abrir sessões pelo celular está desligado: o computador não conseguiu carregar o terminal virtual. Rode a instalação de novo.';
  }
  return { raiz, atualizar };
}

// ------------------------------------------------------------ tela da sessao
function blocosDeTexto(texto) {
  // Separa blocos de codigo (```) do texto comum.
  return String(texto)
    .split(/```[^\n]*\n?/)
    .map((parte, i) => {
      if (!parte.trim()) return null;
      return i % 2 ? el('pre', { text: parte.replace(/\n$/, ''), tabIndex: 0 }) : el('p', { text: parte.trim() });
    })
    .filter(Boolean);
}

function criarMensagem(m) {
  if (m.role === 'tool') return el('div', { class: 'm tool' }, icone('caret-right', 14), el('span', null, el('b', { text: m.tool }), m.text || ''));
  if (m.role === 'sys') return el('div', { class: 'm sys', text: m.text });
  if (m.role === 'image' && /^[0-9a-f]{24}$/.test(m.img || '')) {
    const src = `/api/img/${m.img}`;
    return el('a', { class: `m imagem ${m.via === 'user' ? 'eu' : ''}`, href: src, target: '_blank', rel: 'noopener' }, el('img', { src, alt: 'Imagem da conversa', loading: 'lazy' }));
  }
  if (m.role === 'user') {
    const { texto, itens } = anexosDoTexto(m.text);
    return el(
      'div',
      { class: 'm user' },
      itens.length ? el('div', { class: 'anexos-msg' }, itens.map(anexoNaConversa)) : null,
      ...(texto ? blocosDeTexto(texto) : []),
      m.via === 'celular' ? el('span', { class: 'via', text: 'Enviada do celular' }) : null,
    );
  }
  return el('div', { class: 'm assistant' }, ...blocosDeTexto(m.text));
}
const visiveis = (itens) => (LOCAL.ferramentas ? itens : itens.filter((m) => m.role !== 'tool'));

// ------------------------------------------------------------ anexos (o mesmo formato do app do computador)
// Caminhos da pasta data/anexos dentro de uma mensagem saem do texto e viram miniatura ou cartao.
const RE_ANEXO_LINHA = /^[ \t]*"?((?:[A-Za-z]:)?[^\n"]*?[\\/]anexos[\\/](\d{4}-\d{2}-\d{2}-[0-9a-f]{8})[\\/]([\p{L}\p{N}._-]{1,80}))"?[ \t]*$/gmu;
const RE_ANEXO_SOLTO = /(?:[A-Za-z]:)?[^\s"'`]*[\\/]anexos[\\/](\d{4}-\d{2}-\d{2}-[0-9a-f]{8})[\\/]([\p{L}\p{N}._-]{1,80})/gu;
function anexosDoTexto(texto) {
  const itens = [];
  const add = (pasta, nome) => itens.push({ url: `/api/anexo/${pasta}/${encodeURIComponent(nome)}`, nome, imagem: /\.(png|jpe?g|gif|webp|bmp)$/i.test(nome) });
  let t = String(texto || '').replace(RE_ANEXO_LINHA, (_, _c, pasta, nome) => (add(pasta, nome), ''));
  t = t.replace(RE_ANEXO_SOLTO, (_, pasta, nome) => (add(pasta, nome), ''));
  return { texto: t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), itens };
}
function anexoNaConversa(a) {
  if (a.imagem) {
    const img = el('img', { src: a.url, alt: a.nome, loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(el('span', { class: 'anexo-sumiu', text: `${a.nome} (não está mais no computador)` })), { once: true });
    return el('a', { class: 'anexo-miniatura', href: a.url, target: '_blank', rel: 'noopener', 'aria-label': `Abrir ${a.nome}` }, img);
  }
  return el('a', { class: 'anexo-cartao', href: a.url, download: a.nome }, icone('paperclip', 16), el('span', { text: a.nome }));
}
const tamanhoLegivel = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const nomeDePrint = (tipo, n) => {
  const h = new Date();
  const p2 = (x) => String(x).padStart(2, '0');
  return `print-${p2(h.getHours())}${p2(h.getMinutes())}${p2(h.getSeconds())}${n ? `-${n}` : ''}.${tipo.split('/')[1].replace('jpeg', 'jpg')}`;
};
// Miniatura pequena feita no proprio aparelho (data: URL), antes mesmo de o arquivo subir.
async function miniatura(arquivo) {
  try {
    const bmp = await createImageBitmap(arquivo);
    const k = Math.min(1, 200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

const TECLAS = [
  ['esc', 'Esc'],
  ['up', null, 'arrow-up', 'Seta para cima'],
  ['down', null, 'arrow-down', 'Seta para baixo'],
  ['left', null, 'arrow-left', 'Seta para a esquerda'],
  ['right', null, 'arrow-right', 'Seta para a direita'],
  ['tab', 'Tab'],
  ['shift-tab', 'Shift+Tab'],
  ['enter', null, 'key-return', 'Enter'],
  ['ctrl-c', 'Ctrl+C'],
];

// Acoes que apagam ou encerram pedem um segundo toque em vez de abrir um dialogo.
function duasVezes(botao, texto, acao) {
  let armado = null;
  botao.addEventListener('click', () => {
    if (armado) {
      clearTimeout(armado);
      armado = null;
      botao.lastChild.textContent = texto;
      return acao();
    }
    botao.lastChild.textContent = 'Toque de novo para confirmar';
    armado = setTimeout(() => {
      armado = null;
      botao.lastChild.textContent = texto;
    }, 3500);
  });
  return botao;
}

function criarSessao(id, abaInicial) {
  let aba = abaInicial || 'conversa'; // conversa | controles | terminal (a tela do terminal fica dentro de Controles)
  const pista = bicho();
  const ficha = el('div', { class: 'ficha' }, pista);
  const titulo = el('h1');
  const onde = el('p', { class: 'onde' });

  // --- abas
  const botoesAba = {};
  const abas = el('div', { class: 'abas', role: 'tablist', 'aria-label': 'Partes da sessão' });
  for (const [chave, rotulo, ic] of [['conversa', 'Conversa', 'chat-text'], ['controles', 'Controles', 'sliders-horizontal']]) {
    const b = el('button', { type: 'button', role: 'tab', id: `aba-${chave}`, 'aria-controls': 'painel-sessao', onclick: () => trocarAba(chave) }, icone(ic, 18), rotulo);
    botoesAba[chave] = b;
    abas.append(b);
  }

  // --- conversa
  const fazendo = el('p', { class: 'fazendo' });
  const contexto = el('p', { class: 'linha' });
  const numeros = el('p', { class: 'linha' });
  const ctxCels = el('div', { class: 'celulas', role: 'meter', 'aria-label': 'Contexto usado', 'aria-valuemin': '0', 'aria-valuemax': '100' });
  const tarefasTexto = el('span');
  const tarefasCels = el('div', { class: 'celulas' });
  const tarefasLista = el('ol');
  const tarefas = el('details', { class: 'tarefas' }, el('summary', null, tarefasTexto, tarefasCels), tarefasLista);
  const info = el('div', { class: 's-info' }, fazendo, contexto, ctxCels, numeros, tarefas);
  const conversa = el('div', { class: 'conversa', role: 'log', 'aria-label': 'Conversa', tabIndex: 0 });
  const painelConversa = el('div', { class: 'painel' }, info, conversa);

  // --- tela do terminal (recurso avancado, dentro de Controles)
  const pre = el('pre', { class: 'terminal', 'aria-label': 'Tela do terminal da sessão', role: 'img' });
  const cursor = el('div', { class: 'cursor', hidden: true });
  const caixaTerminal = el('div', { class: 'terminal-caixa' }, pre, cursor);
  const teclas = el(
    'div',
    { class: 'teclas', role: 'group', 'aria-label': 'Teclas do terminal' },
    el('button', { class: 'botao quieto voltar-controles', type: 'button', onclick: () => trocarAba('controles') }, icone('arrow-left', 18), 'Controles'),
    TECLAS.map(([tecla, texto, ic, rotulo]) =>
      el('button', { class: 'botao', type: 'button', 'aria-label': rotulo || texto, onclick: () => mandar({ t: 'key', instance: id, key: tecla }, (erro) => erro && avisar(erro)) }, ic ? icone(ic, 18) : texto),
    ),
  );
  const painelTerminal = el('div', { class: 'painel' }, teclas, caixaTerminal);

  // --- controles
  const painelControles = el('div', { class: 'painel rola' });

  const corpo = el('div', { id: 'painel-sessao', role: 'tabpanel', class: 'corpo' });
  const pedidos = el('div', { class: 'pedidos' });
  const rapidas = el('div', { class: 'rapidas', role: 'group', 'aria-label': 'Mensagens rápidas' });
  const campo = el('textarea', { rows: 1, 'aria-label': 'Mensagem para o Claude' });
  const enviar = el('button', { class: 'botao principal', type: 'submit', 'aria-label': 'Enviar' }, icone('paper-plane-right', 22));
  const nota = el('p', { class: 'nota' });
  // Anexos: o clipe abre Fotos, Camera ou Arquivos (no iPhone e no Android); colar uma imagem tambem anexa.
  const anexar = el('button', { class: 'botao anexar', type: 'button', 'aria-label': 'Anexar foto ou arquivo' }, icone('paperclip', 22));
  const escolherArquivo = el('input', { type: 'file', hidden: true, multiple: true });
  const prontos = el('div', { class: 'anexos-prontos', role: 'list', 'aria-label': 'Anexos desta mensagem', hidden: true });
  const form = el('form', { class: 'escrever' }, prontos, anexar, campo, enviar, escolherArquivo);
  const baixo = el('div', { class: 's-baixo' }, pedidos, rapidas, nota, form);
  const raiz = el(
    'div',
    { class: 's-tela' },
    el('header', { class: 's-topo' }, el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Voltar para as contas', onclick: () => (location.hash = '') }, icone('arrow-left', 24)), el('div', null, titulo, onde), ficha),
    abas,
    corpo,
    baixo,
  );

  const sessao = () => S.sessoes.find((x) => x.id === id);
  const textoVazio = (s) =>
    s?.hosted
      ? 'A conversa aparece aqui depois da sua primeira mensagem. Se o Claude Code perguntar algo ao abrir, a pergunta surge logo abaixo, com botões.'
      : 'A conversa aparece aqui assim que a sessão trocar mensagens.';
  const enviarTexto = (texto, ok) => mandar({ t: 'send', instance: id, text: texto }, (erro) => avisar(erro || ok));
  const tecla = (k, ok) => mandar({ t: 'key', instance: id, key: k }, (erro) => (erro ? avisar(erro) : ok && avisar(ok)));

  campo.addEventListener('input', () => {
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight + 4, window.innerHeight * 0.34)}px`;
  });
  campo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) form.requestSubmit();
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (anexos.some((a) => a.estado === 'enviando')) return avisar('Espere os anexos terminarem de subir.');
    const vao = anexos.filter((a) => a.caminho);
    // Os caminhos vao no fim, um por linha: o agente le os arquivos e a conversa mostra a miniatura.
    const texto = [campo.value.trim(), vao.map((a) => a.caminho).join('\n')].filter(Boolean).join('\n\n');
    if (!texto) return;
    enviar.disabled = true;
    mandar({ t: 'send', instance: id, text: texto }, (erro) => {
      enviar.disabled = false;
      if (erro) return avisar(erro);
      campo.value = '';
      campo.style.height = 'auto';
      anexos = anexos.filter((a) => !vao.includes(a));
      desenharAnexos();
    });
  });

  // --- anexos: sobem na hora e aparecem como miniatura acima da caixa; o caminho so vai ao enviar
  let anexos = [];
  function desenharAnexos() {
    prontos.hidden = !anexos.length;
    prontos.replaceChildren(
      ...anexos.map((a) => {
        const tirar = el('button', { class: 'anexo-tirar', type: 'button', 'aria-label': `Tirar ${a.nome}`, onclick: () => ((anexos = anexos.filter((x) => x !== a)), desenharAnexos()) }, icone('x', 16));
        const situacao = a.estado === 'enviando' ? 'Enviando…' : a.estado === 'erro' ? a.erro : tamanhoLegivel(a.tamanho);
        return a.previa
          ? el('div', { class: 'anexo-item imagem', role: 'listitem', 'data-estado': a.estado, 'aria-label': `${a.nome}, ${situacao}` }, el('img', { src: a.previa, alt: '' }), tirar)
          : el('div', { class: 'anexo-item arquivo', role: 'listitem', 'data-estado': a.estado }, icone('paperclip', 18), el('span', { class: 't' }, el('b', { text: a.nome }), el('span', { text: situacao })), tirar);
      }),
    );
  }
  async function anexarArquivos(arquivos, colado = false) {
    if (anexos.length + arquivos.length > 10) {
      avisar('Até 10 anexos por mensagem.');
      arquivos = arquivos.slice(0, Math.max(0, 10 - anexos.length));
    }
    await Promise.all(
      arquivos.map(async (f, i) => {
        if (f.size > 25 * 1024 * 1024) return avisar(`${f.name}: grande demais (máximo de 25 MB).`);
        const imagem = /^image\/(png|jpe?g|gif|webp|bmp)$/.test(f.type);
        const nome = colado && imagem ? nomeDePrint(f.type, arquivos.length > 1 ? i + 1 : 0) : f.name;
        const a = { nome, tamanho: f.size, previa: null, estado: 'enviando', caminho: null };
        anexos.push(a);
        desenharAnexos();
        if (imagem) {
          a.previa = await miniatura(f);
          desenharAnexos();
        }
        try {
          const r = await fetch(`/api/anexo?nome=${encodeURIComponent(nome)}`, { method: 'POST', credentials: 'same-origin', body: f });
          const j = await r.json();
          if (!r.ok) throw new Error(j.erro || 'falhou');
          Object.assign(a, { estado: 'pronto', caminho: j.caminho });
        } catch (e) {
          Object.assign(a, { estado: 'erro', erro: e.message === 'Failed to fetch' || e.message === 'Load failed' ? 'Sem conexão' : e.message });
          avisar(`Não consegui anexar ${nome}: ${a.erro}`);
        }
        if (anexos.includes(a)) desenharAnexos();
      }),
    );
  }
  anexar.addEventListener('click', () => escolherArquivo.click());
  escolherArquivo.addEventListener('change', () => {
    anexarArquivos([...escolherArquivo.files]);
    escolherArquivo.value = '';
  });
  campo.addEventListener('paste', (ev) => {
    const fs = [...(ev.clipboardData?.files || [])];
    if (fs.length) {
      ev.preventDefault();
      anexarArquivos(fs, true);
    }
  });

  // --- terminal: mede quantas colunas e linhas cabem e pede a tela nesse tamanho
  let medida = null;
  let pediuTela = false;
  function medir() {
    const sonda = el('span', { text: 'MMMMMMMMMMMMMMMMMMMM' });
    sonda.style.visibility = 'hidden';
    pre.append(sonda);
    const largo = sonda.offsetWidth;
    sonda.remove();
    if (!largo) return null;
    const estilo = getComputedStyle(pre);
    const lh = parseFloat(estilo.lineHeight) || 15.6;
    const px = parseFloat(estilo.paddingLeft);
    const py = parseFloat(estilo.paddingTop);
    const cw = largo / 20;
    return { cw, lh, px, py, cols: Math.floor((caixaTerminal.clientWidth - 2 * px) / cw), rows: Math.floor((caixaTerminal.clientHeight - 2 * py) / lh) };
  }
  function pedirTela() {
    const s = sessao();
    if (aba !== 'terminal' || !s?.hosted) return;
    medida = medir();
    if (!medida || medida.cols < 20) return;
    pediuTela = true;
    mandar({ t: 'term', instance: id, on: true, cols: medida.cols, rows: medida.rows });
  }
  let medirDepois = null;
  const observador = new ResizeObserver(() => {
    clearTimeout(medirDepois);
    medirDepois = setTimeout(pedirTela, 250);
  });
  observador.observe(caixaTerminal);

  function desenharTerminal() {
    const t = S.tela;
    if (!t || t.instance !== id) return;
    pre.textContent = t.lines.join('\n');
    if (medida) {
      cursor.hidden = false;
      cursor.style.width = `${medida.cw}px`;
      cursor.style.height = `${medida.lh}px`;
      cursor.style.left = `${medida.px + t.cx * medida.cw}px`;
      cursor.style.top = `${medida.py + t.cy * medida.lh}px`;
    }
  }

  function trocarAba(nova) {
    if (aba === 'terminal' && nova !== 'terminal' && pediuTela) {
      mandar({ t: 'term', instance: id, on: false });
      pediuTela = false;
    }
    aba = nova;
    history.replaceState(null, '', `#/s/${encodeURIComponent(id)}${aba === 'conversa' ? '' : `/${aba}`}`);
    atualizar();
    if (aba === 'terminal') document.fonts.ready.then(pedirTela);
    if (aba === 'conversa') conversa.scrollTop = conversa.scrollHeight;
  }

  // --- controles
  let ultimoControle = '';
  const grupo = (tituloGrupo, ...filhos) => el('section', { class: 'grupo' }, el('h2', { text: tituloGrupo }), ...filhos);
  const escolha = (rotuloGrupo, opcoes, aoEscolher) =>
    el(
      'div',
      { class: 'opcoes', role: 'group', 'aria-label': rotuloGrupo },
      opcoes.map(([valor, rotulo, marcado]) => el('button', { class: 'botao', type: 'button', 'aria-pressed': marcado ? 'true' : 'false', text: rotulo, onclick: () => aoEscolher(valor, rotulo) })),
    );
  const ficheiro = (ic, rotulo, valor) => el('div', { class: 'leitura' }, icone(ic, 20), el('span', null, el('span', { class: 'rotulo', text: rotulo }), el('b', { text: valor })));

  function desenharControles(s, conta) {
    const marca = JSON.stringify([s.hosted, s.model, s.effort, s.permMode, s.rodape, s.status === 'ended', S.host.available]);
    if (marca === ultimoControle) return;
    ultimoControle = marca;
    const resumo = el(
      'div',
      { class: 'leituras' },
      ficheiro('cpu', 'Modelo', s.model || 'ainda não informado'),
      ficheiro('brain', 'Esforço', ESFORCOS[s.effort] || s.effort || 'padrão do modelo'),
      ficheiro('shield-check', 'Permissões', nomeDoModo(s.permMode)),
    );
    if (!s.hosted) {
      painelControles.replaceChildren(
        el(
          'div',
          { class: 'ajustes' },
          resumo,
          grupo(
            'Sessão aberta no computador',
            el('p', { class: 'ajuda', text: 'Daqui você conversa, usa as mensagens rápidas e responde pedidos de permissão. Para trocar modelo, esforço e modo, interromper ou encerrar pelo celular, abra a sessão por aqui.' }),
            S.host.available ? el('button', { class: 'botao principal', type: 'button', onclick: () => (location.hash = `#/nova/${encodeURIComponent(conta.id)}`) }, icone('plus', 18), `Abrir sessão em ${conta.nome}`) : null,
          ),
        ),
      );
      return;
    }
    const modeloAtual = String(s.model || '').toLowerCase();
    const encerrar = duasVezes(el('button', { class: 'botao bloco perigo', type: 'button' }, icone('power', 22), el('span', { text: 'Encerrar sessão' })), 'Encerrar sessão', () =>
      mandar({ t: 'stop', instance: id }, (erro) => avisar(erro || 'Sessão encerrada')),
    );
    const limpar = duasVezes(el('button', { class: 'botao bloco', type: 'button' }, icone('broom', 22), el('span', { text: 'Limpar conversa' })), 'Limpar conversa', () => enviarTexto('/clear', 'Conversa limpa'));
    painelControles.replaceChildren(
      el(
        'div',
        { class: 'ajustes' },
        resumo,
        grupo(
          'Ações',
          el(
            'div',
            { class: 'blocos' },
            el('button', { class: 'botao bloco', type: 'button', onclick: () => tecla('esc', 'Interrompido') }, icone('hand-palm', 22), el('span', { text: 'Interromper' })),
            el('button', { class: 'botao bloco', type: 'button', onclick: () => enviarTexto('/compact', 'Compactação pedida') }, icone('arrows-in-simple', 22), el('span', { text: 'Compactar conversa' })),
            limpar,
            encerrar,
          ),
        ),
        grupo(
          'Modelo',
          escolha(
            'Modelo',
            S.host.models.map((m) => [m, MODELOS[m] || m, modeloAtual.includes(m) && m !== 'opusplan']),
            (m, rotulo) => enviarTexto(`/model ${m}`, `Modelo trocado para ${rotulo}`),
          ),
        ),
        grupo(
          'Esforço de raciocínio',
          escolha(
            'Esforço de raciocínio',
            S.host.efforts.map((e) => [e, ESFORCOS[e] || e, s.effort === e]),
            (e, rotulo) => enviarTexto(`/effort ${e}`, `Esforço trocado para ${rotulo}`),
          ),
        ),
        grupo(
          'Modo de permissão',
          el('p', { class: 'ajuda', text: s.rodape ? `O Claude Code mostra agora: ${s.rodape}` : 'Cada toque passa para o modo seguinte: perguntar sempre, aceitar edições, planejar.' }),
          el('button', { class: 'botao', type: 'button', onclick: () => tecla('shift-tab', 'Modo trocado') }, icone('shield-check', 18), 'Passar para o próximo modo'),
        ),
        grupo(
          'Avançado',
          el('p', { class: 'ajuda', text: 'A tela crua do Claude Code, com teclas. Serve para as raras perguntas que não viram botão.' }),
          el('button', { class: 'botao quieto', type: 'button', onclick: () => trocarAba('terminal') }, icone('terminal-window', 18), 'Ver a tela do terminal'),
        ),
      ),
    );
  }

  let ultimasRapidas = '';
  function desenharRapidas(s) {
    const pode = aba === 'conversa' && s.canSend && s.status !== 'ended';
    rapidas.hidden = !pode;
    if (!pode) return;
    const trabalhando = s.hosted && s.status === 'working';
    const marca = JSON.stringify([trabalhando, S.prefs.rapidas]);
    if (marca === ultimasRapidas) return;
    ultimasRapidas = marca;
    rapidas.replaceChildren(
      ...(trabalhando ? [el('button', { class: 'botao', type: 'button', onclick: () => tecla('esc', 'Interrompido') }, icone('hand-palm', 18), 'Interromper')] : []),
      ...S.prefs.rapidas.map((r) => el('button', { class: 'botao quieto', type: 'button', text: r, onclick: () => enviarTexto(r, 'Enviada') })),
    );
  }

  function atualizar() {
    const s = sessao();
    const painel = aba === 'terminal' ? painelTerminal : aba === 'controles' ? painelControles : painelConversa;
    if (corpo.firstChild !== painel) corpo.replaceChildren(painel);
    const abaMarcada = aba === 'conversa' ? 'conversa' : 'controles';
    corpo.setAttribute('aria-labelledby', `aba-${abaMarcada}`);
    for (const [chave, b] of Object.entries(botoesAba)) {
      b.setAttribute('aria-selected', chave === abaMarcada ? 'true' : 'false');
      b.tabIndex = chave === abaMarcada ? 0 : -1;
    }
    if (!s) {
      titulo.textContent = S.pronto ? 'Sessão encerrada' : 'Carregando';
      onde.textContent = '';
      abas.hidden = true;
      corpo.replaceChildren(el('div', { class: 'conversa' }, el('p', { class: 'vazio', text: S.pronto ? 'Essa sessão não está mais aberta no computador.' : 'Buscando a sessão no computador.' })));
      baixo.hidden = true;
      pista.definir('dorme');
      ficha.dataset.vida = 'apagada';
      return;
    }
    const conta = contaDe(s);
    abas.hidden = false;
    pintar(raiz, conta.cor);
    titulo.textContent = nomeDaSessao(s);
    onde.textContent = [conta.nome, s.model, pasta(s.cwd)].filter(Boolean).join(', ');
    const viva = s.status !== 'ended';
    pista.definir(!viva ? 'dorme' : precisa(s) ? 'pede' : s.status === 'working' ? 'trabalha' : 'parado');
    ficha.dataset.vida = viva ? 'ativa' : 'apagada';
    if (aba === 'terminal' && !s.hosted) return trocarAba('controles');

    fazendo.textContent = s.status === 'idle' ? 'Esperando sua mensagem' : oQueFaz(s);
    contexto.hidden = ctxCels.hidden = !s.ctx?.size;
    if (s.ctx?.size) {
      const p = s.ctx.pct ?? 0;
      contexto.replaceChildren(el('span', null, 'Contexto da conversa ', el('b', { text: `${Math.round(p)}%` }), `, ${compacto.format(s.ctx.in)} de ${compacto.format(s.ctx.size)} tokens`));
      celulas(ctxCels, 20, Math.min(20, Math.ceil(p / 5)), { quenteDe: 16 });
      ctxCels.setAttribute('aria-valuenow', String(Math.round(p)));
    }
    const partes = [];
    const gastos = s.tokens.in + s.tokens.cw + s.tokens.out;
    if (gastos) partes.push(el('span', null, 'Gasto da sessão ', el('b', { text: compacto.format(gastos) }), ' tokens'));
    if (s.lines && (s.lines.add || s.lines.rem)) partes.push(el('span', null, 'Linhas ', el('b', { text: `+${s.lines.add} -${s.lines.rem}` })));
    numeros.replaceChildren(...partes);
    numeros.hidden = !partes.length;

    tarefas.hidden = !s.tasks.length;
    if (s.tasks.length) {
      const feitas = s.tasks.filter((t) => t.status === 'completed').length;
      const emCurso = s.tasks.some((t) => t.status === 'in_progress');
      tarefasTexto.textContent = `Tarefas: ${feitas} de ${s.tasks.length} feitas`;
      celulas(tarefasCels, s.tasks.length, feitas, { agora: emCurso ? feitas : -1 });
      tarefasLista.replaceChildren(
        ...s.tasks.map((t) => el('li', { 'data-s': t.status }, icone(t.status === 'completed' ? 'check' : 'caret-right', 16), el('span', { text: `${t.subject}${t.status === 'in_progress' ? ' (em andamento)' : ''}` }))),
      );
    }

    if (aba === 'controles') desenharControles(s, conta);
    else ultimoControle = '';

    const semNada = conversa.querySelector('.vazio');
    if (semNada) semNada.textContent = textoVazio(s);

    sincronizarPedidos(pedidos, pedidosDe([s]));
    desenharRapidas(s);
    baixo.hidden = false;
    form.hidden = !viva || aba === 'controles';
    campo.disabled = enviar.disabled = !s.canSend;
    campo.placeholder = s.hosted ? 'Mensagem ou /comando' : 'Escreva para o Claude';
    nota.textContent = !viva ? 'Sessão encerrada.' : s.canSend ? '' : 'Esta sessão não recebe mensagens do celular. Abra-a pelo atalho da conta, com o duckV ligado.';
    nota.hidden = !nota.textContent || aba === 'controles';
  }

  function desenharConversa(tudo, novas) {
    const noFim = conversa.scrollHeight - conversa.scrollTop - conversa.clientHeight < 120;
    if (tudo) {
      const itens = visiveis(S.conversa);
      conversa.replaceChildren(...(itens.length ? itens.map(criarMensagem) : [el('p', { class: 'vazio', text: textoVazio(sessao()) })]));
      conversa.scrollTop = conversa.scrollHeight;
      return;
    }
    const itens = visiveis(novas);
    if (!itens.length) return;
    conversa.querySelector('.vazio')?.remove();
    conversa.append(...itens.map(criarMensagem));
    if (noFim) conversa.scrollTop = conversa.scrollHeight;
  }

  return {
    raiz,
    id,
    atualizar,
    conversa: desenharConversa,
    terminal: desenharTerminal,
    religou: () => aba === 'terminal' && pedirTela(),
    montada: () => aba === 'terminal' && document.fonts.ready.then(pedirTela),
    fechar: () => {
      observador.disconnect();
      if (pediuTela) mandar({ t: 'term', instance: id, on: false });
    },
  };
}

// ------------------------------------------------------------ nova sessao
// "Todas as contas" no lugar de uma conta: a equipe abre uma sessao por conta na mesma pasta.
const TODAS = 'equipe';

function criarNova(contaInicial) {
  let contaId = S.contas.some((c) => c.id === contaInicial) ? contaInicial : contaInicial === TODAS ? TODAS : null;
  const ehTime = () => contaId === TODAS;
  const opcoesConta = el('div', { class: 'opcoes', role: 'radiogroup', 'aria-label': 'Conta' });
  const caminho = el('input', { id: 'nova-pasta', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'C:\\projetos\\meu-projeto' });
  const erroPasta = el('p', { class: 'erro', role: 'alert', hidden: true });
  const recentes = el('div', { class: 'recentes' });
  const navegador = el('div', { class: 'navegador', hidden: true });
  const nome = el('input', { id: 'nova-nome', type: 'text', autocomplete: 'off', maxLength: 50 });
  const tarefa = el('textarea', { id: 'nova-tarefa', rows: 4, maxLength: 8000, placeholder: 'Ex.: corrija o teste que está falhando e abra um pull request' });
  const erroTarefa = el('p', { class: 'erro', role: 'alert', hidden: true });
  const ajudaEquipe = el('p', { class: 'ajuda' });
  const modelo = folhaSeletor({ id: 'nova-modelo', rotulo: 'Modelo' });
  const esforco = folhaSeletor({ id: 'nova-esforco', rotulo: 'Esforço', opcoes: [{ v: '', t: 'Padrão do modelo' }] });
  const modo = folhaSeletor({ id: 'nova-modo', rotulo: 'Permissões' });
  const ajudaModo = el('p', { class: 'ajuda' });
  const erroGeral = el('p', { class: 'erro', role: 'alert', hidden: true });
  const abrir = el('button', { class: 'botao principal cheio', type: 'submit', text: 'Abrir sessão' });

  const campoDe = (rotulo, alvo, ...resto) => el('div', { class: 'campo' }, el('label', { for: alvo.id, text: rotulo }), alvo, ...resto);
  const campoConta = el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Conta' }), opcoesConta, ajudaEquipe);
  const campoTarefa = campoDe('O que a equipe deve fazer', tarefa, erroTarefa);
  const campoNome = campoDe('Nome da sessão (opcional)', nome);
  const camposDaConta = [campoDe('Modelo', modelo), campoDe('Esforço de raciocínio', esforco), campoDe('Modo de permissão', modo, ajudaModo)];
  const form = el(
    'form',
    { class: 'formulario', noValidate: true },
    campoConta,
    campoDe(
      'Pasta do projeto',
      caminho,
      erroPasta,
      el('button', { class: 'botao quieto', type: 'button', onclick: () => navegar(caminho.value.trim() || S.host.home) }, icone('folder', 18), 'Procurar no computador'),
      navegador,
      recentes,
    ),
    campoTarefa,
    campoNome,
    ...camposDaConta,
    el('div', { class: 'campo' }, erroGeral, abrir),
  );
  const raiz = el(
    'div',
    null,
    el(
      'header',
      { class: 's-topo' },
      el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Voltar para as contas', onclick: () => (location.hash = '') }, icone('arrow-left', 24)),
      el('div', null, el('h1', { text: 'Abrir sessão' }), el('p', { class: 'onde', text: 'Abre no computador, você comanda daqui.' })),
      el('span'),
    ),
    form,
  );

  modo.addEventListener('change', () => (ajudaModo.textContent = MODOS[modo.value]?.[1] || ''));

  function navegar(dir) {
    mandar({ t: 'ls', path: dir }, (erro, r) => {
      if (erro) {
        navegador.hidden = false;
        navegador.replaceChildren(el('p', { class: 'sem', text: erro }));
        return;
      }
      caminho.value = r.path;
      erroPasta.hidden = true;
      navegador.hidden = false;
      const lista = el(
        'ul',
        null,
        r.parent ? el('li', null, el('button', { type: 'button', onclick: () => navegar(r.parent) }, icone('arrow-elbow-left-up', 18), 'Subir uma pasta')) : null,
        r.dirs.map((d) => el('li', null, el('button', { type: 'button', onclick: () => navegar(r.path + (r.path.endsWith(S.host.sep) ? '' : S.host.sep) + d) }, icone('folder', 18), d))),
      );
      const partes = [el('p', { class: 'onde-estou', text: r.path }), lista];
      if (!r.dirs.length) partes.push(el('p', { class: 'sem', text: 'Esta pasta não tem subpastas. Ela já está escolhida no campo acima.' }));
      navegador.replaceChildren(...partes);
    });
  }

  const nomeDaConta = (id) => S.contas.find((c) => c.id === id)?.nome || id;

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    erroGeral.hidden = true;
    erroTarefa.hidden = true;
    const cwd = caminho.value.trim();
    if (!cwd) {
      erroPasta.textContent = 'Escolha a pasta do projeto.';
      erroPasta.hidden = false;
      caminho.focus();
      return;
    }
    // "Todas as contas": o computador abre uma sessao por conta e manda o briefing de equipe em cada uma.
    if (ehTime()) {
      const texto = tarefa.value.trim();
      if (texto.length < 3) {
        erroTarefa.textContent = 'Escreva o que a equipe deve fazer.';
        erroTarefa.hidden = false;
        tarefa.focus();
        return;
      }
      abrir.disabled = true;
      abrir.textContent = 'Abrindo as contas';
      mandar({ t: 'equipe', cwd, texto }, (erro, r) => {
        abrir.disabled = false;
        rotularBotao();
        if (erro) {
          erroGeral.textContent = erro;
          erroGeral.hidden = false;
          return;
        }
        const abertas = (r.instances || []).length;
        const falhas = r.falhas || [];
        avisar(
          falhas.length
            ? `${plural(abertas, 'conta abriu', 'contas abriram')}. Fora: ${falhas.map((f) => `${nomeDaConta(f.conta)} (${f.erro})`).join('; ')}`
            : `${plural(abertas, 'conta trabalhando', 'contas trabalhando')} na mesma pasta`,
        );
        // Volta para o inicio, onde o cartao da equipe mostra os patos das contas juntos.
        equipeFoco = r.equipe || null;
        location.hash = '';
      });
      return;
    }
    abrir.disabled = true;
    abrir.textContent = 'Abrindo';
    const cols = Math.max(40, Math.floor((Math.min(window.innerWidth, 560) - 32) / 7.2));
    mandar({ t: 'start', account: contaId, cwd, name: nome.value.trim(), model: modelo.value, effort: esforco.value || null, mode: modo.value, cols, rows: 30 }, (erro, r) => {
      abrir.disabled = false;
      abrir.textContent = 'Abrir sessão';
      if (erro) {
        erroGeral.textContent = erro;
        erroGeral.hidden = false;
        return;
      }
      location.hash = `#/s/${encodeURIComponent(r.instance)}`;
    });
  });

  // Preenche o formulario com o jeito de comecar que a conta tem nas Opcoes.
  function aplicarPadroes() {
    const p = S.contas.find((c) => c.id === contaId)?.padroes || {};
    if (p.model) modelo.value = p.model;
    esforco.value = p.effort || '';
    if (p.mode) modo.value = p.mode;
    ajudaModo.textContent = MODOS[modo.value]?.[1] || '';
    if (p.cwd && !caminho.value.trim()) caminho.value = p.cwd;
  }

  // O botao diz quantas contas entram quando a escolha e a equipe.
  function rotularBotao() {
    abrir.textContent = ehTime() ? `Abrir com ${contasDaEquipe().length} contas` : 'Abrir sessão';
  }

  // Na equipe, a tarefa e obrigatoria e cada conta abre com os padroes dela: nome, modelo, esforco e
  // modo saem de cena.
  function mostrarCampos() {
    const time = ehTime();
    campoTarefa.hidden = !time;
    campoNome.hidden = time;
    for (const c of camposDaConta) c.hidden = time;
    const nomes = contasDaEquipe().map((c) => c.nome);
    ajudaEquipe.hidden = !time;
    ajudaEquipe.textContent = time
      ? `${nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes.join('')} abrem uma sessão cada, nesta pasta do computador, e dividem a tarefa entre si. A divisão fica num arquivo da pasta, e cada conta começa com os padrões dela.`
      : '';
    if (!abrir.textContent.startsWith('Abrindo')) rotularBotao();
  }

  let preenchido = false;
  function atualizar() {
    if (!S.pronto) return;
    const time = contasDaEquipe();
    if (ehTime() && time.length < 2) contaId = null;
    if (!contaId) contaId = S.contas.find((c) => c.id === contaInicial)?.id || S.contas[0]?.id;
    opcoesConta.replaceChildren(
      ...S.contas.map((c) =>
        el('button', {
          class: 'botao',
          type: 'button',
          role: 'radio',
          'aria-checked': c.id === contaId ? 'true' : 'false',
          text: c.nome,
          onclick: () => {
            contaId = c.id;
            aplicarPadroes();
            mostrarCampos();
            atualizar();
          },
        }),
      ),
      // "Todas as contas" so aparece com duas contas ou mais, com os patinhos delas juntos.
      ...(time.length >= 2
        ? [el(
            'button',
            {
              class: 'botao chip-equipe',
              type: 'button',
              role: 'radio',
              'aria-checked': ehTime() ? 'true' : 'false',
              onclick: () => {
                contaId = TODAS;
                mostrarCampos();
                atualizar();
              },
            },
            el('span', { class: 'patos-equipe' }, ...time.slice(0, 4).map((c) => miniPato('parado', c.cor))),
            'Todas as contas',
          )]
        : []),
    );
    if (!preenchido) {
      preenchido = true;
      modelo.definirOpcoes(S.host.models.map((m) => ({ v: m, t: MODELOS[m] || m })));
      esforco.definirOpcoes([{ v: '', t: 'Padrão do modelo' }, ...S.host.efforts.map((e) => ({ v: e, t: ESFORCOS[e] || e }))]);
      modo.definirOpcoes(S.host.modes.map((m) => ({ v: m, t: MODOS[m]?.[0] || m, apoio: MODOS[m]?.[1] || '' })));
      aplicarPadroes();
      recentes.replaceChildren(
        ...(S.host.folders.length ? [el('p', { class: 'ajuda', text: 'Pastas usadas há pouco' })] : []),
        ...S.host.folders.slice(0, 6).map((f) =>
          el('button', {
            type: 'button',
            text: f,
            onclick: () => {
              caminho.value = f;
              erroPasta.hidden = true;
              navegador.hidden = true;
            },
          }),
        ),
      );
    }
    mostrarCampos();
    abrir.disabled = !S.host.available || abrir.textContent.startsWith('Abrindo');
    if (!S.host.available) {
      erroGeral.textContent = 'O computador não conseguiu carregar o terminal virtual, então não dá para abrir sessões por aqui. Rode a instalação de novo.';
      erroGeral.hidden = false;
    }
  }
  return { raiz, atualizar, id: `nova:${contaInicial}` };
}

// ------------------------------------------------------------ opcoes
const CORES = [
  ['#ffb22e', 'Âmbar'],
  ['#ff7a1a', 'Laranja'],
  ['#c4420a', 'Queimado'],
  ['#ff9e6d', 'Pêssego'],
  ['#e8a32c', 'Mel'],
  ['#f26b4e', 'Coral'],
  ['#b5651d', 'Caramelo'],
  ['#8a3b12', 'Tijolo'],
];

function criarOpcoes() {
  const corpo = el('div', { class: 'formulario' });
  const raiz = el(
    'div',
    null,
    el(
      'header',
      { class: 's-topo' },
      el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Voltar para as contas', onclick: () => (location.hash = '') }, icone('arrow-left', 24)),
      el('div', null, el('h1', { text: 'Opções' }), el('p', { class: 'onde', text: 'Aparência, contas, avisos e mensagens rápidas.' })),
      el('span'),
    ),
    corpo,
  );
  const salvar = (msg) => mandar({ t: 'prefs', ...msg }, (erro) => avisar(erro || 'Salvo'));
  const grupo = (titulo, ...filhos) => el('section', { class: 'grupo' }, el('h2', { text: titulo }), ...filhos);

  // Um grupo de botoes em que so um fica marcado.
  function escolhaUnica(rotulo, opcoes, atual, aoEscolher) {
    const caixa = el('div', { class: 'opcoes', role: 'radiogroup', 'aria-label': rotulo });
    const pintarEscolha = (valor) => {
      for (const b of caixa.children) b.setAttribute('aria-checked', b.dataset.valor === String(valor) ? 'true' : 'false');
    };
    for (const [valor, texto] of opcoes) {
      caixa.append(
        el('button', {
          class: 'botao',
          type: 'button',
          role: 'radio',
          'data-valor': String(valor),
          text: texto,
          onclick: () => {
            pintarEscolha(valor);
            aoEscolher(valor);
          },
        }),
      );
    }
    pintarEscolha(atual);
    return el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: rotulo }), caixa);
  }
  function caixinha(texto, marcado, aoMudar) {
    return el('label', { class: 'marcar' }, caixaMarcar(marcado, aoMudar, texto), el('span', { text: texto }));
  }
  function seletor(idCampo, rotulo, opcoes, atual, aoMudar) {
    const sel = folhaSeletor({ id: idCampo, rotulo, opcoes, valor: atual ?? '', aoMudar });
    return el('div', { class: 'campo' }, el('label', { for: idCampo, text: rotulo }), sel);
  }

  function blocoConta(c) {
    const p = c.padroes || {};
    const nome = el('input', { id: `op-nome-${c.id}`, type: 'text', value: c.nome, maxLength: 30, autocomplete: 'off' });
    nome.addEventListener('change', () => salvar({ op: 'conta', id: c.id, nome: nome.value }));
    const cores = el('div', { class: 'amostras', role: 'radiogroup', 'aria-label': 'Cor da conta' });
    for (const [hex, rotulo] of CORES) {
      const b = el('button', {
        type: 'button',
        role: 'radio',
        class: 'amostra',
        'aria-label': rotulo,
        'aria-checked': hex === c.cor.toLowerCase() ? 'true' : 'false',
        onclick: () => {
          for (const o of cores.children) o.setAttribute('aria-checked', o === b ? 'true' : 'false');
          salvar({ op: 'conta', id: c.id, cor: hex });
        },
      });
      b.style.setProperty('--cor', hex);
      cores.append(b);
    }
    const pastaPadrao = el('input', { id: `op-pasta-${c.id}`, type: 'text', value: p.cwd || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'C:\\projetos\\meu-projeto' });
    pastaPadrao.addEventListener('change', () => salvar({ op: 'conta', id: c.id, padroes: { cwd: pastaPadrao.value } }));
    const resumo = el('summary', null, el('i', { class: 'amostra pequena' }), el('span', { text: c.nome }), icone('caret-right', 18));
    resumo.firstChild.style.setProperty('--cor', c.cor);
    return el(
      'details',
      { class: 'dobra' },
      resumo,
      el(
        'div',
        { class: 'dobra-corpo' },
        el('div', { class: 'campo' }, el('label', { for: nome.id, text: 'Nome' }), nome),
        el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Cor' }), cores),
        el('p', { class: 'ajuda', text: 'Ao abrir uma sessão desta conta pelo celular, começar com:' }),
        seletor(`op-modelo-${c.id}`, 'Modelo', S.host.models.map((m) => [m, MODELOS[m] || m]), p.model || 'default', (v) => salvar({ op: 'conta', id: c.id, padroes: { model: v } })),
        seletor(`op-esforco-${c.id}`, 'Esforço de raciocínio', [['', 'Padrão do modelo'], ...S.host.efforts.map((e) => [e, ESFORCOS[e] || e])], p.effort || '', (v) => salvar({ op: 'conta', id: c.id, padroes: { effort: v || null } })),
        seletor(`op-modo-${c.id}`, 'Modo de permissão', S.host.modes.map((m) => [m, MODOS[m]?.[0] || m]), p.mode || 'manual', (v) => salvar({ op: 'conta', id: c.id, padroes: { mode: v } })),
        el('div', { class: 'campo' }, el('label', { for: pastaPadrao.id, text: 'Pasta do projeto' }), pastaPadrao),
        c.email && !c.padrao
          ? el('div', { class: 'campo' }, el('p', { class: 'ajuda', text: `Conectada como ${c.email}.` }), el('button', { class: 'botao perigo', type: 'button', onclick: () => sairDaContaCelular(c) }, icone('sign-out', 18), 'Sair desta conta'))
          : null,
      ),
    );
  }
  // Sair do login: a conta e as conversas ficam; as sessoes abertas pelo duckV nesta conta fecham antes.
  async function sairDaContaCelular(c) {
    const abertas = S.sessoes.filter((s) => s.account === c.id && s.status !== 'ended' && !s.login);
    if (abertas.some((s) => !s.hosted)) {
      return confirmarNoCelular({ titulo: 'Feche as janelas desta conta antes', texto: 'Uma sessão desta conta roda numa janela de terminal do computador. Feche essa janela e tente de novo.', sim: 'Entendi' });
    }
    const ok = await confirmarNoCelular({
      titulo: `Sair de ${c.nome}?`,
      texto: `O login de ${c.email} sai do computador${abertas.length ? ' e as sessões abertas nela fecham' : ''}. A conta e as conversas continuam: para usar de novo, é só entrar.`,
      sim: 'Sair da conta',
      perigo: true,
    });
    if (!ok) return;
    for (const s of abertas) mandar({ t: 'stop', instance: s.id });
    for (let i = 0; i < 40 && S.sessoes.some((s) => s.account === c.id && s.hosted && s.status !== 'ended' && !s.login); i++) await new Promise((r) => setTimeout(r, 250));
    mandar({ t: 'conta', op: 'sair', id: c.id }, (erro) => avisar(erro || `Você saiu de ${c.nome}`));
  }

  let lista = [];
  const caixaRapidas = el('ul', { class: 'lista-rapidas' });
  function desenharRapidas() {
    caixaRapidas.replaceChildren(
      ...lista.map((texto, i) =>
        el(
          'li',
          null,
          el('span', { text: texto }),
          el(
            'button',
            {
              class: 'so-icone',
              type: 'button',
              'aria-label': `Remover: ${texto}`,
              onclick: () => {
                lista = lista.filter((_, n) => n !== i);
                desenharRapidas();
                salvar({ op: 'rapidas', lista });
              },
            },
            icone('trash', 20),
          ),
        ),
      ),
    );
    if (!lista.length) caixaRapidas.append(el('li', { class: 'sem', text: 'Nenhuma mensagem rápida. Adicione uma abaixo.' }));
  }

  let montado = false;
  function atualizar() {
    if (montado || !S.pronto) return;
    montado = true;
    lista = [...S.prefs.rapidas];
    desenharRapidas();
    const nova = el('input', { id: 'op-nova-rapida', type: 'text', maxLength: 200, autocomplete: 'off', placeholder: 'Rode o lint e corrija o que aparecer.' });
    const adicionar = el('button', { class: 'botao', type: 'submit' }, icone('plus', 18), 'Adicionar');
    const formRapida = el('form', { class: 'campo', noValidate: true }, el('label', { for: nova.id, text: 'Nova mensagem rápida' }), nova, adicionar);
    formRapida.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = nova.value.trim();
      if (!t) return nova.focus();
      if (lista.length >= 12) return avisar('O limite é de 12 mensagens rápidas.');
      lista = [...lista, t];
      nova.value = '';
      desenharRapidas();
      salvar({ op: 'rapidas', lista });
    });
    const a = S.prefs.avisos;
    const desparear = duasVezes(el('button', { class: 'botao perigo', type: 'button' }, icone('sign-out', 18), el('span', { text: 'Desparear este celular' })), 'Desparear este celular', async () => {
      await fetch('/api/desparear', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      S.pareado = false;
      ws?.close();
      desenhar();
    });
    corpo.replaceChildren(
      grupo(
        'Aparência neste celular',
        escolhaUnica('Tema', [['sistema', 'Igual ao do celular'], ['claro', 'Claro'], ['escuro', 'Escuro']], LOCAL.tema, (v) => guardarLocal('tema', v)),
        escolhaUnica('Tamanho do texto', [['normal', 'Normal'], ['grande', 'Grande'], ['maior', 'Maior']], LOCAL.texto, (v) => guardarLocal('texto', v)),
        escolhaUnica('Pato', [['animado', 'Animado, com gracinhas'], ['calmo', 'Sem gracinhas'], ['parado', 'Parado'], ['nenhum', 'Sem pato']], LOCAL.pato, (v) => guardarLocal('pato', v)),
        caixinha('Mostrar na conversa as ferramentas que o Claude usa', LOCAL.ferramentas, (v) => guardarLocal('ferramentas', v)),
      ),
      grupo('Contas', el('p', { class: 'ajuda', text: 'Nome, cor e como cada conta começa uma sessão aberta pelo celular.' }), ...S.contas.map(blocoConta)),
      grupo(
        'Avisos',
        el('p', { class: 'ajuda', text: 'Valem para todos os celulares pareados que ativaram os avisos.' }),
        caixinha('Quando uma conta pedir permissão', a.perm, (v) => salvar({ op: 'avisos', perm: v })),
        caixinha('Quando uma sessão terminar a vez', a.fim, (v) => salvar({ op: 'avisos', fim: v })),
        caixinha('Quando um limite reiniciar', a.reset, (v) => salvar({ op: 'avisos', reset: v })),
        seletor('op-limiar', 'Avisar do reinício só se o uso tiver passado de', [[50, '50%'], [80, '80%'], [95, '95%']], a.limiar, (v) => salvar({ op: 'avisos', limiar: Number(v) })),
      ),
      grupo('Mensagens rápidas', el('p', { class: 'ajuda', text: 'Aparecem como botões acima da caixa de mensagem de cada sessão.' }), caixaRapidas, formRapida),
      grupo('Este celular', el('p', { class: 'ajuda', text: 'Desparear apaga o acesso deste celular. Para voltar, aponte a câmera para o código na janela do duckV.' }), desparear),
      window.duckvTrocarTela
        ? grupo(
            'Versão da tela',
            el('p', { class: 'ajuda', text: 'Num tablet ou computador, a versão para computador mostra as contas na lateral e várias sessões lado a lado.' }),
            el('button', { class: 'botao', type: 'button', onclick: () => window.duckvTrocarTela('computador') }, icone('desktop', 18), 'Usar a versão para computador'),
          )
        : null,
    );
  }
  return { raiz, atualizar, id: 'opcoes' };
}

// ------------------------------------------------------------ avisos (push)
async function ativarAvisos() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return desenhar();
    const reg = await navigator.serviceWorker.ready;
    const { key } = await (await fetch('/api/push/key', { credentials: 'same-origin' })).json();
    const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
    const r = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (!r.ok) throw new Error('recusado');
    localStorage.setItem('avisos', 'sim');
    avisar('Avisos ativados');
  } catch {
    avisar('Não consegui ativar os avisos. Tente de novo.');
  }
  desenhar();
}

// ------------------------------------------------------------ desenho geral
const tela = document.getElementById('tela');
let telaAtual = null;
let chaveAtual = '';

function rota() {
  const h = location.hash;
  let m = /^#\/s\/([^/]+)(?:\/(terminal|controles|ajustes))?$/.exec(h);
  try {
    if (m) return { tipo: 'sessao', id: decodeURIComponent(m[1]), aba: m[2] === 'ajustes' ? 'controles' : m[2] || 'conversa' };
    if (h === '#/opcoes') return { tipo: 'opcoes' };
    m = /^#\/nova\/([^/]+)$/.exec(h);
    if (m) return { tipo: 'nova', conta: decodeURIComponent(m[1]) };
  } catch {
    /* endereco invalido: cai no inicio */
  }
  return { tipo: 'inicio' };
}

function desenhar() {
  if (!S.pareado) {
    telaAtual?.fechar?.();
    telaAtual = null;
    chaveAtual = '';
    tela.replaceChildren(
      el(
        'div',
        { class: 'inteira' },
        el('h1', { text: 'Este aparelho ainda não foi conectado' }),
        el('p', { text: 'No computador, abra o duckV na tela Celulares e aponte a câmera para o código. No iPhone, use o app Câmera: o código abre aqui no Safari.' }),
        el('p', { text: 'Depois, o computador pede os 4 números que aparecem nesta tela.' }),
      ),
    );
    return;
  }
  const r = rota();
  const chave = r.tipo === 'sessao' ? `s:${r.id}` : r.tipo === 'nova' ? `n:${r.conta}` : r.tipo;
  if (chave !== chaveAtual) {
    telaAtual?.fechar?.();
    if (S.aberta) mandar({ t: 'close' });
    S.aberta = null;
    S.conversa = [];
    S.tela = null;
    chaveAtual = chave;
    if (r.tipo === 'sessao') {
      telaAtual = criarSessao(r.id, r.aba);
      S.aberta = r.id;
      tela.replaceChildren(telaAtual.raiz);
      telaAtual.conversa(true);
      mandar({ t: 'open', instance: r.id });
    } else if (r.tipo === 'nova') {
      telaAtual = criarNova(r.conta);
      tela.replaceChildren(telaAtual.raiz);
      window.scrollTo(0, 0);
    } else if (r.tipo === 'opcoes') {
      telaAtual = criarOpcoes();
      tela.replaceChildren(telaAtual.raiz);
      window.scrollTo(0, 0);
    } else {
      telaAtual = criarInicio();
      tela.replaceChildren(telaAtual.raiz);
      window.scrollTo(0, 0);
    }
    telaAtual.atualizar();
    telaAtual.montada?.();
    return;
  }
  telaAtual.atualizar();
}

window.addEventListener('hashchange', desenhar);
setInterval(desenhar, 20000); // mantem as contagens regressivas em dia

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

desenhar();
ligar();
