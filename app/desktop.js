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
      // "title" vira a dica propria do duckV (a do navegador e um balao cinza que nao segue o tema).
      else if (k === 'title') dicaEm(node, v);
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
  'sinal coracao': [[12, -4], [14, -4], [11, -3], [12, -3], [13, -3], [14, -3], [15, -3], [12, -2], [13, -2], [14, -2], [13, -1]],
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

function bicho(comGracinhas = true, opts = {}) {
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
  pista.definir = (estado) => {
    if (pista.dataset.estado === estado) return;
    pista.dataset.estado = estado;
    delete pista.dataset.truque;
    pista.reagir?.();
  };
  if (opts.tipo) vestirPato(pista, opts.tipo);
  if (opts.roteiro) roteiro(pista, opts.inicio ?? 0.1);
  else if (comGracinhas) {
    let sumiu = 0;
    const gracinha = () => {
      if (!pista.isConnected && ++sumiu > 3) return;
      const opcoes = TRUQUES[pista.dataset.estado] || [];
      if (pista.isConnected && opcoes.length && !document.hidden && !semMovimento.matches && LOCAL.pato === 'animado') {
        sumiu = 0;
        const truque = opcoes[Math.floor(Math.random() * opcoes.length)];
        pista.dataset.truque = truque;
        setTimeout(() => pista.dataset.truque === truque && delete pista.dataset.truque, DURACAO[truque]);
      }
      setTimeout(gracinha, 3500 + Math.random() * 6000);
    };
    setTimeout(gracinha, 1500 + Math.random() * 4000);
  }
  return pista;
}

// ------------------------------------------------------------ o roteiro do pato
// O pato que mora numa pista larga (em cima da caixa de mensagem, no cartao da conta) nao fica so
// indo e voltando: ele escolhe o que fazer conforme o estado da sessao. Trabalhando, caminha ate um
// ponto, para, bica como quem digita, olha em volta, bate as asas; esperando, quase nao sai do lugar
// e faz uma gracinha de vez em quando; pedindo, corre para perto do botao de enviar e pula; dormindo,
// senta e cochila. Trocar de estado interrompe o que ele estava fazendo, e ele segue de onde parou,
// sem saltos.
const sorteio = (opcoes) => {
  const total = opcoes.reduce((s, [, p]) => s + p, 0);
  let r = Math.random() * total;
  for (const [o, p] of opcoes) if ((r -= p) <= 0) return o;
  return opcoes[0][0];
};
const entre = (a, b) => a + Math.random() * (b - a);
const ROTEIROS = {
  trabalha: [['anda', 34], ['bica', 18], ['olha', 12], ['bate', 8], ['pulinho', 8], ['grasna', 7], ['pisca', 7], ['gira', 4], ['alonga', 2]],
  festa: [['corre', 50], ['pulinho', 20], ['bate', 15], ['gira', 15]],
  parado: [['respira', 14], ['pisca', 14], ['olha', 14], ['rabo', 10], ['passeio', 16], ['alonga', 10], ['senta', 8], ['cisca', 8], ['grasna', 6]],
  pede: [['chama', 70], ['bate', 20], ['olha', 10]],
  dorme: [['cochila', 80], ['espia', 20]],
  cansado: [['cochila', 100]],
};
// quanto dura cada gracinha (ms); as que ja existiam no CSS mantem o tempo delas
const TEMPO = { ...DURACAO, bica: 1500, gira: 700, alonga: 1500, respira: 2600, amor: 1500, senta: 0, cochila: 0 };
// curva de cada passada: sai devagar, anda, chega devagar
const passada = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function roteiro(pista, inicio = 0.1) {
  const trilho = pista.querySelector('.trilho');
  const bicho = pista.querySelector('.bicho');
  pista.dataset.roteiro = 'sim';
  // A posicao (px a partir da esquerda) mora so aqui e e escrita no trilho a cada quadro. Nada e lido
  // do estilo calculado: assim nao ha salto quando a conversa sai da tela ou a janela fica escondida.
  let x = null;
  let geracao = 0; // muda a cada troca de estado: o que estava em andamento para ali mesmo
  let fora = 0;
  const larguraLivre = () => Math.max(0, pista.clientWidth - bicho.offsetWidth);
  // Pista sem largura (fora da tela): a posicao nao e tocada, para nao "prender" o pato na ponta.
  const por = (v) => {
    x = pista.clientWidth ? Math.max(0, Math.min(larguraLivre(), v)) : v;
    trilho.style.transform = `translateX(${x.toFixed(2)}px)`;
  };
  const virar = (dir) => (pista.dataset.lado = dir > 0 ? 'dir' : 'esq');
  const visivel = () => pista.isConnected && pista.clientWidth > 0 && !document.hidden;
  const quieto = () => !visivel() || semMovimento.matches || LOCAL.pato === 'parado' || LOCAL.pato === 'escondido';
  // Lugar inicial: assim que a pista tem largura (antes do primeiro quadro pintado), sem passar pelo meio.
  const assentar = () => x === null && pista.clientWidth > 0 && por(larguraLivre() * inicio);
  // A pista encolheu e a borda passou do pato: ele desliza para dentro em vez de pular.
  let deslizando = 0;
  const deslizar = (L) => {
    trilho.style.transition = 'transform 600ms cubic-bezier(0.33, 0, 0.2, 1)';
    por(L);
    clearTimeout(deslizando);
    deslizando = setTimeout(() => (trilho.style.transition = ''), 620);
  };
  new ResizeObserver(() => {
    if (!pista.clientWidth) return;
    if (x === null) return assentar();
    const L = larguraLivre();
    if (x <= L) return;
    pista.reagir(); // um passo que ia alem da borda nova para aqui
    deslizar(L);
  }).observe(pista);
  // espera que acaba antes se o estado mudar
  const espera = (ms, g) =>
    new Promise((ok) => {
      const fim = Date.now() + ms;
      const tique = () => (g !== geracao || Date.now() >= fim ? ok(g === geracao) : setTimeout(tique, Math.min(120, fim - Date.now())));
      tique();
    });
  // Caminha ate o destino quadro a quadro. Pista escondida (outra aba, Terminal, janela minimizada):
  // o relogio do passo para junto e continua de onde estava quando ela volta.
  const andar = (destino, pxPorSegundo, g) =>
    new Promise((ok) => {
      const de = x;
      const ate = Math.max(0, Math.min(larguraLivre(), destino));
      const dist = Math.abs(ate - de);
      if (dist < 4) return ok(true);
      const duracao = (dist / pxPorSegundo) * 1000;
      virar(ate > de ? 1 : -1);
      pista.dataset.anda = pxPorSegundo > 90 ? 'corre' : 'sim';
      let andado = 0;
      let antes = performance.now();
      const quadro = (agora) => {
        const dt = Math.min(agora - antes, 50); // nunca um pulo maior que um quadro lento
        antes = agora;
        if (g !== geracao) return fim(false);
        if (visivel()) andado += dt;
        const p = Math.min(1, andado / duracao);
        const alvo = de + (ate - de) * passada(p);
        // a pista encolheu no meio do passo (um painel abriu ao lado): para e desliza para dentro
        const L = larguraLivre();
        if (pista.clientWidth && alvo > L + 0.5) {
          deslizar(L);
          return fim(false);
        }
        por(alvo);
        if (p >= 1) return fim(true);
        requestAnimationFrame(quadro);
      };
      const fim = (chegou) => {
        delete pista.dataset.anda;
        ok(chegou && g === geracao);
      };
      requestAnimationFrame(quadro);
    });
  async function truque(nome, g, ms = TEMPO[nome] || 900) {
    pista.dataset.truque = nome;
    const seguiu = await espera(ms, g);
    if (pista.dataset.truque === nome) delete pista.dataset.truque;
    return seguiu;
  }
  async function passo(estado, g) {
    const L = larguraLivre();
    const acao = sorteio(ROTEIROS[estado] || ROTEIROS.parado);
    // "Sem gracinhas": so anda quando trabalha
    if (LOCAL.pato === 'calmo' && !['anda', 'corre', 'chama', 'cochila', 'respira'].includes(acao)) return espera(1500, g);
    switch (acao) {
      case 'anda': {
        // um trecho de um quarto a dois tercos da pista, sem ir sempre para o mesmo lado
        const alvo = x + (Math.random() < 0.5 ? -1 : 1) * entre(L * 0.25, L * 0.65);
        await andar(alvo < 0 || alvo > L ? x - (alvo - x) : alvo, entre(45, 80), g);
        return espera(entre(200, 700), g);
      }
      case 'corre':
        await andar(x < L / 2 ? entre(L * 0.7, L) : entre(0, L * 0.3), entre(120, 170), g);
        return truque('pulinho', g);
      case 'passeio':
        await andar(x + (Math.random() < 0.5 ? -1 : 1) * entre(24, 70), entre(25, 38), g);
        return espera(entre(800, 1800), g);
      case 'chama':
        // perto do botao de enviar (a direita) e virado para a pessoa
        if (x < L * 0.75) await andar(entre(L * 0.8, L), 110, g);
        if (g === geracao) virar(-1);
        return espera(entre(1400, 2600), g);
      case 'senta':
        pista.dataset.truque = 'senta';
        await espera(entre(3000, 6000), g);
        if (pista.dataset.truque === 'senta') delete pista.dataset.truque;
        return g === geracao && truque('alonga', g);
      case 'respira':
        return espera(entre(1200, 2400), g);
      case 'cochila':
        return espera(entre(4000, 8000), g);
      case 'olha':
        await truque('olha', g, 700);
        if (g === geracao) virar(pista.dataset.lado === 'esq' ? 1 : -1);
        return espera(entre(500, 1100), g);
      default:
        return truque(acao, g);
    }
  }
  async function viver() {
    while (true) {
      if (!pista.isConnected) {
        if (++fora > 120) return; // saiu da tela de vez (painel fechado)
        await new Promise((ok) => setTimeout(ok, 1000));
        continue;
      }
      fora = 0;
      assentar();
      if (x === null || quieto()) {
        await new Promise((ok) => setTimeout(ok, 600));
        continue;
      }
      const g = geracao;
      await passo(pista.dataset.estado, g);
      if (g === geracao) await espera(entre(250, 900), g);
    }
  }
  // troca de estado: o passo em andamento para onde estiver (a posicao ja esta em x)
  pista.reagir = () => {
    geracao++;
    delete pista.dataset.anda;
  };
  // Um clique no pato: ele reage (coracao, giro ou pulinho com grasnado).
  bicho.addEventListener('click', () => {
    if (quieto()) return;
    const r = ['amor', 'gira', 'pulinho', 'grasna'][Math.floor(Math.random() * 4)];
    pista.reagir();
    pista.dataset.truque = r;
    setTimeout(() => pista.dataset.truque === r && delete pista.dataset.truque, TEMPO[r] || 900);
  });
  viver();
}

// ------------------------------------------------------------ tipos de patinho
// Os mesmos do celular: cada conta escolhe o seu, e a cor da conta vem junto. O pato e pintado pelas
// variaveis --pato-* no proprio elemento, entao o pato da caixa de mensagem e o da conta sao o mesmo.
const TIPOS_PATO = [
  { id: 'classico', nome: 'Clássico', sobre: 'Branquinho, bico amarelo', penas: '#fff6ee', asa: '#e6d3bf', bico: '#ffd84a', pe: '#ff9a3d', cor: '#ff7a1a' },
  { id: 'borracha', nome: 'De borracha', sobre: 'O da banheira', penas: '#ffd23f', asa: '#f2b705', bico: '#ff8a00', pe: '#ff8a00', cor: '#f2a900' },
  { id: 'marreco', nome: 'Marreco', sobre: 'Cabeça verde de lago', penas: '#d9c7a8', asa: '#8c6e4e', bico: '#e8c547', pe: '#f28c28', cor: '#2b8a6e', cabeca: '#2e7d4f' },
  { id: 'pessego', nome: 'Pêssego', sobre: 'Rosado e fofo', penas: '#ffdccb', asa: '#f7b79a', bico: '#ff8a65', pe: '#ff8a65', cor: '#f26b4e' },
  { id: 'chocolate', nome: 'Chocolate', sobre: 'Marrom de quintal', penas: '#9a6644', asa: '#6b4226', bico: '#f2b24c', pe: '#e07b39', cor: '#b5651d' },
  { id: 'mar', nome: 'Do mar', sobre: 'Penas cinza-azuladas', penas: '#e6eef5', asa: '#9ec3dd', bico: '#ffc94a', pe: '#6fa8dc', cor: '#3d8bfd' },
  { id: 'noturno', nome: 'Noturno', sobre: 'Plumagem de madrugada', penas: '#4a4152', asa: '#6e6279', bico: '#ffb347', pe: '#ffb347', cor: '#7e57c2', contorno: '#15111a' },
  { id: 'rosa', nome: 'Rosa', sobre: 'Para quem gosta de cor', penas: '#ffc9df', asa: '#f48fb1', bico: '#ffd84a', pe: '#f06292', cor: '#e0569a' },
];
const tipoPato = (id) => TIPOS_PATO.find((t) => t.id === id) || TIPOS_PATO[0];
function vestirPato(no, id) {
  const t = tipoPato(id);
  if (!no || no.dataset.tipo === t.id) return;
  no.dataset.tipo = t.id;
  no.style.setProperty('--pato-penas', t.penas);
  no.style.setProperty('--pato-asa', t.asa);
  no.style.setProperty('--pato-bico', t.bico);
  no.style.setProperty('--pato-pe', t.pe);
  no.style.setProperty('--pato-cabeca', t.cabeca || t.penas);
  if (t.contorno) no.style.setProperty('--pato-contorno-claro', t.contorno);
  else no.style.removeProperty('--pato-contorno-claro');
}
const miniPato = (estado, cor, tipo) => {
  const p = bicho(false);
  p.definir(estado);
  const caixa = el('span', { class: 'mini-pato' }, p);
  if (cor) caixa.style.setProperty('--cor', cor);
  vestirPato(caixa, tipo);
  caixa.definir = p.definir;
  caixa.vestir = (t) => vestirPato(caixa, t);
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
      if (m.github) {
        const mudouLogin = S.github?.login !== m.github.login;
        S.github = m.github;
        ouvintesGithub.forEach((f) => f(mudouLogin));
      }
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
  if (s.status === 'waiting') return s.origem === 'nuvem' || s.origem === 'cowork' ? s.activity || 'Pede algo na nuvem' : 'Pede permissão no terminal';
  if (s.status === 'working') return s.activity || 'Trabalhando';
  if (s.status === 'error') return s.activity || 'Parou com erro';
  return s.lastText || 'Esperando sua mensagem';
}
const estadoDoPato = (s) => (s.status === 'ended' ? 'dorme' : precisa(s) ? 'pede' : s.status === 'working' ? 'trabalha' : 'parado');
// Equipes ("Todas as contas"): sessoes abertas juntas, uma por conta, dividindo a mesma tarefa. Elas
// aparecem num bloco so, na ordem dos patos. A que terminou fica no bloco com o pato dormindo, ate o
// duckV esquecer dela.
function equipes() {
  const mapa = new Map();
  for (const s of S.sessoes) {
    if (!s.equipe?.id) continue;
    const g = mapa.get(s.equipe.id) || { id: s.equipe.id, sessoes: [] };
    g.sessoes.push(s);
    mapa.set(g.id, g);
  }
  for (const g of mapa.values()) g.sessoes.sort((a, b) => (a.equipe.ordem || 0) - (b.equipe.ordem || 0));
  return [...mapa.values()];
}
// Mantem um bloco por equipe dentro de um container, criando e tirando conforme elas abrem e fecham.
function sincronizarEquipes(caixa, blocos, opts) {
  const times = equipes();
  for (const g of times) {
    let b = blocos.get(g.id);
    if (!b) {
      b = blocoEquipe(opts);
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
  return times.length;
}

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
// Anel do contexto ao lado do botao de enviar, como no app do Claude: enche conforme a conversa ocupa a memoria.
function anelContexto() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const circ = (classe) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '12');
    c.setAttribute('r', '9');
    c.setAttribute('pathLength', '100');
    c.setAttribute('class', classe);
    svg.append(c);
    return c;
  };
  circ('fundo');
  const cheio = circ('cheio');
  const numero = el('b');
  const raiz = el('span', { class: 'anel-ctx', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', hidden: true }, svg, numero);
  raiz.definir = (pct, cor, dica) => {
    raiz.hidden = pct == null;
    if (pct == null) return;
    const p = Math.max(0, Math.min(100, pct));
    numero.textContent = `${Math.round(p)}%`;
    cheio.style.strokeDasharray = `${p} 100`;
    raiz.style.setProperty('--cor', cor || 'var(--laranja)');
    raiz.dataset.alto = p >= 80 ? 'sim' : 'nao';
    raiz.setAttribute('aria-valuenow', String(Math.round(p)));
    raiz.setAttribute('aria-label', `Contexto ${Math.round(p)}% usado`);
    dicaEm(raiz, dica);
  };
  return { raiz, definir: raiz.definir };
}
function chipAgente(conta) {
  const ag = agenteDaConta(conta);
  const c = el('span', { class: 'agente', title: ag.nome }, el('i'), ag.curto || ag.nome);
  if (ag.cor) c.style.setProperty('--ag', ag.cor);
  return c;
}

// De onde cada sessao vem. As do computador sao o caso comum e ficam sem selo; o resto se identifica.
const ORIGENS = {
  duckv: { rotulo: 'duckV', longo: 'Aberta pelo duckV', icone: 'terminal-window' },
  terminal: { rotulo: 'Terminal', longo: 'Terminal do computador', icone: 'terminal-window' },
  app: { rotulo: 'App Claude', longo: 'App Claude do computador', icone: 'monitor', selo: true },
  desktop: { rotulo: 'App Claude', longo: 'App Claude do computador', icone: 'monitor', selo: true },
  historico: { rotulo: 'Guardada', longo: 'Conversa guardada neste computador', icone: 'clock-counter-clockwise' },
  conta: { rotulo: 'Computador', longo: 'Conversa guardada neste computador', icone: 'clock-counter-clockwise' },
  nuvem: { rotulo: 'Nuvem', longo: 'Claude Code na nuvem', icone: 'cloud', selo: true },
  cowork: { rotulo: 'Cowork', longo: 'Tarefa do Cowork', icone: 'briefcase', selo: true },
};
const origemDe = (s) => ORIGENS[s?.origem] || ORIGENS.terminal;
function seloOrigem(origem, comTexto = true) {
  const o = ORIGENS[origem] || ORIGENS.terminal;
  return el('span', { class: 'origem', 'data-o': origem, title: o.longo }, icone(o.icone, 14), comTexto ? o.rotulo : null);
}
// Icone de cada ferramenta nas atividades da conversa.
const ICONE_FERRAMENTA = (nome = '') =>
  /^(Bash|PowerShell|BashOutput|KillShell|Monitor)$/.test(nome) ? 'terminal-window'
    : /^(Edit|MultiEdit|Write|NotebookEdit)$/.test(nome) ? 'pencil-simple'
      : /^(Read|NotebookRead)$/.test(nome) ? 'file-text'
        : /^(Grep|Glob|LS|ToolSearch)$/.test(nome) ? 'magnifying-glass'
          : /^(TodoWrite|TaskCreate|TaskUpdate|TaskList)$/.test(nome) ? 'list-checks'
            : /^(WebFetch|WebSearch)$/.test(nome) || nome.startsWith('mcp__') ? 'globe'
              : /^(Task|Agent|Skill|Workflow)$/.test(nome) ? 'sparkle'
                : 'wrench';
const nomeFerramenta = (nome = '') => (nome.startsWith('mcp__') ? nome.split('__').slice(1).join(' · ') : nome);

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
      const lingua = l.replace(/^```/, '').trim().split(/\s/)[0];
      const corpo = [];
      i++;
      while (i < linhas.length && !/^```/.test(linhas[i])) corpo.push(linhas[i++]);
      i++;
      raiz.append(blocoDeCodigo(lingua, corpo.join('\n')));
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
// Bloco de codigo com a linguagem no cabecalho e o botao de copiar ao lado, como nos apps de agentes.
function blocoDeCodigo(lingua, codigo) {
  const copiar = el('button', { class: 'codigo-copiar', type: 'button', title: 'Copiar o código' }, icone('copy', 14), el('span', { text: 'Copiar' }));
  copiar.addEventListener('click', () =>
    navigator.clipboard.writeText(codigo).then(() => {
      copiar.dataset.ok = 'sim';
      copiar.lastChild.textContent = 'Copiado';
      setTimeout(() => {
        delete copiar.dataset.ok;
        copiar.lastChild.textContent = 'Copiar';
      }, 1600);
    }),
  );
  return el('figure', { class: 'codigo' }, el('figcaption', null, el('span', { text: lingua || 'código' }), copiar), el('pre', { tabIndex: 0 }, el('code', { text: codigo })));
}
// Uma linha de atividade: icone da ferramenta, nome e o que ela fez.
const linhaAtividade = (m) => el('li', null, icone(ICONE_FERRAMENTA(m.tool), 15), el('b', { text: nomeFerramenta(m.tool) }), el('span', { text: m.text || '' }));
// Ferramentas seguidas viram um bloco so de "atividade", que abre com um clique.
function grupoAtividade(primeira) {
  const resumo = el('span', { class: 'resumo' });
  const qtd = el('b');
  const ic = el('span', { class: 'ic' });
  const cab = el('button', { class: 'atividade-cab', type: 'button', 'aria-expanded': 'false' }, ic, qtd, resumo, icone('caret-down', 14));
  const lista = el('ol', { class: 'atividade-lista' });
  const g = el('div', { class: 'm atividade', 'data-aberto': 'nao' }, cab, el('div', { class: 'atividade-corpo' }, lista));
  cab.addEventListener('click', () => {
    const abrir = g.dataset.aberto !== 'sim';
    g.dataset.aberto = abrir ? 'sim' : 'nao';
    cab.setAttribute('aria-expanded', String(abrir));
  });
  g.somar = (m) => {
    lista.append(linhaAtividade(m));
    const n = lista.childElementCount;
    ic.replaceChildren(icone(ICONE_FERRAMENTA(m.tool), 15));
    qtd.textContent = n > 1 ? `${n} ações` : nomeFerramenta(m.tool);
    resumo.textContent = n > 1 ? `${nomeFerramenta(m.tool)} ${m.text || ''}`.trim() : m.text || '';
    g.dataset.ultima = m.tool || '';
  };
  g.somar(primeira);
  return g;
}
// Separador de horario quando a conversa ficou parada um tempo (ou mudou de dia).
function marcaDeTempo(ts) {
  const d = new Date(ts);
  const hoje = new Date(agora());
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const dia = d.toDateString() === hoje.toDateString() ? 'Hoje' : d.toDateString() === ontem.toDateString() ? 'Ontem' : fData.format(d);
  return el('div', { class: 'quando', role: 'separator' }, el('span', { text: `${dia}, ${fHora.format(d)}` }));
}
function criarMensagem(m) {
  if (m.role === 'tool') return grupoAtividade(m);
  if (m.role === 'sys') return el('div', { class: 'm sys', text: m.text });
  if (m.role === 'image' && /^[0-9a-f]{24}$/.test(m.img || '')) {
    const src = `/api/img/${m.img}`;
    return el('div', { class: `m imagem ${m.via === 'user' ? 'user' : ''}` }, el('button', { class: 'anexo-miniatura grande', type: 'button', title: 'Clique para ampliar', onclick: () => ampliarImagem(src, 'Imagem da conversa') }, el('img', { src, alt: 'Imagem da conversa', loading: 'lazy' })));
  }
  if (m.role === 'file') {
    const a = S.arquivos.find((x) => x.id === m.arq);
    return el('div', { class: 'm arquivo' }, icone('paperclip', 18), el('span', null, el('b', { text: a?.nome || 'Arquivo enviado ao celular' }), m.text ? ` · ${m.text}` : ''));
  }
  if (m.role === 'user') {
    const { texto, itens } = anexosDoTexto(m.text);
    return el(
      'div',
      { class: 'm user' },
      itens.length ? el('div', { class: 'anexos-msg' }, itens.map(anexoNaConversa)) : null,
      texto ? markdown(texto) : null,
      m.via === 'celular' ? el('span', { class: 'via', text: 'Enviada pelo duckV' }) : null,
    );
  }
  const copiar = el('button', { class: 'so-icone copiar-msg', type: 'button', 'aria-label': 'Copiar resposta', title: 'Copiar resposta' }, icone('copy', 16));
  copiar.addEventListener('click', () => navigator.clipboard.writeText(m.text || '').then(() => avisar('Resposta copiada')));
  return el('div', { class: 'm assistant' }, markdown(m.text), copiar);
}
const visiveis = (itens) => (LOCAL.ferramentas ? itens : itens.filter((m) => m.role !== 'tool'));

// Caminhos de anexos (pasta data/anexos do duckV) dentro de uma mensagem: saem do texto e viram
// miniatura (imagem) ou cartao (outro arquivo). Vale para o formato novo (um caminho por linha, no fim)
// e para o antigo (caminho no meio do texto, sem espacos).
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
    img.addEventListener('error', () => img.replaceWith(el('span', { class: 'anexo-sumiu', text: `${a.nome} (o arquivo não está mais no computador)` })), { once: true });
    return el('button', { class: 'anexo-miniatura', type: 'button', title: `${a.nome}\nClique para ampliar`, onclick: () => ampliarImagem(a.url, a.nome) }, img);
  }
  return el('a', { class: 'anexo-cartao', href: a.url, download: a.nome, title: 'Baixar' }, icone('paperclip', 16), el('span', { text: a.nome }));
}
// Imagem em tela cheia, num dialogo proprio (Esc ou clique fora fecha).
function ampliarImagem(src, nome) {
  const d = el('dialog', { class: 'ampliada', 'aria-label': nome || 'Imagem' }, el('img', { src, alt: nome || '' }), el('button', { class: 'so-icone fechar-ampliada', type: 'button', 'aria-label': 'Fechar', onclick: () => d.close() }, icone('x', 20)));
  d.addEventListener('click', (ev) => ev.target === d && d.close());
  d.addEventListener('close', () => setTimeout(() => d.remove(), 200));
  document.body.append(d);
  d.showModal();
}

// ------------------------------------------------------------ menus e confirmacoes
let menuAberto = null;
let menuAncora = null;
function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
  if (menuAncora?.dataset.menu) {
    menuAncora.removeAttribute('aria-expanded');
    delete menuAncora.dataset.menu;
  }
  menuAncora = null;
}
function abrirMenu(ancora, itens) {
  const mesmo = menuAncora === ancora;
  fecharMenu();
  if (mesmo) return; // clicar de novo no mesmo botao fecha o menu
  menuAncora = ancora;
  // Botoes que so abrem este menu dizem que ele esta aberto (a linha da conta usa aria-expanded para outra coisa).
  if (ancora.tagName === 'BUTTON' && !ancora.hasAttribute('aria-expanded')) {
    ancora.dataset.menu = 'sim';
    ancora.setAttribute('aria-expanded', 'true');
  }
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
window.addEventListener('resize', () => fecharMenu());
document.addEventListener('pointerdown', (ev) => {
  if (menuAberto && !menuAberto.contains(ev.target) && !menuAncora?.contains(ev.target)) fecharMenu();
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

// ------------------------------------------------------------ controles proprios
// Nada de controle do navegador na tela: menus suspensos, interruptores, confirmacoes e dicas sao
// desenhados aqui, no tema do duckV, com o mesmo teclado dos controles nativos.
const temPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
let seqControle = 0;

// Menu suspenso (o "exposed dropdown" do Material 3). A lista abre na camada de cima da pagina
// (popover), entao funciona tambem dentro de dialogos e nunca e cortada pela rolagem.
// Uso: const s = seletor({ opcoes: [{ v, t, apoio }], valor, aoMudar, rotulo });
//      s.value, s.disabled e s.definirOpcoes(lista) funcionam como num <select>; s dispara 'change'.
function seletor({ opcoes = [], valor, aoMudar, rotulo, id } = {}) {
  const idLista = `seletor-${++seqControle}`;
  let lista = [];
  let atual = valor == null ? '' : String(valor);
  let ativo = -1;
  let desligado = false;
  const texto = el('span', { class: 'seletor-texto' });
  const campo = el(
    'button',
    { class: 'seletor-campo', type: 'button', id, role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': idLista, 'aria-label': rotulo || null },
    texto,
    el('span', { class: 'seletor-seta', 'aria-hidden': 'true' }, icone('caret-down', 18)),
  );
  const caixa = el('div', { class: 'seletor-lista', role: 'listbox', id: idLista, tabIndex: -1, 'aria-label': rotulo || null });
  if (temPopover) caixa.popover = 'auto';
  else caixa.hidden = true;
  const raiz = el('div', { class: 'seletor' }, campo, caixa);
  const aberto = () => campo.getAttribute('aria-expanded') === 'true';
  const indice = (v) => lista.findIndex((o) => o.v === v);

  function pintarCampo() {
    const o = lista[indice(atual)];
    texto.textContent = o ? o.t : '';
    texto.classList.toggle('vazio', !o);
  }
  function desenharOpcoes() {
    caixa.replaceChildren(
      ...lista.map((o, i) =>
        el(
          'div',
          {
            class: 'seletor-opcao',
            role: 'option',
            id: `${idLista}-${i}`,
            'aria-selected': String(o.v === atual),
            'aria-disabled': o.desligado ? 'true' : null,
            onpointermove: () => i !== ativo && marcar(i),
            onclick: () => !o.desligado && escolher(i),
          },
          el('span', { class: 'marca', 'aria-hidden': 'true' }, o.v === atual ? icone('check', 18) : null),
          el('span', { class: 't' }, el('b', { text: o.t }), o.apoio ? el('span', { text: o.apoio }) : null),
        ),
      ),
    );
  }
  function marcar(i) {
    ativo = i;
    [...caixa.children].forEach((n, k) => n.classList.toggle('ativa', k === i));
    if (i >= 0) {
      caixa.setAttribute('aria-activedescendant', `${idLista}-${i}`);
      caixa.children[i]?.scrollIntoView({ block: 'nearest' });
    } else caixa.removeAttribute('aria-activedescendant');
  }
  // A lista abre colada no campo, para baixo; sem espaco embaixo, abre para cima.
  function posicionar() {
    const r = campo.getBoundingClientRect();
    const alturaMax = 320;
    const embaixo = innerHeight - r.bottom - 12;
    const emCima = r.top - 12;
    const paraCima = embaixo < Math.min(alturaMax, caixa.scrollHeight) && emCima > embaixo;
    caixa.style.minWidth = `${Math.round(r.width)}px`;
    caixa.style.maxHeight = `${Math.max(120, Math.min(alturaMax, paraCima ? emCima : embaixo))}px`;
    const w = caixa.offsetWidth;
    caixa.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
    if (paraCima) {
      caixa.style.top = 'auto';
      caixa.style.bottom = `${Math.round(innerHeight - r.top + 4)}px`;
    } else {
      caixa.style.bottom = 'auto';
      caixa.style.top = `${Math.round(r.bottom + 4)}px`;
    }
    caixa.dataset.lado = paraCima ? 'cima' : 'baixo';
  }
  const aoRolar = (ev) => !caixa.contains(ev.target) && fechar(false);
  function abrir() {
    if (desligado || aberto() || !lista.length) return;
    desenharOpcoes();
    if (temPopover) caixa.showPopover();
    else caixa.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
    posicionar();
    marcar(Math.max(0, indice(atual)));
    caixa.focus({ preventScroll: true });
    addEventListener('scroll', aoRolar, true);
    addEventListener('resize', aoRolar);
  }
  function fechar(focarCampo = true) {
    if (!aberto()) return;
    campo.setAttribute('aria-expanded', 'false');
    removeEventListener('scroll', aoRolar, true);
    removeEventListener('resize', aoRolar);
    if (temPopover) {
      try {
        caixa.hidePopover();
      } catch {
        /* ja fechado */
      }
    } else caixa.hidden = true;
    if (focarCampo) campo.focus({ preventScroll: true });
  }
  // Clicar fora ou apertar Esc fecha o popover sozinho: o campo so acompanha.
  caixa.addEventListener('toggle', (ev) => ev.newState === 'closed' && aberto() && fechar(caixa.contains(document.activeElement) || document.activeElement === document.body));
  function escolher(i) {
    const o = lista[i];
    fechar();
    if (!o || o.v === atual) return;
    atual = o.v;
    pintarCampo();
    aoMudar?.(o.v);
    raiz.dispatchEvent(new Event('change'));
  }
  // Digitar o comeco de uma opcao pula para ela, como num menu do sistema.
  let busca = '';
  let buscaTimer = null;
  function procurar(letra) {
    busca += semAcento(letra);
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => (busca = ''), 600);
    const de = aberto() ? ativo : indice(atual);
    const ordem = [...lista.keys()].map((k) => (k + de + (busca.length === 1 ? 1 : 0)) % lista.length);
    return ordem.find((k) => !lista[k].desligado && semAcento(lista[k].t).startsWith(busca)) ?? -1;
  }
  const proxima = (de, passo) => {
    for (let k = 1; k <= lista.length; k++) {
      const i = (de + passo * k + lista.length * k) % lista.length;
      if (!lista[i].desligado) return i;
    }
    return de;
  };
  campo.addEventListener('click', () => (aberto() ? fechar() : abrir()));
  campo.addEventListener('keydown', (ev) => {
    if (['ArrowDown', 'ArrowUp', 'F4'].includes(ev.key) || (ev.altKey && ev.key === 'ArrowDown')) {
      ev.preventDefault();
      abrir();
    } else if (ev.key.length === 1 && ev.key !== ' ' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const i = procurar(ev.key);
      if (i >= 0) escolher(i);
    }
  });
  caixa.addEventListener('keydown', (ev) => {
    const k = ev.key;
    if (k === 'ArrowDown') marcar(proxima(ativo, 1));
    else if (k === 'ArrowUp') marcar(proxima(ativo, -1));
    else if (k === 'Home') marcar(proxima(-1, 1));
    else if (k === 'End') marcar(proxima(lista.length, -1));
    else if (k === 'Enter' || k === ' ') escolher(ativo);
    else if (k === 'Escape') fechar();
    else if (k === 'Tab') return fechar();
    else if (k.length === 1 && !ev.ctrlKey && !ev.metaKey) {
      const i = procurar(k);
      if (i >= 0) marcar(i);
    } else return;
    ev.preventDefault();
    ev.stopPropagation();
  });

  raiz.definirOpcoes = (novas) => {
    lista = novas.map((o) => (Array.isArray(o) ? { v: String(o[0]), t: o[1] } : { ...o, v: String(o.v) }));
    if (indice(atual) < 0) atual = lista[0]?.v ?? '';
    pintarCampo();
    if (aberto()) desenharOpcoes();
  };
  Object.defineProperties(raiz, {
    value: {
      get: () => atual,
      set: (v) => {
        const s = v == null ? '' : String(v);
        if (indice(s) >= 0) atual = s;
        pintarCampo();
      },
    },
    disabled: {
      get: () => desligado,
      set: (v) => {
        desligado = !!v;
        campo.disabled = desligado;
        if (desligado) fechar(false);
      },
    },
  });
  raiz.focus = () => campo.focus();
  raiz.definirOpcoes(opcoes);
  return raiz;
}

// Interruptor do Material 3: trilho, botao que cresce ao ligar e a marca de feito dentro dele.
function interruptor(marcado, aoMudar, rotulo) {
  const b = el('button', { class: 'interruptor', type: 'button', role: 'switch', 'aria-checked': String(!!marcado), 'aria-label': rotulo }, el('span', { class: 'polegar', 'aria-hidden': 'true' }, icone('check', 14)));
  b.addEventListener('click', async () => {
    const novo = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(novo));
    const r = await aoMudar(novo);
    if (r === false) b.setAttribute('aria-checked', String(!novo));
  });
  return b;
}

// Confirmacao propria (no lugar do confirm() do navegador). Resolve true ou false.
function confirmar({ titulo, texto, sim = 'Confirmar', perigo = false }) {
  return new Promise((resolver) => {
    const { d, corpo, pe, form } = dialogo(titulo, texto);
    d.classList.add('curto');
    corpo.remove();
    let resposta = false;
    const ok = el('button', { class: `botao ${perigo ? 'perigo' : 'principal'}`, type: 'submit', text: sim });
    pe.append(el('button', { class: 'botao texto', type: 'button', text: 'Cancelar', onclick: () => d.close() }), ok);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      resposta = true;
      d.close();
    });
    d.addEventListener('close', () => resolver(resposta));
    d.showModal();
    ok.focus();
  });
}

// Pergunta com campo de texto (no lugar do prompt() do navegador). Resolve o texto ou null.
function perguntar({ titulo, texto, rotulo, dica = '', sim = 'Enviar' }) {
  return new Promise((resolver) => {
    const { d, corpo, pe, form } = dialogo(titulo, texto);
    d.classList.add('curto');
    let resposta = null;
    const campo = el('textarea', { class: 'campo-texto', rows: 3, maxLength: 2000, placeholder: dica, 'aria-label': rotulo || titulo });
    campo.addEventListener('keydown', (ev) => ev.key === 'Enter' && !ev.shiftKey && (ev.preventDefault(), form.requestSubmit()));
    corpo.append(campo);
    pe.append(el('button', { class: 'botao texto', type: 'button', text: 'Cancelar', onclick: () => d.close() }), el('button', { class: 'botao principal', type: 'submit', text: sim }));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!campo.value.trim()) return campo.focus();
      resposta = campo.value.trim();
      d.close();
    });
    d.addEventListener('close', () => resolver(resposta));
    d.showModal();
    campo.focus();
  });
}

// Dicas ao parar o mouse (ou ao chegar pelo Tab): um balao do tema no lugar do "title" do navegador.
// Elas ficam na camada de cima, entao aparecem tambem sobre dialogos.
function dicaEm(no, texto) {
  if (texto) {
    no.dataset.dica = texto;
    if (!no.hasAttribute('aria-label') && !no.textContent.trim()) no.setAttribute('aria-label', String(texto).split('\n')[0]);
  } else delete no.dataset.dica;
}
const balao = el('div', { class: 'dica', role: 'tooltip', 'aria-hidden': 'true' });
if (temPopover) balao.popover = 'manual';
let dicaAlvo = null;
let dicaTimer = null;
function esconderDica() {
  clearTimeout(dicaTimer);
  dicaAlvo = null;
  if (balao.isConnected) balao.classList.remove('mostra');
}
function mostrarDica(alvo, demora) {
  clearTimeout(dicaTimer);
  dicaAlvo = alvo;
  dicaTimer = setTimeout(() => {
    if (dicaAlvo !== alvo || !alvo.isConnected || !alvo.dataset.dica) return;
    balao.textContent = alvo.dataset.dica;
    if (!balao.isConnected) document.body.append(balao);
    if (temPopover) {
      try {
        balao.hidePopover();
        balao.showPopover(); // reabrir poe o balao acima de um dialogo aberto depois dele
      } catch {
        /* sem camada de cima */
      }
    }
    const r = alvo.getBoundingClientRect();
    const w = balao.offsetWidth;
    const h = balao.offsetHeight;
    const embaixo = r.bottom + 8 + h < innerHeight - 8;
    balao.style.left = `${Math.round(Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)))}px`;
    balao.style.top = `${Math.round(embaixo ? r.bottom + 8 : r.top - h - 8)}px`;
    balao.dataset.lado = embaixo ? 'baixo' : 'cima';
    balao.classList.add('mostra');
  }, demora);
}
document.addEventListener('pointerover', (ev) => {
  const alvo = ev.target.closest?.('[data-dica]');
  if (alvo === dicaAlvo) return;
  if (!alvo) return esconderDica();
  mostrarDica(alvo, 450);
});
document.addEventListener('focusin', (ev) => {
  const alvo = ev.target.closest?.('[data-dica]');
  if (alvo && ev.target.matches?.(':focus-visible')) mostrarDica(alvo, 250);
  else esconderDica();
});
for (const tipo of ['pointerdown', 'keydown', 'scroll', 'focusout']) document.addEventListener(tipo, esconderDica, true);
window.addEventListener('blur', esconderDica);

// Troca de tela com movimento: o conteudo novo chega com um leve fade e subida (padrao "fade through"
// do Material). Quem pediu menos movimento no sistema ve a troca direta.
function animarEntrada(no, classe = 'entra') {
  if (!no || semMovimento.matches) return;
  no.classList.remove(classe);
  void no.offsetWidth; // reinicia a animacao
  no.classList.add(classe);
  no.addEventListener('animationend', () => no.classList.remove(classe), { once: true });
}
// Saida curta antes de tirar um elemento da tela.
function animarSaida(no, classe = 'sai') {
  if (!no?.isConnected || semMovimento.matches) return Promise.resolve();
  return new Promise((ok) => {
    no.classList.add(classe);
    const fim = () => ok();
    no.addEventListener('animationend', fim, { once: true });
    setTimeout(fim, 260);
  });
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
            perguntar({ titulo: o.rotulo, texto: 'O agente espera uma resposta escrita.', rotulo: o.rotulo }).then((resposta) => resposta && mandar({ t: 'responder', instance: sessao.id, tecla: o.tecla, texto: resposta }, (erro) => erro && avisar(erro)));
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
  // Na nuvem ou no Cowork, a resposta e la: o cartao diz o que ela pede e leva ate onde responder.
  if (sessao.origem === 'nuvem' || sessao.origem === 'cowork') {
    return el(
      'section',
      { class: 'pedido local', 'data-id': `local-${sessao.id}` },
      comOrigem ? origem(conta, sessao) : null,
      el('h3', null, icone(sessao.origem === 'nuvem' ? 'cloud' : 'briefcase', 18), sessao.origem === 'nuvem' ? 'Esperando você na nuvem' : 'Esperando você no Cowork'),
      el('p', { class: 'oque', text: sessao.activity || 'A sessão parou e espera uma resposta sua.' }),
      sessao.link ? el('div', { class: 'botoes' }, el('a', { class: 'botao principal', href: sessao.link, target: '_blank', rel: 'noopener noreferrer' }, icone('arrow-up-right', 18), 'Responder no claude.ai')) : el('p', { class: 'oque', text: 'Responda pelo app Claude do computador.' }),
    );
  }
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
// Sessoes recem-abertas pelo popup (uma equipe chega com varias de uma vez) esperam cada uma o seu
// estado: o area.abrir guarda so uma sessao esperando.
const abrirQuandoChegar = (id, aoLado, vez = 0) => (sessaoPorId(id) || vez >= 30 ? area.abrir(id, { aoLado }) : setTimeout(() => abrirQuandoChegar(id, aoLado, vez + 1), 200));
window.duckvApp?.aoAbrirSessao?.((id, aoLado) => S.pronto && abrirQuandoChegar(id, aoLado));
// "Mais opcoes" no popup rapido: o dialogo completo de nova sessao, ja com a conta, a pasta e o texto.
window.duckvApp?.aoAbrirNova?.((o) => S.pronto && abrirNova({ conta: o.conta || undefined, cwd: o.cwd, texto: o.texto }));

// ------------------------------------------------------------ painel de uma sessao
// Um painel mostra uma sessao: a conversa (com os pedidos e a caixa de mensagem) ou o terminal de verdade.
function criarPainel(id, opts = {}) {
  let modo = opts.modo === 'terminal' ? 'terminal' : 'conversa';
  const corConta = el('span', { class: 'p-cor', 'aria-hidden': 'true' });
  const titulo = el('h2');
  const linha = el('p');
  const segConversa = el('button', { type: 'button', role: 'tab', onclick: () => trocarModo('conversa') }, icone('chat-text', 16), 'Conversa');
  const segTerminal = el('button', { type: 'button', role: 'tab', onclick: () => trocarModo('terminal') }, icone('terminal-window', 16), 'Terminal');
  const mais = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Mais ações desta sessão', title: 'Mais ações', onclick: () => abrirMenu(mais, menuDaSessao()) }, icone('dots-three', 20));
  const fechar = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Fechar painel', title: `Fechar painel (${CTRL}+W)`, onclick: () => area.fechar(raiz) }, icone('x', 18));
  const topo = el('header', { class: 'p-topo' }, corConta, el('div', { class: 'p-titulo' }, titulo, linha), el('div', { class: 'segmentos', role: 'tablist', 'aria-label': 'Ver' }, segConversa, segTerminal), mais, fechar);

  // --- conversa
  const ctxTexto = el('span');
  const ctxCaixa = el('span', { class: 'ctx', title: 'Quanto da memória da conversa já foi usado' }, ctxTexto);
  const gasto = el('span');
  const tarefasTexto = el('button', { class: 'tarefas-botao', type: 'button', 'aria-expanded': 'false' });
  const tarefasLista = el('ol', { hidden: true });
  const tarefas = el('div', { class: 'tarefas' }, tarefasTexto, tarefasLista);
  tarefasTexto.addEventListener('click', () => {
    const abrir = tarefasLista.hidden;
    tarefasLista.hidden = !abrir;
    tarefasTexto.setAttribute('aria-expanded', String(abrir));
    if (abrir) animarEntrada(tarefasLista);
  });
  const info = el('div', { class: 'p-info' }, ctxCaixa, gasto, tarefas);
  const conversa = el('div', { class: 'conversa', role: 'log', 'aria-label': 'Conversa', tabIndex: 0 });
  const pedidos = el('div', { class: 'pedidos' });
  const rapidas = el('div', { class: 'rapidas', role: 'group', 'aria-label': 'Mensagens rápidas' });
  const campo = el('textarea', { rows: 1, 'aria-label': 'Mensagem' });
  const enviar = el('button', { class: 'enviar', type: 'submit', 'aria-label': 'Enviar', title: 'Enviar (Enter)' }, icone('paper-plane-right', 20));
  const anexar = el('button', { class: 'so-icone anexar', type: 'button', 'aria-label': 'Anexar arquivo', title: 'Anexar arquivo (ou arraste para cá)' }, icone('paperclip', 18));
  const escolherArquivo = el('input', { type: 'file', hidden: true, multiple: true });
  const listaComandos = el('ul', { class: 'comandos-lista', role: 'listbox', hidden: true });
  const prontos = el('div', { class: 'anexos-prontos', role: 'list', 'aria-label': 'Anexos desta mensagem', hidden: true });
  // O pato da sessao mora em cima da caixa de mensagem: anda de ponta a ponta enquanto o agente
  // trabalha, pula com a exclamacao quando precisa de voce e cochila quando a sessao acaba.
  const pato = bicho(true, { roteiro: true, inicio: 0.06 });
  const estadoTxt = el('span', { class: 'doca-estado', role: 'status', 'aria-live': 'polite' });
  const anel = anelContexto();
  const barraEscrever = el('div', { class: 'escrever-barra' }, anexar, estadoTxt, anel.raiz, enviar);
  const form = el('form', { class: 'escrever' }, listaComandos, prontos, campo, barraEscrever, escolherArquivo);
  const leitura = el('div', { class: 'leitura', hidden: true });
  const doca = el('div', { class: 'doca' }, el('div', { class: 'doca-pato' }, pato), form, leitura);
  const nota = el('p', { class: 'p-nota' });
  const baixo = el('div', { class: 'p-baixo' }, pedidos, rapidas, nota, doca);
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
        itens.push({ texto: 'Limpar conversa', icone: 'broom', acao: async () => (await confirmar({ titulo: 'Limpar a conversa?', texto: 'O agente começa do zero nesta sessão. A conversa antiga continua em "Todas as conversas".', sim: 'Limpar', perigo: true })) && enviarTexto('/clear', 'Conversa limpa') });
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
    if (s.hosted && vivo) itens.push('-', { texto: 'Encerrar sessão', icone: 'power', perigo: true, acao: async () => (await confirmar({ titulo: `Encerrar ${nomeDaSessao(s)}?`, texto: 'O agente fecha no computador. Dá para continuar a conversa depois, em "Todas as conversas".', sim: 'Encerrar', perigo: true })) && mandar({ t: 'stop', instance: id }, (erro) => avisar(erro || 'Sessão encerrada')) });
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
    enviar.dataset.pronto = campo.value.trim() || anexos.some((a) => a.caminho) ? 'sim' : 'nao';
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
    if (anexos.some((a) => a.estado === 'enviando')) return avisar('Espere os anexos terminarem de subir.');
    const prontosAgora = anexos.filter((a) => a.caminho);
    // Os caminhos vao no fim da mensagem, um por linha: o agente le os arquivos, e a conversa mostra
    // a miniatura no lugar do caminho (veja anexosDoTexto).
    const texto = [campo.value.trim(), prontosAgora.map((a) => a.caminho).join('\n')].filter(Boolean).join('\n\n');
    if (!texto) return;
    enviar.disabled = true;
    mandar({ t: 'send', instance: id, text: texto }, (erro) => {
      enviar.disabled = false;
      if (erro) return avisar(erro);
      campo.value = '';
      anexos = anexos.filter((a) => !prontosAgora.includes(a));
      desenharAnexos();
      ajustarAltura();
    });
  });

  // --- anexos: o arquivo sobe para a pasta do duckV na hora e aparece como miniatura acima da caixa
  // de mensagem; o caminho so entra na mensagem quando ela e enviada.
  let anexos = []; // { id, nome, tamanho, imagem, previa, estado: 'enviando' | 'pronto' | 'erro', caminho, erro }
  let seqAnexo = 0;
  const tamanhoLegivel = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
  // Miniatura pequena feita aqui mesmo (data: URL), sem esperar o envio e sem abrir a politica de seguranca.
  async function miniatura(arquivo) {
    try {
      const bmp = await createImageBitmap(arquivo);
      const lado = 160;
      const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close?.();
      return c.toDataURL('image/png');
    } catch {
      return null;
    }
  }
  function desenharAnexos() {
    prontos.hidden = !anexos.length;
    prontos.replaceChildren(
      ...anexos.map((a) => {
        const tirar = el('button', { class: 'anexo-tirar', type: 'button', 'aria-label': `Tirar ${a.nome}`, title: 'Tirar da mensagem', onclick: () => ((anexos = anexos.filter((x) => x !== a)), desenharAnexos(), ajustarAltura(), campo.focus()) }, icone('x', 14));
        const situacao = a.estado === 'enviando' ? 'Enviando…' : a.estado === 'erro' ? a.erro || 'Não foi' : tamanhoLegivel(a.tamanho);
        const item = a.previa
          ? el('div', { class: 'anexo-item imagem', role: 'listitem', 'data-estado': a.estado, title: `${a.nome}\n${situacao}` }, el('img', { src: a.previa, alt: a.nome }), a.estado === 'enviando' ? el('span', { class: 'anexo-girando', 'aria-hidden': 'true' }) : null, tirar)
          : el('div', { class: 'anexo-item arquivo', role: 'listitem', 'data-estado': a.estado }, icone(a.estado === 'erro' ? 'warning-circle' : 'paperclip', 18), el('span', { class: 't' }, el('b', { text: a.nome }), el('span', { text: situacao })), tirar);
        if (a.novo) {
          animarEntrada(item, 'entra-anexo');
          a.novo = false;
        }
        return item;
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
        // Print colado chega como "image.png": ganha um nome com a hora, para dar para diferenciar.
        const agora = new Date();
        const nome = colado && imagem ? `print-${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}${String(agora.getSeconds()).padStart(2, '0')}${arquivos.length > 1 ? `-${i + 1}` : ''}.${f.type.split('/')[1].replace('jpeg', 'jpg')}` : f.name;
        const a = { id: ++seqAnexo, nome, tamanho: f.size, imagem, previa: null, estado: 'enviando', caminho: null, novo: true };
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
          Object.assign(a, { estado: 'pronto', caminho: j.caminho, url: j.url });
        } catch (e) {
          Object.assign(a, { estado: 'erro', erro: e.message === 'Failed to fetch' ? 'Sem conexão' : e.message });
          avisar(`Não consegui anexar ${nome}: ${a.erro}`);
        }
        if (anexos.includes(a)) desenharAnexos();
        ajustarAltura();
      }),
    );
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
      anexarArquivos(fs, true);
    }
  });

  // --- conversa
  const textoVazio = (s) =>
    s?.hosted
      ? 'A conversa aparece aqui depois da sua primeira mensagem. Se o agente perguntar algo ao abrir, a pergunta surge logo abaixo, com botões.'
      : s?.origem === 'nuvem' || s?.origem === 'cowork'
        ? 'Buscando as mensagens na Anthropic.'
        : 'A conversa aparece aqui assim que a sessão trocar mensagens.';
  const vazioDaConversa = (s) => el('div', { class: 'vazio' }, icone(s?.origem === 'nuvem' ? 'cloud' : s?.origem === 'cowork' ? 'briefcase' : 'chat-text', 28), el('p', { text: textoVazio(s) }));
  let ultimoTs = 0;
  // Poe um item no fim da conversa. Ferramenta logo depois de ferramenta entra no mesmo bloco de atividade.
  function anexarItem(m, animar) {
    if (m.ts && (!ultimoTs || m.ts - ultimoTs > 30 * 60_000 || new Date(m.ts).toDateString() !== new Date(ultimoTs).toDateString())) {
      const q = marcaDeTempo(m.ts);
      conversa.append(q);
      if (animar) animarEntrada(q, 'entra-msg');
    }
    if (m.ts) ultimoTs = m.ts;
    const ultimo = conversa.lastElementChild;
    if (m.role === 'tool' && ultimo?.classList.contains('atividade')) {
      ultimo.somar(m);
      if (animar) animarEntrada(ultimo.querySelector('.atividade-cab'), 'pulso');
      return;
    }
    const no = criarMensagem(m);
    conversa.append(no);
    if (animar) animarEntrada(no, 'entra-msg');
  }
  function desenharConversa(tudo, novas) {
    const noFim = conversa.scrollHeight - conversa.scrollTop - conversa.clientHeight < 160;
    if (tudo) {
      const itens = visiveis(conversas.get(id) || []);
      conversa.replaceChildren();
      ultimoTs = 0;
      if (itens.length) for (const m of itens.slice(-600)) anexarItem(m, false);
      else conversa.append(vazioDaConversa(sessao()));
      conversa.scrollTop = conversa.scrollHeight;
      return;
    }
    const itens = visiveis(novas);
    if (!itens.length) return;
    conversa.querySelector(':scope > .vazio')?.remove();
    for (const m of itens) anexarItem(m, true);
    if (noFim) conversa.scrollTo({ top: conversa.scrollHeight, behavior: semMovimento.matches ? 'auto' : 'smooth' });
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

  // --- sessao so de leitura
  let marcaLeitura = '';
  function desenharLeitura(s, conta) {
    const m = JSON.stringify([s.origem, s.status, s.link, s.arquivada, S.host.available, s.hosted, s.desktop]);
    if (m === marcaLeitura) return;
    marcaLeitura = m;
    let texto;
    const acoes = [];
    if (s.origem === 'nuvem') {
      texto = s.arquivada ? 'Esta sessão rodou na nuvem e foi arquivada. Dá para ler tudo por aqui.' : 'Esta sessão roda na nuvem da Anthropic. Por aqui você acompanha; para responder, abra no claude.ai.';
      if (s.link) acoes.push(el('a', { class: 'botao principal', href: s.link, target: '_blank', rel: 'noopener noreferrer' }, icone('arrow-up-right', 18), 'Abrir no claude.ai'));
    } else if (s.origem === 'cowork') {
      texto = 'Tarefa do Cowork. Por aqui você acompanha; para responder, use o app Claude do computador.';
    } else if (s.status === 'ended') {
      texto = 'Sessão encerrada.';
      if ((s.desktop || s.historico) && S.host.available) acoes.push(el('button', { class: 'botao principal', type: 'button', onclick: () => continuar(s) }, icone('arrows-clockwise', 18), 'Continuar aqui no duckV'));
    } else if (s.desktop) {
      texto = s.status === 'working' ? 'Esta conversa está trabalhando no app Claude. Espere ela terminar para continuar por aqui.' : 'Conversa do app Claude ou guardada. Para mandar mensagens, continue a mesma conversa aqui. Feche-a no app antes, para as duas não escreverem juntas.';
      if (S.host.available) acoes.push(el('button', { class: 'botao principal', type: 'button', disabled: s.status === 'working', onclick: () => continuar(s) }, icone('arrows-clockwise', 18), 'Continuar aqui no duckV'));
    } else {
      texto = `Esta sessão não recebe mensagens do duckV. Abra-a pelo atalho de ${conta.nome}, com o duckV ligado, ou continue a conversa aqui.`;
      if (s.sessionId && S.host.available) acoes.push(el('button', { class: 'botao quieto', type: 'button', onclick: () => continuar(s) }, icone('arrows-clockwise', 18), 'Continuar aqui'));
    }
    leitura.replaceChildren(el('p', { text: texto }), ...(acoes.length ? [el('div', { class: 'leitura-acoes' }, acoes)] : []));
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
    if (corpo.firstChild !== vista) {
      const tinha = !!corpo.firstChild;
      corpo.replaceChildren(vista);
      if (tinha) animarEntrada(vista, 'entra-modo');
    }
    segConversa.setAttribute('aria-selected', String(modo === 'conversa'));
    segTerminal.setAttribute('aria-selected', String(modo === 'terminal'));
    if (!s) {
      titulo.textContent = S.pronto ? 'Sessão encerrada' : 'Carregando';
      linha.replaceChildren(S.pronto ? 'Ela não está mais aberta no computador.' : 'Buscando a sessão.');
      pato.definir('dorme');
      baixo.hidden = true;
      info.hidden = true;
      return;
    }
    const conta = contaDe(s);
    raiz.style.setProperty('--cor', conta.cor);
    titulo.textContent = nomeDaSessao(s);
    dicaEm(titulo, s.cwd || '');
    const ondeTxt = [conta.nome, s.model, s.cwd].filter(Boolean).join(' · ');
    linha.replaceChildren(chipAgente(conta), ...(origemDe(s).selo ? [seloOrigem(s.origem)] : []), el('span', { class: 'onde', text: ondeTxt, title: ondeTxt }));
    pato.definir(estadoDoPato(s));
    // o mesmo patinho da conta (tipo e cor), como no celular
    pato.style.setProperty('--cor', conta.cor);
    vestirPato(pato, conta.pato);
    doca.dataset.estado = estadoDoPato(s);
    segTerminal.disabled = !S.desktop;
    dicaEm(segTerminal, S.desktop ? (s.hosted ? 'Terminal de verdade desta sessão' : 'Esta sessão roda num terminal do computador') : 'Só no app do duckV para o computador');
    if (area.visivel(id)) novasMsgs.delete(id);

    // O que a sessao faz agora, ao lado do pato, como a linha de estado do Claude Code.
    const nuvemOuCowork = s.origem === 'nuvem' || s.origem === 'cowork';
    estadoTxt.textContent =
      s.status === 'ended' ? 'Sessão encerrada'
        : s.arquivada ? 'Arquivada na nuvem'
          : s.status === 'idle' ? (nuvemOuCowork ? (s.origem === 'cowork' ? 'Parada no Cowork' : 'Parada na nuvem') : 'Esperando sua mensagem')
            : oQueFaz(s);
    estadoTxt.dataset.s = precisa(s) ? 'pede' : s.status;
    anel.definir(s.ctx?.size ? s.ctx.pct ?? 0 : null, conta.cor, s.ctx?.size ? `Contexto: ${Math.round(s.ctx.pct ?? 0)}% usado · ${compacto.format(s.ctx.in)} de ${compacto.format(s.ctx.size)} tokens` : '');
    ctxCaixa.hidden = true;
    const gastos = s.tokens.in + s.tokens.cw + s.tokens.out;
    gasto.hidden = !gastos;
    if (gastos) gasto.replaceChildren('Gasto ', el('b', { text: compacto.format(gastos) }), ' tokens', ...(s.lines && (s.lines.add || s.lines.rem) ? ['  ·  Linhas ', el('b', { text: `+${s.lines.add} −${s.lines.rem}` })] : []));
    tarefas.hidden = !s.tasks.length;
    if (s.tasks.length) {
      const feitas = s.tasks.filter((t) => t.status === 'completed').length;
      tarefasTexto.replaceChildren(icone('list-checks', 16), `Tarefas: ${feitas} de ${s.tasks.length}`);
      tarefasLista.replaceChildren(...s.tasks.map((t) => el('li', { 'data-s': t.status }, icone(t.status === 'completed' ? 'check' : 'caret-right', 14), el('span', { text: t.subject }))));
    }
    const vazio = conversa.querySelector(':scope > .vazio p');
    if (vazio) vazio.textContent = textoVazio(s);

    sincronizarPedidos(pedidos, pedidosDe([s], false));
    desenharRapidas(s);
    const viva = s.status !== 'ended';
    baixo.hidden = false;
    // Sessao que o duckV so le: no lugar da caixa, o que da para fazer com ela (o pato continua em cima).
    const soLeitura = !s.canSend && !s.login;
    form.hidden = soLeitura;
    leitura.hidden = !soLeitura;
    if (soLeitura) desenharLeitura(s, conta);
    campo.disabled = enviar.disabled = !s.canSend;
    anexar.disabled = !s.canSend;
    campo.placeholder = s.canSend ? (s.hosted ? `Mensagem para ${conta.nome} ou /comando  ·  Enter envia, Shift+Enter quebra linha` : `Mensagem para ${conta.nome}`) : '';
    nota.textContent = s.login && viva ? 'Siga a entrada na conta pelo Terminal.' : '';
    nota.hidden = !nota.textContent;
    info.hidden = !s.tasks.length && !gastos;
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

// ------------------------------------------------------------ acoes de uma conta
// O mesmo menu aparece no clique direito da conta na lateral, no botao ⋯ ao lado dela e no cartao da visao geral.
function menuDaConta(c) {
  const ag = agenteDaConta(c);
  const abertas = vivas(c.id).filter((s) => !s.login);
  const itens = [
    { texto: 'Nova sessão nesta conta', icone: 'plus', desligado: !S.host.available || c.instalado === false, acao: () => abrirNova({ conta: c.id }) },
    ...(S.desktop ? [{ texto: 'Abrir no terminal do sistema', icone: 'arrow-square-out', acao: () => abrirNova({ conta: c.id, onde: 'sistema' }) }] : []),
    { texto: 'Todas as conversas', icone: 'chats', acao: () => abrirHistorico(c.id) },
    '-',
    { texto: c.email ? 'Entrar com outro login' : 'Entrar nesta conta', icone: 'sign-in', desligado: c.padrao && ag.id === 'claude', acao: () => entrarNaConta(c) },
  ];
  if (c.email && !c.padrao && ag.podeSair) itens.push({ texto: 'Sair desta conta', icone: 'sign-out', perigo: true, acao: () => sairDaConta(c) });
  if (abertas.some((s) => s.hosted)) itens.push({ texto: `Encerrar ${plural(abertas.filter((s) => s.hosted).length, 'sessão aberta', 'sessões abertas')}`, icone: 'power', perigo: true, acao: () => encerrarSessoesDa(c) });
  itens.push('-', { texto: 'Ajustes da conta', icone: 'gear-six', acao: () => vista.mostrar('opcoes', 'contas') });
  return itens;
}

// Fecha as sessoes que o duckV abriu nesta conta e espera o estado confirmar (ate 10 s).
async function encerrarSessoesDa(c, perguntarAntes = true) {
  const minhas = vivas(c.id).filter((s) => s.hosted && !s.login);
  if (!minhas.length) return true;
  if (perguntarAntes && !(await confirmar({ titulo: `Encerrar as sessões de ${c.nome}?`, texto: `${plural(minhas.length, 'sessão aberta pelo duckV fecha', 'sessões abertas pelo duckV fecham')} no computador. As conversas continuam em "Todas as conversas".`, sim: 'Encerrar', perigo: true }))) return false;
  for (const s of minhas) mandar({ t: 'stop', instance: s.id });
  for (let i = 0; i < 40 && vivas(c.id).some((s) => s.hosted && !s.login); i++) await new Promise((ok) => setTimeout(ok, 250));
  return !vivas(c.id).some((s) => s.hosted && !s.login);
}

// Sair do login de uma conta: a conta, as conversas e as opcoes ficam; para usar de novo, e so entrar.
async function sairDaConta(c) {
  const abertas = vivas(c.id).filter((s) => !s.login);
  const deFora = abertas.filter((s) => !s.hosted);
  if (deFora.length) {
    return confirmar({ titulo: `Feche as janelas de ${c.nome} antes`, texto: `${plural(deFora.length, 'sessão desta conta roda', 'sessões desta conta rodam')} numa janela de terminal do computador. Feche ${deFora.length === 1 ? 'essa janela' : 'essas janelas'} e tente de novo.`, sim: 'Entendi' });
  }
  const ok = await confirmar({
    titulo: `Sair de ${c.nome}?`,
    texto: `O login${c.email ? ` de ${c.email}` : ''} sai deste computador${abertas.length ? ` e ${plural(abertas.length, 'a sessão aberta fecha', 'as sessões abertas fecham')}` : ''}. A conta, as conversas e as opções continuam aqui: para usar de novo, é só entrar.`,
    sim: 'Sair da conta',
    perigo: true,
  });
  if (!ok) return;
  if (abertas.length && !(await encerrarSessoesDa(c, false))) return avisar('Algumas sessões não fecharam. Tente de novo em instantes.');
  mandar({ t: 'conta', op: 'sair', id: c.id }, (e) => avisar(e || `Você saiu de ${c.nome}`));
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
    // Vaga sem sessao: um convite para arrastar uma sessao para la, em vez de um buraco.
    const sobra = lista.length ? Math.max(0, vagas(grade.dataset.layout) - lista.length) : 0;
    const vaga = () => {
      const v = el('div', { class: 'painel-vago' }, el('div', null, icone('square-split-horizontal', 28), el('p', { text: 'Arraste uma sessão da barra lateral para cá.' }), el('p', { class: 'apoio', text: `${CTRL}+clique numa sessão também abre ao lado.` })));
      v.addEventListener('dragover', (ev) => {
        if (!ev.dataTransfer.types.includes('text/duckv-sessao')) return;
        ev.preventDefault();
        v.classList.add('alvo');
      });
      v.addEventListener('dragleave', () => v.classList.remove('alvo'));
      v.addEventListener('drop', (ev) => {
        const sid = ev.dataTransfer.getData('text/duckv-sessao');
        if (sid) {
          ev.preventDefault();
          abrir(sid, { aoLado: true });
        }
      });
      return v;
    };
    grade.replaceChildren(...lista.map((p) => p.raiz), ...Array.from({ length: sobra }, vaga));
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
    animarEntrada(novo.raiz, 'entra-painel');
    novo.iniciar();
    focar(novo);
    setTimeout(() => novo.focar(), 50);
    salvar();
    desenhar();
  }
  // "Abrir lado a lado": a equipe toda em paineis, com o layout do tamanho dela (ate 4). As sessoes
  // recem-abertas chegam no proximo estado, entao o pedido espera por elas.
  let esperandoTime = null;
  function juntas(ids) {
    esperandoTime = { ids: [...ids], ate: Date.now() + 5000 };
    tentarJuntas();
  }
  function tentarJuntas() {
    if (!esperandoTime) return;
    const alvos = esperandoTime.ids.filter((id) => sessaoPorId(id));
    if (alvos.length < esperandoTime.ids.length && Date.now() < esperandoTime.ate) return;
    const todos = esperandoTime.ids.length;
    esperandoTime = null;
    if (!alvos.length) return avisar('Essas sessões não estão mais abertas.');
    const cabem = alvos.slice(0, 4);
    for (const p of lista) p.fechar();
    lista = cabem.map((id) => {
      novasMsgs.delete(id);
      return criar(id);
    });
    guardarLocal('layout', cabem.length >= 4 ? '4' : cabem.length === 3 ? '3' : cabem.length === 2 ? '2c' : '1');
    vista.mostrar('paineis');
    aplicar();
    for (const p of lista) {
      animarEntrada(p.raiz, 'entra-painel');
      p.iniciar();
    }
    focar(lista[0]);
    setTimeout(() => lista[0]?.focar(), 50);
    salvar();
    desenhar();
    if (cabem.length < todos) avisar(`Os painéis cabem 4 sessões: abri as ${cabem.length} primeiras da equipe.`);
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
    animarEntrada(novo.raiz, 'entra-painel');
    novo.iniciar();
    focar(novo);
    salvar();
    desenhar();
  }
  async function fechar(raiz) {
    const p = lista.find((x) => x.raiz === raiz);
    if (!p || p.saindo) return;
    p.saindo = true;
    await animarSaida(p.raiz, 'sai-painel');
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
    juntas,
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
      if (esperandoTime) tentarJuntas();
      if (esperando && (sessaoPorId(esperando.id) || Date.now() > esperando.ate)) {
        const e = esperando;
        esperando = null;
        return abrir(e.id, e.opts);
      }
      for (const p of lista) p.atualizar();
    },
  };
})();

// ------------------------------------------------------------ bloco da equipe
// O mesmo bloco serve a barra lateral (compacto) e a Visao geral: o pato de cada conta anda na mesma
// pista larga, com o nome da conta e o que ele faz agora embaixo. Clicar num pato abre a sessao dele;
// "Abrir lado a lado" poe a equipe toda em paineis.
function blocoEquipe({ compacto = false } = {}) {
  const apoio = el('span');
  const tarefa = el('p', { class: 'equipe-tarefa' });
  const botaoJuntas = el('button', { class: 'botao texto pequeno', type: 'button' }, icone('square-split-horizontal', 16), 'Abrir lado a lado');
  const pista = el('div', { class: 'equipe-pista', role: 'list' });
  const raiz = el(
    'section',
    { class: `equipe${compacto ? ' compacta' : ''}` },
    el('div', { class: 'equipe-cabeca' }, el('div', { class: 'equipe-quem' }, el('b', { text: 'Equipe' }), apoio), botaoJuntas),
    compacto ? null : tarefa,
    pista,
  );
  const colunas = new Map();
  let ids = [];
  botaoJuntas.addEventListener('click', () => area.juntas(ids));

  // Uma coluna por pato: a pista dele, o nome da conta e o que ele faz agora.
  function coluna() {
    const p = bicho(true, { roteiro: true, inicio: entre(0.15, 0.85) });
    const nome = el('b');
    const faz = el('span', { class: 'equipe-faz' });
    const botao = el('button', { class: 'equipe-pato', type: 'button', role: 'listitem' }, el('span', { class: 'equipe-trilha' }, p), nome, faz);
    let sessao = null;
    botao.addEventListener('click', (ev) => sessao && area.abrir(sessao.id, { aoLado: ev.ctrlKey || ev.metaKey }));
    return {
      raiz: botao,
      atualizar(s) {
        sessao = s;
        const c = contaDe(s);
        botao.style.setProperty('--cor', c.cor);
        p.definir(estadoDoPato(s));
        vestirPato(p, c.pato);
        nome.textContent = c.nome;
        faz.textContent = oQueFaz(s);
        faz.classList.toggle('pede', precisa(s));
        botao.setAttribute('aria-label', `${c.nome}: ${oQueFaz(s)}`);
        dicaEm(botao, `${c.nome}: ${oQueFaz(s)}
${nomeDaSessao(s)}

Clique para abrir; ${CTRL}+clique abre ao lado.`);
      },
    };
  }
  return {
    raiz,
    atualizar(g) {
      ids = g.sessoes.map((s) => s.id);
      const onde = pasta(g.sessoes[0]?.cwd);
      apoio.textContent = `${plural(g.sessoes.length, 'pato', 'patos')}${compacto ? '' : ' na mesma pasta'}${onde ? ` · ${onde}` : ''}`;
      tarefa.textContent = g.sessoes[0] ? nomeDaSessao(g.sessoes[0]) : '';
      tarefa.hidden = !tarefa.textContent;
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
  // Equipes ("Todas as contas"): um bloco por equipe, antes das contas, porque as sessoes dela vem juntas.
  const tituloEquipes = el('div', { class: 'secao-titulo', hidden: true }, el('span', { text: 'Equipes' }));
  const caixaEquipes = el('div');
  const recolher = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Recolher barra lateral', title: `Recolher barra lateral (${CTRL}+B)`, onclick: () => alternarLateral() }, icone('sidebar-simple', 20));
  const raiz = el(
    'aside',
    { class: 'lateral', 'aria-label': 'Contas e sessões' },
    el('div', { class: 'lateral-topo' }, el('div', { class: 'marca-duckv', 'aria-label': 'duckV' }, 'duck', el('b', { text: 'V' })), recolher),
    el('div', { class: 'lateral-acoes' }, novaSessao, busca),
    el('nav', { class: 'nav', 'aria-label': 'Seções' }, navVisao, navPaineis, navFila),
    el(
      'div',
      { class: 'lateral-rolo' },
      tituloEquipes,
      caixaEquipes,
      el('div', { class: 'secao-titulo' }, el('span', { text: 'Contas' }), el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Adicionar conta', title: 'Adicionar conta', onclick: () => vista.mostrar('opcoes', 'contas') }, icone('user-plus', 18))),
      contas,
    ),
    el('div', { class: 'lateral-pe' }, navCelulares, navOpcoes),
  );
  const grupos = new Map();
  const blocos = new Map();

  function grupoConta(c) {
    const pato = miniPato('dorme', c.cor);
    const nome = el('span');
    const estado = el('span', { class: 'estado' });
    const usoTxt = el('span');
    const uso = el('span', { class: 'uso' }, usoTxt);
    const linhaConta = el('button', { class: 'conta-linha', type: 'button', 'aria-expanded': 'true' }, pato, el('span', { class: 'quem' }, el('span', { class: 'nome' }, nome), estado), uso);
    const sessoes = el('div', { class: 'sessoes-conta', role: 'list' });
    const maisConta = el('button', { class: 'so-icone conta-mais', type: 'button', 'aria-label': `Ações de ${c.nome}`, title: 'Entrar, sair, encerrar sessões e ajustes', onclick: () => abrirMenu(maisConta, menuDaConta(c)) }, icone('dots-three', 18));
    const raizG = el('div', { class: 'grupo-conta', 'data-aberto': 'sim' }, el('div', { class: 'conta-cabeca' }, linhaConta, maisConta), sessoes);
    linhaConta.addEventListener('click', () => {
      const aberto = raizG.dataset.aberto !== 'sim';
      raizG.dataset.aberto = aberto ? 'sim' : 'nao';
      linhaConta.setAttribute('aria-expanded', String(aberto));
      sessoes.hidden = !aberto;
      if (aberto) animarEntrada(sessoes);
      guardarLocal('fechadas', aberto ? LOCAL.fechadas.filter((x) => x !== c.id) : [...LOCAL.fechadas, c.id]);
    });
    linhaConta.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      abrirMenu(linhaConta, menuDaConta(c));
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
      pato.vestir(conta.pato);
      nome.textContent = conta.nome;
      if (!nome.nextSibling) nome.after(chipAgente(conta));
      else nome.nextSibling.replaceWith(chipAgente(conta));
      estado.textContent = e.texto;
      estado.classList.toggle('pede', !!e.pede);
      const u5 = conta.usage?.five_hour;
      usoTxt.textContent = typeof u5?.pct === 'number' ? `${Math.round(u5.pct)}%` : '';
      uso.querySelector('.barra')?.remove();
      if (typeof u5?.pct === 'number') uso.append(barra(u5.pct, conta.cor));
      dicaEm(uso, typeof u5?.pct === 'number' ? `Limite de 5 horas: ${Math.round(u5.pct)}% usado. ${textoDoReinicio(conta, 'five_hour', u5)}.` : 'Sem leitura do limite ainda');
      const ss = S.sessoes.filter((s) => s.account === conta.id && !s.equipe && (s.status !== 'ended' || area.paineis().some((p) => p.id === s.id))).sort((a, b) => a.startedAt - b.startedAt);
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
            origemDe(s).selo ? el('span', { class: 'lado', title: origemDe(s).longo }, icone(origemDe(s).icone, 16)) : el('span', { class: 'lado', text: s.ctx?.pct != null ? `${Math.round(s.ctx.pct)}%` : '' }),
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
    tituloEquipes.hidden = !sincronizarEquipes(caixaEquipes, blocos, { compacto: true });
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
  fecharMenu();
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
  const caixaEquipes = el('div', { class: 'equipes-visao' });
  const raiz = el('div', { class: 'visao' }, el('div', { class: 'visao-cabeca' }, el('div', null, cabTitulo, cabSub), abrir), resumoFila, caixaEquipes, grade, dicas);
  const cartoes = new Map();
  const blocos = new Map();

  function cartao(c) {
    const pista = bicho(true, { roteiro: true, inicio: 0.5 });
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
      vestirPato(pista, conta.pato);
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
      // As sessoes de uma equipe aparecem no bloco dela, acima dos cartoes.
      const ss = vivas(conta.id).filter((s) => !s.equipe);
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
          !conta.email && conta.instalado !== false ? el('button', { class: 'botao texto pequeno', type: 'button', onclick: () => entrarNaConta(conta) }, icone('sign-in', 16), 'Entrar nesta conta') : null,
          el('span', { class: 'espaco' }),
          el('button', { class: 'so-icone', type: 'button', 'aria-label': `Ações de ${conta.nome}`, title: 'Entrar, sair, encerrar sessões e ajustes', onclick: (ev) => abrirMenu(ev.currentTarget, menuDaConta(conta)) }, icone('dots-three', 20)),
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
    sincronizarEquipes(caixaEquipes, blocos, { compacto: false });
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

// ------------------------------------------------------------ GitHub (login pelo gh do computador)
// Um cartao so, usado nas Opcoes e na escolha de repositorio da sessao na nuvem: quem esta logado,
// o botao de entrar e, durante o login, o codigo de 8 letras e o atalho para github.com/login/device.
const ouvintesGithub = new Set();
function cartaoGithub({ compacto = false, aoMudarLogin } = {}) {
  const raiz = el('div', { class: `github${compacto ? ' compacto' : ''}`, 'aria-live': 'polite' });
  let marca = '';
  // replaceChildren escreveria "null" no lugar das partes ausentes
  const pintar = (...partes) => raiz.replaceChildren(...partes.filter(Boolean));
  const acao = (texto, ic, classe, f) => el('button', { class: `botao ${classe}`, type: 'button', onclick: f }, ic ? icone(ic, 18) : null, texto);
  function desenhar(mudouLogin) {
    if (mudouLogin && aoMudarLogin) aoMudarLogin(S.github?.login || null);
    const g = S.github || {};
    const nova = JSON.stringify([g.instalado, g.login, g.entrando?.codigo, g.erro]);
    if (nova === marca) return;
    marca = nova;
    if (g.instalado === false) {
      pintar(
        el('div', { class: 'github-linha' }, el('span', { class: 'github-ic' }, icone('warning-circle', 18)), el('span', { class: 't' }, el('b', { text: 'GitHub CLI não instalado' }), el('span', { text: 'O duckV usa o GitHub CLI (gh) deste computador para entrar no GitHub. Instale e volte aqui.' }))),
        el('div', { class: 'github-acoes' }, el('a', { class: 'botao quieto', href: 'https://cli.github.com', target: '_blank', rel: 'noopener noreferrer' }, icone('arrow-up-right', 18), 'Como instalar')),
      );
    } else if (g.entrando) {
      const copiar = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Copiar o código', title: 'Copiar o código', onclick: () => navigator.clipboard.writeText(g.entrando.codigo).then(() => avisar('Código copiado')) }, icone('copy', 18));
      const minutos = Math.max(1, Math.round((g.entrando.ate - agora()) / 60000));
      pintar(
        el('p', { class: 'github-passo', text: 'No GitHub, digite este código para liberar o duckV:' }),
        el('div', { class: 'github-codigo' }, el('span', { text: g.entrando.codigo }), copiar),
        el('div', { class: 'github-acoes' }, el('a', { class: 'botao principal', href: g.entrando.url, target: '_blank', rel: 'noopener noreferrer' }, icone('arrow-up-right', 18), 'Abrir github.com/login/device'), acao('Cancelar', null, 'texto', () => mandar({ t: 'githubCancelar' }))),
        el('p', { class: 'ajuda', text: `Vale por ${minutos} min. Pode autorizar pelo celular também; quando terminar, esta tela atualiza sozinha.` }),
      );
      animarEntrada(raiz.querySelector('.github-codigo'));
    } else if (g.login) {
      pintar(
        el('div', { class: 'github-linha' }, el('span', { class: 'github-ic ok' }, icone('check-circle', 18)), el('span', { class: 't' }, el('b', null, 'Conectado como ', el('code', { text: g.login })), compacto ? null : el('span', { text: 'Pelo GitHub CLI deste computador. O token fica no cofre do sistema, nunca no duckV.' }))),
        compacto ? null : el('div', { class: 'github-acoes' }, acao('Trocar de conta', 'arrows-clockwise', 'quieto', () => mandar({ t: 'githubEntrar' }, (e) => e && avisar(e))), acao('Sair do GitHub', 'sign-out', 'perigo', async () => (await confirmar({ titulo: `Sair de ${g.login} no GitHub?`, texto: 'O GitHub CLI deste computador fica sem login. Outros programas que usam o gh também saem.', sim: 'Sair', perigo: true })) && mandar({ t: 'githubSair' }, (e) => avisar(e || 'Saiu do GitHub')))),
      );
    } else {
      pintar(
        el('div', { class: 'github-linha' }, el('span', { class: 'github-ic' }, icone('globe', 18)), el('span', { class: 't' }, el('b', { text: 'Entre no GitHub' }), el('span', { text: 'Para escolher os seus repositórios ao criar sessões na nuvem.' }))),
        el('div', { class: 'github-acoes' }, acao('Entrar no GitHub', 'sign-in', 'principal', () => mandar({ t: 'githubEntrar' }, (e) => e && avisar(e)))),
        g.erro ? el('p', { class: 'erro', text: g.erro }) : null,
      );
    }
  }
  // para de ouvir so depois de ter estado na tela e sair dela (dialogo fechado)
  let esteve = false;
  const ouvir = (m) => {
    if (raiz.isConnected) esteve = true;
    else if (esteve) return ouvintesGithub.delete(ouvir);
    desenhar(m);
  };
  ouvintesGithub.add(ouvir);
  desenhar(false);
  return raiz;
}

function abrirNova(opts = {}) {
  if (!S.host.available) return avisar('Este computador não conseguiu carregar o terminal virtual. Rode a instalação de novo.');
  const { d, corpo, pe, form } = dialogo('Nova sessão', 'Abre no computador. Você acompanha e comanda daqui, do celular ou pelo terminal.');
  // "todas" vem do popup rapido: e o "Todas as contas" daqui
  let contaId = opts.conta === 'todas' ? 'equipe' : opts.conta || 'auto';
  let onde = opts.onde === 'sistema' && S.desktop ? 'sistema' : opts.onde === 'nuvem' ? 'nuvem' : 'duckv';
  // O texto da sessao: a primeira mensagem neste computador, a tarefa na nuvem (so ela e o repositorio; o
  // resto a nuvem decide) ou a tarefa da equipe. Um campo so, para o texto seguir quem troca de lugar.
  const tarefa = el('textarea', { id: 'nova-tarefa', class: 'campo-texto', rows: 3, maxLength: 8000, 'aria-describedby': 'nova-tarefa-ajuda' });
  tarefa.value = String(opts.texto || '').slice(0, 8000);
  const rotuloTarefa = el('label', { for: 'nova-tarefa' });
  const ajudaTarefa = el('p', { class: 'ajuda', id: 'nova-tarefa-ajuda', text: 'Em branco, a sessão abre esperando você.' });
  const campoTarefa = el('div', { class: 'campo' }, rotuloTarefa, tarefa, ajudaTarefa);
  const ajudaNuvem = el('p', { class: 'ajuda nuvem-ajuda', hidden: true }, icone('cloud', 16), el('span', { text: 'Roda nos servidores da Anthropic, a partir do repositório escolhido, e continua mesmo com o computador desligado. Repositório que não está no computador ganha uma cópia leve na pasta do duckV. Você acompanha por aqui; para responder, abra no claude.ai.' }));
  // "Todas as contas": uma sessao em cada conta, na mesma pasta, dividindo a tarefa.
  const ajudaEquipe = el('p', { class: 'ajuda equipe-ajuda', hidden: true }, icone('stack', 16), el('span', { text: 'Cada conta abre uma sessão nesta pasta, todas ao mesmo tempo. A divisão do trabalho é combinada num arquivo da pasta: o primeiro pato propõe as partes e cada um anota ali o que pegou e o que terminou.' }));
  const contas = el('div', { class: 'escolhas', role: 'radiogroup', 'aria-label': 'Conta' });
  const caminho = el('input', { id: 'nova-pasta', type: 'text', autocomplete: 'off', spellcheck: false, placeholder: S.host.home || '' });
  caminho.value = String(opts.cwd || '').slice(0, 1000);
  const procurar = el('button', { class: 'botao quieto', type: 'button' }, icone('folder-open', 18), 'Procurar');
  const navegador = el('div', { class: 'navegador', hidden: true });
  const recentes = el('div', { class: 'chips' });
  const erroPasta = el('p', { class: 'erro', role: 'alert', hidden: true });
  const nome = el('input', { id: 'nova-nome', type: 'text', autocomplete: 'off', maxLength: 50, placeholder: 'Opcional' });
  const modelo = seletor({ id: 'nova-modelo' });
  const esforco = seletor({ id: 'nova-esforco' });
  const modo = seletor({ id: 'nova-modo' });
  const ajudaModo = el('p', { class: 'ajuda' });
  const ondeChips = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Onde abrir' });
  const erroGeral = el('p', { class: 'erro', role: 'alert', hidden: true });
  // o erro aparece onde a pessoa esta olhando: o dialogo rola ate ele
  const falhou = (texto) => {
    Object.assign(erroGeral, { hidden: false, textContent: texto });
    erroGeral.scrollIntoView({ block: 'nearest', behavior: semMovimento.matches ? 'auto' : 'smooth' });
  };
  const abrir = el('button', { class: 'botao principal', type: 'submit', value: 'abrir', text: 'Abrir sessão' });
  const ajustes = el('div', { class: 'lado-a-lado' }, el('div', { class: 'campo' }, el('label', { for: 'nova-modelo', text: 'Modelo' }), modelo), el('div', { class: 'campo' }, el('label', { for: 'nova-esforco', text: 'Esforço' }), esforco), el('div', { class: 'campo' }, el('label', { for: 'nova-modo', text: 'Permissões' }), modo));

  const campoNome = el('div', { class: 'campo' }, el('label', { for: 'nova-nome', text: 'Nome da sessão' }), nome);
  const campoPasta = el('div', { class: 'campo' }, el('label', { for: 'nova-pasta', text: 'Pasta do projeto' }), el('div', { class: 'pasta-linha' }, caminho, procurar), erroPasta, navegador, recentes);
  // Na nuvem: um repositorio do GitHub (os seus, pelo gh), esteja ele no computador ou nao.
  let repoEscolhido = null;
  let repos = null;
  const buscaRepo = el('input', { id: 'nova-repo', type: 'search', autocomplete: 'off', spellcheck: false, placeholder: 'Buscar entre os seus repositórios', 'aria-label': 'Buscar repositório do GitHub' });
  const listaRepos = el('div', { class: 'escolhas repos-lista', role: 'radiogroup', 'aria-label': 'Repositório do GitHub' });
  const avisoRepos = el('p', { class: 'historico-aviso', hidden: true });
  const github = cartaoGithub({ compacto: true, aoMudarLogin: () => ((repos = null), carregarRepos()) });
  const campoRepo = el('div', { class: 'campo', hidden: true }, el('label', { for: 'nova-repo', text: 'Repositório do GitHub' }), github, buscaRepo, avisoRepos, listaRepos);
  function desenharRepos() {
    if (!repos) return listaRepos.replaceChildren(...Array.from({ length: 4 }, () => el('div', { class: 'escolha esqueleto', 'aria-hidden': 'true' }, el('i'), el('span', { class: 't' }, el('b'), el('span')))));
    const q = semAcento(buscaRepo.value.trim());
    const achados = repos.filter((r) => !q || semAcento(`${r.repo} ${r.descricao || ''}`).includes(q)).slice(0, 60);
    listaRepos.replaceChildren(
      ...(achados.length
        ? achados.map((r) =>
            el(
              'button',
              { class: 'escolha', type: 'button', role: 'radio', 'aria-checked': String(repoEscolhido === r.repo), onclick: () => ((repoEscolhido = r.repo), desenharRepos()) },
              el('span', { class: 'hist-ic' }, icone(r.pasta ? 'folder' : 'globe', 18)),
              el('span', { class: 't' }, el('b', { text: r.repo }), el('span', { text: [r.pasta ? 'Neste computador' : 'Baixa uma cópia leve ao criar', r.privado ? 'privado' : null, r.descricao].filter(Boolean).join(' · ') })),
              el('span', { class: 'radio' }),
            ),
          )
        : [el('p', { class: 'p-nota historico-nada', text: q ? 'Nenhum repositório com esse nome.' : 'Nenhum repositório encontrado.' })]),
    );
  }
  function carregarRepos() {
    if (repos) return;
    desenharRepos();
    mandar({ t: 'repos' }, (erro, r) => {
      repos = erro ? [] : r.itens || [];
      // sem login, quem explica e o cartao do GitHub logo acima
      const aviso = S.github?.login === null || S.github?.instalado === false ? null : erro || r.erro;
      avisoRepos.hidden = !aviso;
      avisoRepos.replaceChildren(icone('warning-circle', 16), el('span', { text: aviso || '' }));
      // ja vem escolhido o repositorio da pasta padrao da conta, se ele estiver na lista
      if (!repoEscolhido) repoEscolhido = repos.find((x) => x.pasta && x.pasta === caminho.value.trim())?.repo || null;
      desenharRepos();
    });
  }
  buscaRepo.addEventListener('input', desenharRepos);
  corpo.append(
    el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Conta' }), contas),
    el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Onde roda' }), ondeChips),
    campoPasta,
    campoRepo,
    campoTarefa,
    ajudaNuvem,
    ajudaEquipe,
    campoNome,
    ajustes,
    ajudaModo,
    erroGeral,
  );
  pe.append(el('button', { class: 'botao texto', type: 'button', text: 'Cancelar', onclick: () => d.close() }), abrir);

  const contaEscolhida = () => (contaId === 'auto' ? contaAutomatica('claude')?.conta || contaAutomatica()?.conta : S.contas.find((c) => c.id === contaId));
  // As contas que entram no "Todas as contas": as que tem o agente instalado.
  const contasDoTime = () => S.contas.filter((c) => c.instalado !== false);
  const ehTime = () => contaId === 'equipe';
  if (ehTime() && contasDoTime().length < 2) contaId = 'auto';
  function desenharContas() {
    const auto = contaAutomatica('claude') || contaAutomatica();
    const linhaEscolha = (id, rotulo, apoio, cor, uso) => {
      const b = el(
        'button',
        { class: 'escolha', type: 'button', role: 'radio', 'aria-checked': String(contaId === id), onclick: () => ((contaId = id), desenharContas(), desenharOnde(), aplicarAgente(true)) },
        cor ? el('i', { class: 'ponto-conta' }) : icone('sparkle', 18),
        el('span', { class: 't' }, el('b', { text: rotulo }), el('span', { text: apoio })),
        el('span', { class: 'uso-escolha', text: uso || '' }),
      );
      if (cor) b.style.setProperty('--cor', cor);
      return b;
    };
    const time = contasDoTime();
    contas.replaceChildren(
      linhaEscolha('auto', 'Automática', auto ? `Agora seria ${auto.conta.nome}: ${auto.motivo}` : 'Nenhuma conta disponível', null, ''),
      // Uma sessao em cada conta, dividindo a tarefa: so faz sentido com duas contas ou mais.
      ...(time.length >= 2
        ? [
            el(
              'button',
              { class: 'escolha', type: 'button', role: 'radio', 'aria-checked': String(ehTime()), onclick: () => ((contaId = 'equipe'), desenharContas(), desenharOnde(), aplicarAgente(true)) },
              el('span', { class: 'patos-equipe' }, ...time.slice(0, 5).map((c) => miniPato('parado', c.cor, c.pato))),
              el('span', { class: 't' }, el('b', { text: 'Todas as contas' }), el('span', { text: 'Cada conta abre uma sessão e elas dividem a tarefa' })),
              el('span', { class: 'uso-escolha', text: plural(time.length, 'conta', 'contas') }),
            ),
          ]
        : []),
      ...S.contas.map((c) => {
        const u = c.usage?.five_hour?.pct;
        return linhaEscolha(c.id, c.nome, `${agenteDaConta(c).nome}${c.instalado === false ? ' · não instalado' : ''}${c.email ? ` · ${c.email}` : ''}`, c.cor, typeof u === 'number' ? `${Math.round(u)}% em 5 h` : '');
      }),
    );
  }
  function desenharOnde() {
    // A nuvem e so do Claude Code; o terminal do sistema, so no app do computador.
    const claude = (contaEscolhida()?.agente || 'claude') === 'claude';
    if (ehTime() || (onde === 'nuvem' && !claude)) onde = 'duckv';
    ondeChips.replaceChildren(
      ...[
        ['duckv', 'Neste computador', 'monitor', true],
        ['nuvem', 'Na nuvem', 'cloud', claude && !ehTime()],
        ['sistema', 'Terminal do sistema', 'terminal-window', !!S.desktop && !ehTime()],
      ]
        .filter(([, , , pode]) => pode)
        .map(([v, t, ic]) => el('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(onde === v), onclick: () => ((onde = v), desenharOnde(), aplicarAgente(false)) }, icone(ic, 16), t)),
    );
  }
  let agenteAtual = null;
  function aplicarAgente(trocouConta) {
    const c = contaEscolhida();
    const ag = agenteDaConta(c);
    const p = c?.padroes || {};
    if (agenteAtual !== ag.id) {
      agenteAtual = ag.id;
      modelo.definirOpcoes(ag.modelos.map((m) => ({ v: m.id, t: m.rotulo })));
      esforco.definirOpcoes([{ v: '', t: 'Padrão' }, ...ag.esforcos.map((e) => ({ v: e.id, t: e.rotulo }))]);
      modo.definirOpcoes(ag.modos.map((m) => ({ v: m.id, t: m.rotulo, apoio: MODOS_AJUDA[m.id] || '' })));
    }
    if (trocouConta) {
      if (p.model) modelo.value = p.model;
      esforco.value = p.effort || '';
      if (p.mode) modo.value = p.mode;
      if (p.cwd && !caminho.value.trim()) caminho.value = p.cwd;
    }
    esforco.disabled = !ag.esforcos.length;
    const nuvem = onde === 'nuvem';
    const time = ehTime();
    // Na equipe, cada conta abre com os padroes dela: modelo, esforco e modo saem de cena, e a tarefa
    // (obrigatoria) da o nome das sessoes.
    ajustes.hidden = onde !== 'duckv' || time;
    ajudaModo.hidden = onde !== 'duckv' || time;
    campoNome.hidden = nuvem || time;
    campoPasta.hidden = nuvem;
    campoRepo.hidden = !nuvem;
    if (nuvem) carregarRepos();
    // o terminal do sistema abre o agente cru, sem primeira mensagem
    campoTarefa.hidden = onde === 'sistema';
    rotuloTarefa.textContent = time ? 'O que as contas devem fazer' : nuvem ? 'O que a sessão deve fazer' : 'Primeira mensagem';
    tarefa.placeholder = time
      ? 'Ex.: Revise o app inteiro e corrija o que estiver fora do padrão.'
      : nuvem
        ? 'Ex.: Corrija o teste de pagamento que está falhando e abra um pull request.'
        : 'Opcional. Ex.: Rode os testes e corrija o que estiver falhando.';
    tarefa.maxLength = nuvem ? 4000 : 8000;
    ajudaTarefa.hidden = nuvem || time;
    ajudaNuvem.hidden = !nuvem;
    ajudaEquipe.hidden = !time;
    ajudaModo.textContent = MODOS_AJUDA[modo.value] || '';
    abrir.textContent = time ? `Abrir com ${contasDoTime().length} contas` : onde === 'sistema' ? 'Abrir no terminal' : nuvem ? 'Criar na nuvem' : 'Abrir sessão';
    d.querySelector('.dialogo-topo p').textContent = time
      ? 'Uma sessão em cada conta, na mesma pasta, trabalhando ao mesmo tempo.'
      : nuvem
        ? 'Cria uma sessão do Claude Code na nuvem da Anthropic.'
        : 'Abre no computador. Você acompanha e comanda daqui, do celular ou pelo terminal.';
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
    if (!c && !ehTime()) return falhou('Escolha uma conta.');
    if (onde === 'nuvem' && !repoEscolhido) {
      falhou('Escolha o repositório do GitHub.');
      return buscaRepo.focus();
    }
    if (!cwd && onde !== 'nuvem') {
      erroPasta.textContent = 'Escolha a pasta do projeto.';
      erroPasta.hidden = false;
      return caminho.focus();
    }
    // "Todas as contas": o servidor abre uma sessao por conta e manda o briefing de equipe em cada uma.
    if (ehTime()) {
      if (tarefa.value.trim().length < 3) {
        falhou('Escreva o que as contas devem fazer.');
        return tarefa.focus();
      }
      abrir.disabled = true;
      abrir.textContent = 'Abrindo as sessões…';
      return mandar({ t: 'equipe', cwd, texto: tarefa.value }, (erro, r) => {
        abrir.disabled = false;
        aplicarAgente(false);
        if (erro) return falhou(erro);
        d.close();
        const abertas = (r.instances || []).length;
        const falhas = r.falhas || [];
        avisar(falhas.length ? `${plural(abertas, 'conta abriu', 'contas abriram')}. ${falhas[0].conta}: ${falhas[0].erro}` : `${plural(abertas, 'conta trabalhando', 'contas trabalhando')} na mesma pasta`);
        area.juntas(r.instances || []);
      });
    }
    if (onde === 'nuvem' && tarefa.value.trim().length < 3) {
      falhou('Escreva o que a sessão deve fazer.');
      return tarefa.focus();
    }
    abrir.disabled = true;
    if (onde === 'nuvem') {
      abrir.textContent = 'Criando na nuvem…';
      const local = repos?.find((x) => x.repo === repoEscolhido)?.pasta;
      abrir.textContent = local ? 'Criando na nuvem…' : 'Baixando e criando…';
      return mandar({ t: 'nuvemNova', account: c.id, repo: repoEscolhido, texto: tarefa.value }, (erro, r) => {
        abrir.disabled = false;
        abrir.textContent = 'Criar na nuvem';
        if (erro) return falhou(erro);
        avisar('Sessão criada na nuvem');
        d.close();
        area.abrir(r.instance, { aoLado: opts.aoLado });
      });
    }
    if (onde === 'sistema') {
      return mandar({ t: 'terminalDoSistema', account: c.id, cwd }, (erro) => {
        abrir.disabled = false;
        if (erro) return falhou(erro);
        avisar(`Abrindo ${c.nome} numa janela de terminal`);
        d.close();
      });
    }
    const primeira = tarefa.value.trim();
    mandar({ t: 'start', account: c.id, cwd, name: nome.value.trim(), texto: primeira || undefined, model: modelo.value, effort: esforco.value || null, mode: modo.value, cols: 110, rows: 34 }, (erro, r) => {
      abrir.disabled = false;
      if (erro) return falhou(erro);
      d.close();
      area.abrir(r.instance, { aoLado: opts.aoLado });
    });
  });
  desenharContas();
  desenharOnde();
  aplicarAgente(true);
  d.showModal();
  (!caminho.value ? caminho : ehTime() ? tarefa : nome).focus();
}

// ------------------------------------------------------------ historico de conversas
function abrirHistorico(contaId) {
  const conta = S.contas.find((c) => c.id === contaId);
  if (!conta) return;
  const claude = (conta.agente || 'claude') === 'claude';
  const { d, corpo, pe } = dialogo(`Conversas de ${conta.nome}`, claude ? 'Deste computador, do app Claude, da nuvem e do Cowork. Abra para ler ou continuar.' : 'Inclusive as feitas no computador. Abra para ler ou continuar.');
  d.classList.add('historico');
  const filtro = el('input', { type: 'search', placeholder: 'Filtrar por título, pasta ou repositório', 'aria-label': 'Filtrar conversas' });
  // Filtro por origem: so aparecem as origens que tem alguma conversa.
  const GRUPOS = [
    ['todas', 'Todas', null, null],
    ['computador', 'Computador', 'conta', (x) => x.origem !== 'desktop' && x.origem !== 'nuvem' && x.origem !== 'cowork'],
    ['app', 'App Claude', 'app', (x) => x.origem === 'desktop'],
    ['nuvem', 'Nuvem', 'nuvem', (x) => x.origem === 'nuvem'],
    ['cowork', 'Cowork', 'cowork', (x) => x.origem === 'cowork'],
  ];
  let grupo = 'todas';
  const chips = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Origem' });
  const esqueleto = () => el('div', { class: 'escolha esqueleto', 'aria-hidden': 'true' }, el('i'), el('span', { class: 't' }, el('b'), el('span')));
  const lista = el('div', { class: 'escolhas historico-lista', 'aria-busy': 'true' }, ...Array.from({ length: 5 }, esqueleto));
  const aviso = el('p', { class: 'historico-aviso', hidden: true });
  corpo.append(filtro, chips, aviso, lista);
  const atualizar = el('button', { class: 'botao texto', type: 'button', onclick: () => buscar(true) }, icone('arrows-clockwise', 18), 'Atualizar');
  pe.append(atualizar, el('span', { class: 'espaco' }), el('button', { class: 'botao texto', type: 'button', text: 'Fechar', onclick: () => d.close() }));
  let itens = [];
  const desenharChips = () => {
    chips.replaceChildren(
      ...GRUPOS.filter(([, , , teste]) => !teste || itens.some(teste)).map(([id, rotulo, origem, teste]) =>
        el(
          'button',
          { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(grupo === id), onclick: () => ((grupo = id), desenharChips(), desenharLista()) },
          origem ? icone(ORIGENS[origem].icone, 16) : null,
          rotulo,
          el('span', { class: 'n', text: String(teste ? itens.filter(teste).length : itens.length) }),
        ),
      ),
    );
    chips.hidden = chips.childElementCount < 3;
  };
  const desenharLista = () => {
    const q = semAcento(filtro.value.trim());
    const teste = GRUPOS.find(([id]) => id === grupo)?.[3];
    const achados = itens.filter((x) => (!teste || teste(x)) && (!q || semAcento(`${x.titulo} ${x.cwd || ''} ${x.repo || ''}`).includes(q))).slice(0, 200);
    lista.removeAttribute('aria-busy');
    lista.replaceChildren(
      ...(achados.length
        ? achados.map((x) => {
            const o = ORIGENS[x.origem] || ORIGENS.conta;
            const onde = [x.resumo, x.repo || pasta(x.cwd), x.mtime ? `${fData.format(x.mtime)} ${fHora.format(x.mtime)}` : ''].filter(Boolean).join(' · ');
            const estado = x.estado === 'working' ? 'Trabalhando' : x.estado === 'waiting' ? 'Esperando você' : x.estado === 'ended' ? 'Arquivada' : null;
            return el(
              'button',
              {
                class: 'escolha',
                type: 'button',
                'data-o': x.origem,
                onclick: (ev) =>
                  mandar({ t: 'abrirHistorico', account: contaId, sid: x.sid }, (erro, r) => {
                    if (erro) return avisar(erro);
                    d.close();
                    area.abrir(r.instance, { aoLado: ev.ctrlKey || ev.metaKey });
                  }),
              },
              el('span', { class: 'hist-ic', title: o.longo }, icone(o.icone, 18)),
              el('span', { class: 't' }, el('b', { text: x.titulo || 'Sem título' }), el('span', { text: onde })),
              estado ? el('span', { class: 'hist-estado', 'data-e': x.estado, text: estado }) : el('span'),
            );
          })
        : [el('p', { class: 'p-nota historico-nada', text: q ? 'Nada com esse filtro.' : 'Nenhuma conversa ainda.' })]),
    );
  };
  filtro.addEventListener('input', desenharLista);
  function buscar(denovo = false) {
    atualizar.disabled = true;
    mandar({ t: 'historico', account: contaId, atualizar: denovo }, (erro, r) => {
      atualizar.disabled = false;
      if (erro) return lista.replaceChildren(el('p', { class: 'erro', text: erro }));
      itens = r.itens || [];
      aviso.hidden = !r.nuvem?.erro;
      aviso.replaceChildren(icone('cloud', 16), el('span', { text: r.nuvem?.erro || '' }));
      if (!GRUPOS.some(([id, , , t]) => id === grupo && (!t || itens.some(t)))) grupo = 'todas';
      desenharChips();
      desenharLista();
    });
  }
  buscar();
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

function procurarTailscale(botao) {
  botao.disabled = true;
  mandar({ t: 'tailscaleConferir' }, (e, r) => {
    botao.disabled = false;
    avisar(e || (r.tailnet ? `Tailscale conectado: ${r.tailnet}. O código já foi atualizado.` : 'O Tailscale ainda não está conectado neste computador.'));
  });
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
        : el('li', { class: 'p-nota', text: 'Nenhum aparelho conectado ainda.' }),
    );
    raiz.replaceChildren(
      el(
        'div',
        { class: 'pagina-largura' },
        el('div', null, el('h2', { class: 'titulo-pagina', text: 'Celulares' }), el('p', { class: 'sub', text: 'Acompanhe e comande as mesmas sessões pelo app duckV no Android, ou pelo navegador no iPhone, no Mac e em outros computadores.' })),
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
              dk.tailnet
                ? el('p', { class: 'ajuda', text: `Pelo Tailscale (${dk.tailnet}), o celular conecta de qualquer lugar.` })
                : el(
                    'div',
                    { class: 'aviso-faixa neutra' },
                    icone('warning-circle', 20),
                    el(
                      'div',
                      null,
                      el('b', { text: 'O Tailscale não está conectado neste computador' }),
                      el('p', { text: 'Sem ele, este código só funciona aqui mesmo. Ligue o Tailscale (no computador e no celular, com a mesma conta): o duckV percebe sozinho em até 20 segundos e troca o código.' }),
                      el('button', { class: 'botao texto pequeno', type: 'button', onclick: (ev) => procurarTailscale(ev.currentTarget) }, icone('arrows-clockwise', 16), 'Procurar o Tailscale agora'),
                    ),
                  ),
              el('p', { class: 'ajuda', text: 'O código muda depois de cada celular conectado. Não compartilhe a imagem.' }),
              el('div', { class: 'chips' }, el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => mandar({ t: 'parearNovoCodigo' }, (e) => avisar(e || 'Código novo gerado')) }, icone('arrows-clockwise', 16), 'Gerar outro código')),
            ),
          ),
        ),
        el(
          'section',
          { class: 'bloco' },
          el('h3', { text: 'No navegador: Mac, iPhone ou outro computador' }),
          el('p', { class: 'ajuda', text: 'O duckV também abre no navegador, sem instalar nada. No Mac e em outros computadores aparece esta mesma tela; no iPhone, a versão para celular.' }),
          el(
            'ol',
            { class: 'passos' },
            el('li', null, el('b', { text: 'iPhone: ' }), 'abra o app Câmera e aponte para o código acima. O link abre no Safari, que mostra 4 números para você digitar aqui. Depois, toque em Compartilhar e em ', el('b', { text: 'Adicionar à Tela de Início' }), ' para ter o ícone do duckV.'),
            el('li', null, el('b', { text: 'Mac ou outro computador: ' }), 'copie o link abaixo e abra no navegador de lá (mande para você mesmo, por exemplo). Ele mostra 4 números para você digitar aqui.'),
          ),
          dk.tailnet ? null : el('p', { class: 'ajuda', text: 'Sem o Tailscale, o link só abre neste computador.' }),
          el(
            'div',
            { class: 'chips' },
            el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => navigator.clipboard.writeText(dk.link).then(() => avisar('Link copiado. Ele vale para um aparelho e muda depois de usado.'), () => avisar('Não consegui copiar o link.')) }, icone('copy', 16), 'Copiar link para um navegador'),
          ),
          el('p', { class: 'ajuda', text: 'O link sozinho não dá acesso: o aparelho só entra depois que você digita aqui os 4 números que aparecem nele.' }),
        ),
        el('section', { class: 'bloco' }, el('h3', { text: 'Aparelhos conectados' }), el('p', { class: 'ajuda', text: 'Cada aparelho tem a própria chave. Desconectar apaga a chave daquele aparelho na hora.' }), lista),
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
    const c = interruptor(marcado, aoMudar, titulo);
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
      const s = seletor({ rotulo, opcoes, valor: atual ?? '', aoMudar: (v) => salvar({ op: 'conta', id: c.id, padroes: { [chave]: v || null } }) });
      return el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: rotulo }), s);
    };
    const pastaPadrao = el('input', { type: 'text', value: p.cwd || '', spellcheck: false, placeholder: S.host.home || '', 'aria-label': 'Pasta padrão' });
    pastaPadrao.addEventListener('change', () => salvar({ op: 'conta', id: c.id, padroes: { cwd: pastaPadrao.value } }));
    const entrar = el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => entrarNaConta(c) }, icone('sign-in', 16), c.email ? 'Entrar de novo' : 'Entrar nesta conta');
    const remover = el('button', {
      class: 'botao perigo pequeno',
      type: 'button',
      onclick: async () =>
        (await confirmar({ titulo: `Remover ${c.nome} do duckV?`, texto: 'A conta sai da lista e o atalho dela é apagado. O login e as conversas continuam na pasta da conta, no computador.', sim: 'Remover', perigo: true })) &&
        mandar({ t: 'conta', op: 'remover', id: c.id }, (e) => avisar(e || 'Conta removida')),
    }, icone('trash', 16), 'Remover conta');
    const podeSair = c.email && !c.padrao && ag.podeSair;
    const sair = podeSair ? el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => sairDaConta(c) }, icone('sign-out', 16), 'Sair desta conta') : null;
    const pato = miniPato('parado', c.cor, c.pato);
    // o patinho da conta: escolher um troca a cara do pato e a cor da conta de uma vez, como no celular
    const patinhos = el('div', { class: 'patinhos', role: 'radiogroup', 'aria-label': 'Patinho da conta' });
    for (const t of TIPOS_PATO) {
      const b = el('button', { type: 'button', role: 'radio', class: 'patinho', title: `${t.nome}: ${t.sobre}`, 'aria-label': t.nome, 'aria-checked': String(tipoPato(c.pato).id === t.id), onclick: () => ([...patinhos.children].forEach((o) => o.setAttribute('aria-checked', String(o === b))), salvar({ op: 'conta', id: c.id, pato: t.id, cor: t.cor }, `Patinho: ${t.nome}`)) }, miniPato('parado', t.cor, t.id), el('span', { text: t.nome }));
      patinhos.append(b);
    }
    return el(
      'div',
      { class: 'conta-edicao' },
      el('div', { class: 'cab' }, pato, el('span', { class: 't' }, el('b', null, c.nome, chipAgente(c)), el('span', { text: [c.email || 'Sem login', c.plano].filter(Boolean).join(' · ') })), entrar),
      el('div', { class: 'lado-a-lado' }, el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Nome' }), nome), el('div', { class: 'campo', style: 'grid-column: span 2' }, el('span', { class: 'rotulo', text: 'Cor' }), cores)),
      el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Patinho' }), patinhos),
      el('div', { class: 'lado-a-lado' }, sel('Modelo ao abrir', ag.modelos.map((m) => [m.id, m.rotulo]), p.model || 'default', 'model'), sel('Esforço', [['', 'Padrão'], ...ag.esforcos.map((e) => [e.id, e.rotulo])], p.effort || '', 'effort'), sel('Permissões', ag.modos.map((m) => [m.id, m.rotulo]), p.mode || ag.modos[0]?.id, 'mode')),
      el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Pasta padrão' }), pastaPadrao),
      el('div', { class: 'chips' }, sair, remover),
      c.padrao && c.email ? el('p', { class: 'ajuda', text: 'Esta conta usa o login de sempre deste computador. Para sair dela, use /logout no próprio agente.' }) : null,
    );
  }
  function desenharContas() {
    const nova = JSON.stringify(S.contas.map((c) => [c.id, c.nome, c.cor, c.pato, c.email, c.padroes, c.agente, c.instalado]));
    if (nova === marcaContas) return;
    if (caixaContas.contains(document.activeElement) && marcaContas) return;
    marcaContas = nova;
    const nomeNova = el('input', { type: 'text', maxLength: 30, placeholder: 'Nome da conta nova', 'aria-label': 'Nome da conta nova' });
    const agNova = seletor({ rotulo: 'Agente da conta nova', opcoes: (S.host.agentes || []).map((a) => ({ v: a.id, t: a.nome, apoio: a.empresa })) });
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
          chipsUnicos('Pato', [['animado', 'Animado, com gracinhas'], ['calmo', 'Sem gracinhas'], ['parado', 'Parado'], ['escondido', 'Sem pato']], LOCAL.pato, (v) => guardarLocal('pato', v)),
          linhaSwitch('Mostrar as ferramentas na conversa', 'As linhas com cada ferramenta que o agente usa.', LOCAL.ferramentas, (v) => (guardarLocal('ferramentas', v), area.paineis().forEach((p) => p.iniciar()))),
        ),
        caixaContas,
        el(
          'section',
          { class: 'bloco' },
          el('h3', { text: 'Avisos' }),
          linhaSwitch('Avisos nesta janela', permissaoAvisos === 'denied' ? 'O sistema bloqueou os avisos desta janela.' : 'Quando a janela não está em foco: pedidos, perguntas e fim de tarefa.', LOCAL.avisos && permissaoAvisos !== 'denied', async (v) => {
            if (v && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
            if (v && 'Notification' in window && Notification.permission === 'denied') {
              avisar('O sistema bloqueou os avisos desta janela. Libere nas configurações do navegador.');
              return false;
            }
            guardarLocal('avisos', v);
          }),
          el('p', { class: 'ajuda', text: 'Nos celulares conectados:' }),
          linhaSwitch('Quando uma conta pedir permissão', null, a.perm, (v) => salvar({ op: 'avisos', perm: v })),
          linhaSwitch('Quando uma sessão terminar a vez', null, a.fim, (v) => salvar({ op: 'avisos', fim: v })),
          linhaSwitch('Quando um limite reiniciar', null, a.reset, (v) => salvar({ op: 'avisos', reset: v })),
        ),
        el('section', { class: 'bloco' }, el('h3', { text: 'GitHub' }), el('p', { class: 'ajuda', text: 'Para criar sessões na nuvem a partir dos seus repositórios.' }), cartaoGithub()),
        el('section', { class: 'bloco' }, el('h3', { text: 'Mensagens rápidas' }), el('p', { class: 'ajuda', text: 'Botões acima da caixa de mensagem de cada sessão, aqui e no celular.' }), caixaRapidas, formR),
        !JANELA_APP && window.duckvTrocarTela
          ? el(
              'section',
              { class: 'bloco' },
              el('h3', { text: 'Versão da tela' }),
              el('p', { class: 'ajuda', text: 'Este navegador abre a versão para computador. Num celular ou numa janela estreita, a versão para celular fica mais confortável.' }),
              el('div', { class: 'chips' }, el('button', { class: 'botao quieto pequeno', type: 'button', onclick: () => window.duckvTrocarTela('celular') }, icone('device-mobile', 16), 'Usar a versão para celular')),
            )
          : null,
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
  const abrirLateral = el('button', { class: 'so-icone so-estreita', type: 'button', 'aria-label': 'Mostrar a barra lateral', title: `Mostrar a barra lateral (${CTRL}+B)`, onclick: alternarLateral }, icone('sidebar-simple', 20));
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
      fecharMenu();
      const trocou = obj.atual !== nome || !corpo.firstChild;
      obj.atual = nome;
      if (nome === 'paineis') corpo.replaceChildren(area.paineis().length ? area.grade : vazio);
      else corpo.replaceChildren(telas[nome].raiz);
      if (trocou) animarEntrada(corpo.firstChild, 'entra-tela');
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
  const nova = telaInteira.dataset.titulo !== titulo;
  telaInteira.dataset.titulo = titulo;
  telaInteira.replaceChildren(el('div', null, miniPato('dorme'), el('h1', { text: titulo }), el('p', { text: texto }), extra));
  if (nova) animarEntrada(telaInteira.firstChild, 'entra-tela');
}
let montado = false;
function desenhar() {
  if (!S.pareado) {
    if (JANELA_APP) mostrarInteira('Esta janela não está conectada', 'Abra o duckV pelo app do computador. Se ele já está aberto num terminal, feche aquela janela e abra o app, ou continue pelo terminal.');
    else
      mostrarInteira(
        'Este navegador ainda não foi conectado',
        'Para usar o duckV aqui, ele precisa ser liberado no computador onde o duckV está ligado:',
        el(
          'ol',
          { class: 'passos-inteira' },
          el('li', null, 'No computador do duckV, abra a tela ', el('b', { text: 'Celulares' }), ' e clique em ', el('b', { text: 'Copiar link para um navegador' }), '. Pelo terminal, use o link que ele mostra ao ligar.'),
          el('li', null, 'Abra esse link aqui. No iPhone, basta apontar a Câmera para o código da tela Celulares.'),
          el('li', null, 'Este navegador mostra ', el('b', { text: '4 números' }), ': digite-os no computador para liberar.'),
        ),
      );
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
