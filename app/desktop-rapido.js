'use strict';
// Abertura rapida do duckV (Ctrl+Alt+Espaco, o menu da bandeja ou `--rapido`): uma janela pequena por
// cima de tudo para escolher a conta (ou todas), a pasta e abrir uma sessao com a primeira mensagem, ou
// pular para uma sessao que ja esta aberta. Enter abre; Esc fecha; clicar fora tambem fecha.
/* global icone */

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'title' || k === 'for') node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}
const SVG = 'http://www.w3.org/2000/svg';
const app = window.duckvApp || {};
const pasta = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

// Tema e pato: os mesmos da janela grande (guardados por ela).
const LOCAL = { tema: 'sistema', pato: 'animado' };
try {
  Object.assign(LOCAL, JSON.parse(localStorage.getItem('duckv-notebook') || '{}'));
} catch {
  /* padrao */
}
document.documentElement.dataset.tema = LOCAL.tema;
document.documentElement.dataset.pato = LOCAL.pato;
// A ultima conta e pasta escolhidas aqui voltam na proxima vez.
let lembrado = {};
try {
  lembrado = JSON.parse(localStorage.getItem('duckv-rapido') || '{}');
} catch {
  /* primeira vez */
}
function lembrar() {
  try {
    localStorage.setItem('duckv-rapido', JSON.stringify({ conta: escolha.conta, pasta: escolha.pasta }));
  } catch {
    /* sem armazenamento */
  }
}

// ------------------------------------------------------------ o pato (o mesmo desenho da janela)
const SPRITE = ['.........OOOO...', '........OBBBBO..', '........OBBeBkkk', '........OBBBBqq.', '.T......obbbo...', 'TtT...oobbbbo...', 'Tttooobbbbbbbo..', 'obbbbwwwbbbbbo..', '.obbbbwwwbbbo...', '..obbbbbbbbo....', '...oooooooo.....', '.....f...g......', '....ff..gg......'];
const PARTES = { O: ['cabeca', 'contorno'], B: ['cabeca', 'penas'], e: ['cabeca', 'olho'], k: ['cabeca', 'bico'], q: ['cabeca', 'queixo'], o: ['tronco', 'contorno'], b: ['tronco', 'penas'], w: ['tronco', 'asa'], T: ['rabo', 'contorno'], t: ['rabo', 'penas'], f: ['pes', 'pe pe-a'], g: ['pes', 'pe pe-b'] };
const EXTRAS = { 'olho-fechado': [[10, 2.6, 2, 0.45]], 'sinal exclama': [[11, -5], [11, -4], [11, -3], [11, -1]], 'sinal sono': [[14, -4], [15, -4], [16, -4], [15, -3], [14, -2], [15, -2], [16, -2]] };
const TIPOS_PATO = {
  classico: { penas: '#fff6ee', asa: '#e6d3bf', bico: '#ffd84a', pe: '#ff9a3d' },
  borracha: { penas: '#ffd23f', asa: '#f2b705', bico: '#ff8a00', pe: '#ff8a00' },
  marreco: { penas: '#d9c7a8', asa: '#8c6e4e', bico: '#e8c547', pe: '#f28c28', cabeca: '#2e7d4f' },
  pessego: { penas: '#ffdccb', asa: '#f7b79a', bico: '#ff8a65', pe: '#ff8a65' },
  chocolate: { penas: '#9a6644', asa: '#6b4226', bico: '#f2b24c', pe: '#e07b39' },
  mar: { penas: '#e6eef5', asa: '#9ec3dd', bico: '#ffc94a', pe: '#6fa8dc' },
  noturno: { penas: '#4a4152', asa: '#6e6279', bico: '#ffb347', pe: '#ffb347', contorno: '#15111a' },
  rosa: { penas: '#ffc9df', asa: '#f48fb1', bico: '#ffd84a', pe: '#f06292' },
};
function miniPato(estado, conta) {
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
    for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, v);
  };
  const sombra = no('g', 'sombra-pato', svg);
  for (let x = 3; x < 12; x++) ponto(sombra, x, 13.4, 1.03, 0.9);
  const partes = {};
  for (const nome of ['pes', 'rabo', 'tronco', 'cabeca']) partes[nome] = { g: no('g', nome, svg), cores: {} };
  SPRITE.forEach((linha, y) => [...linha].forEach((c, x) => PARTES[c] && ponto((partes[PARTES[c][0]].cores[PARTES[c][1]] ||= no('g', PARTES[c][1], partes[PARTES[c][0]].g)), x, y)));
  for (const [classe, pontos] of Object.entries(EXTRAS)) {
    const g = no('g', classe, classe.startsWith('sinal') ? svg : partes.cabeca.g);
    for (const [x, y, w, h] of pontos) ponto(g, x, y, w, h);
  }
  const pista = el('div', { class: 'pista', 'data-estado': estado }, el('div', { class: 'trilho' }, el('div', { class: 'vira' }, el('div', { class: 'bicho' }, svg))));
  const caixa = el('span', { class: 'mini-pato' }, pista);
  const t = TIPOS_PATO[conta?.pato] || TIPOS_PATO.classico;
  caixa.style.setProperty('--cor', conta?.cor || '#ff7a1a');
  caixa.style.setProperty('--pato-penas', t.penas);
  caixa.style.setProperty('--pato-asa', t.asa);
  caixa.style.setProperty('--pato-bico', t.bico);
  caixa.style.setProperty('--pato-pe', t.pe);
  caixa.style.setProperty('--pato-cabeca', t.cabeca || t.penas);
  if (t.contorno) caixa.style.setProperty('--pato-contorno-claro', t.contorno);
  return caixa;
}

// ------------------------------------------------------------ estado e ligacao
let S = { pronto: false, contas: [], sessoes: [], host: { available: false, agentes: [], folders: [] } };
let ligado = false;
let ws = null;
let ref = 0;
const pendentes = new Map();
function mandar(obj, aoResponder) {
  if (!ws || ws.readyState !== 1) return aoResponder?.('Sem conexão com o duckV.');
  if (aoResponder) {
    obj.ref = ++ref;
    pendentes.set(obj.ref, aoResponder);
  }
  ws.send(JSON.stringify(obj));
}
function ligar() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => ((ligado = true), desenhar());
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.t === 'state') {
      S = { pronto: true, contas: m.accounts || [], sessoes: m.instances || [], host: m.host || S.host };
      desenhar();
    } else if (m.t === 'ack' || m.t === 'err') {
      const f = pendentes.get(m.ref);
      pendentes.delete(m.ref);
      f?.(m.t === 'err' ? m.msg : null, m);
    }
  };
  ws.onclose = () => {
    ws = null;
    ligado = false;
    for (const f of pendentes.values()) f('Sem conexão com o duckV.');
    pendentes.clear();
    desenhar();
    setTimeout(ligar, 1500);
  };
}

// ------------------------------------------------------------ regras (as mesmas da janela grande)
const precisa = (s) => s.status !== 'ended' && (s.status === 'waiting' || s.perms?.length > 0 || (s.hosted && !!s.pergunta));
const vivas = (contaId) => S.sessoes.filter((s) => s.status !== 'ended' && (!contaId || s.account === contaId));
const contaDe = (s) => S.contas.find((c) => c.id === s.account) || { id: s.account, nome: s.account, cor: '#ff7a1a' };
const nomeDaSessao = (s) => s.name || pasta(s.cwd) || 'Sessão';
const estadoDoPato = (s) => (s.status === 'ended' ? 'dorme' : precisa(s) ? 'pede' : s.status === 'working' ? 'trabalha' : 'parado');
const disponiveis = () => S.contas.filter((c) => c.instalado !== false);
const agenteDe = (c) => S.host.agentes?.find((a) => a.id === (c?.agente || 'claude')) || { modelos: [], modos: [] };
function oQueFaz(s) {
  if (s.perms?.length) return `Pede você: ${s.perms[0].tool}`;
  if (precisa(s)) return s.activity || 'Esperando você';
  if (s.status === 'working') return s.activity || 'Trabalhando';
  return 'Esperando mensagem';
}
function contaAutomatica() {
  const nota = (c) => {
    const u5 = c.usage?.five_hour?.pct;
    const u7 = c.usage?.seven_day?.pct;
    if (u5 >= 100 || u7 >= 100) return 1000 + (u5 || 0);
    return (u5 ?? 50) + Math.max(0, (u7 ?? 0) - 70) + vivas(c.id).length * 4;
  };
  const lista = disponiveis();
  return [...lista].filter((c) => (c.agente || 'claude') === 'claude').sort((a, b) => nota(a) - nota(b))[0] || [...lista].sort((a, b) => nota(a) - nota(b))[0] || null;
}
const pct = (c) => (typeof c?.usage?.five_hour?.pct === 'number' ? Math.round(c.usage.five_hour.pct) : null);
const fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
function dicaDoUso(c) {
  const u = c.usage?.five_hour;
  if (typeof u?.pct !== 'number') return 'Sem leitura de uso ainda';
  const reinicia = u.resets_at ? `, reinicia às ${fHora.format(new Date(u.resets_at))}` : '';
  return `${Math.round(u.pct)}% do limite de 5 horas usado${reinicia}`;
}

// ------------------------------------------------------------ a escolha
// conta: 'auto', 'todas' ou o id de uma conta; pasta: caminho.
const escolha = { conta: lembrado.conta || 'auto', pasta: lembrado.pasta || '' };
const contaReal = () => (escolha.conta === 'auto' ? contaAutomatica() : escolha.conta === 'todas' ? null : S.contas.find((c) => c.id === escolha.conta) || null);
function validarEscolha() {
  if (escolha.conta !== 'auto' && escolha.conta !== 'todas' && !disponiveis().some((c) => c.id === escolha.conta)) escolha.conta = 'auto';
  if (escolha.conta === 'todas' && disponiveis().length < 2) escolha.conta = 'auto';
  const opcoes = pastas();
  if (!escolha.pasta || !opcoes.includes(escolha.pasta)) escolha.pasta = opcoes[0] || '';
}
// A pasta padrao da conta escolhida primeiro, depois as recentes do computador.
function pastas() {
  const padrao = contaReal()?.padroes?.cwd;
  return [...new Set([escolha.pasta, padrao, ...(S.host.folders || [])].filter(Boolean))].slice(0, 5);
}

// ------------------------------------------------------------ a tela
const raiz = document.getElementById('rapido');
const texto = el('textarea', { id: 'r-texto', rows: 1, maxLength: 8000, spellcheck: false, autocomplete: 'off', placeholder: 'Ex.: rode os testes e corrija o que estiver falhando' });
const rotuloTexto = el('label', { class: 'r-rotulo', for: 'r-texto' });
const patoCampo = el('span', { class: 'r-pato', 'aria-hidden': 'true' });
const erro = el('p', { class: 'r-erro', role: 'alert', hidden: true });
const contas = el('div', { class: 'r-contas', role: 'radiogroup', 'aria-label': 'Conta' });
const listaPastas = el('div', { class: 'r-pastas', role: 'radiogroup', 'aria-label': 'Pasta do projeto' });
const tituloSessoes = el('h2', { class: 'r-secao', id: 'r-sessoes-titulo' });
const sessoes = el('ul', { class: 'r-sessoes', role: 'listbox', 'aria-labelledby': 'r-sessoes-titulo' });
const blocoSessoes = el('section', { class: 'r-bloco-sessoes' }, tituloSessoes, sessoes);
const abrir = el('button', { class: 'botao principal', type: 'submit' });
const mais = el('button', { class: 'botao texto', type: 'button', text: 'Mais opções', onclick: maisOpcoes });
// "Mais opcoes" leva o que ja foi escolhido e escrito; a pessoa so ajusta modelo, esforco, permissoes ou nuvem.
function maisOpcoes() {
  app.rapidoNova?.(escolha.conta === 'todas' ? 'todas' : contaReal()?.id || '', escolha.pasta, texto.value);
}
const estadoGeral = el('div', { class: 'r-estado', hidden: true });
const dicas = el(
  'div',
  { class: 'r-dicas', 'aria-hidden': 'true' },
  el('span', null, el('kbd', { class: 'atalho', text: '↓' }), 'sessões'),
  el('span', { class: 'r-dica-contas' }, el('kbd', { class: 'atalho' }), 'conta'),
  el('span', null, el('kbd', { class: 'atalho', text: 'Esc' }), 'fechar'),
);
const form = el(
  'form',
  { class: 'r-cartao', noValidate: true },
  el('div', { class: 'r-topo' }, patoCampo, el('div', { class: 'r-entrada' }, rotuloTexto, texto)),
  erro,
  el('div', { class: 'r-escolhas' }, el('div', { class: 'r-linha' }, el('span', { class: 'r-lado', text: 'Conta' }), contas), el('div', { class: 'r-linha' }, el('span', { class: 'r-lado', text: 'Pasta' }), listaPastas)),
  estadoGeral,
  blocoSessoes,
  el('footer', { class: 'r-pe' }, dicas, el('span', { class: 'espaco' }), mais, abrir),
);
raiz.append(form);

function mostrarErro(t) {
  erro.textContent = t || '';
  erro.hidden = !t;
  medir();
}
function marcarRadio(grupo, valor) {
  for (const b of grupo.querySelectorAll('[role=radio]')) {
    const sim = b.dataset.v === valor;
    b.setAttribute('aria-checked', String(sim));
    b.tabIndex = sim ? 0 : -1;
  }
}
// Setas andam dentro do grupo (Conta, Pasta), como num grupo de radios.
function setas(grupo, aoEscolher) {
  grupo.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const bs = [...grupo.querySelectorAll('[role=radio]:not(:disabled)')];
    const i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? bs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length;
    ev.preventDefault();
    bs[j].focus();
    aoEscolher(bs[j].dataset.v);
  });
}
function escolherConta(v) {
  escolha.conta = v;
  escolha.pasta = '';
  validarEscolha();
  lembrar();
  mostrarErro('');
  desenhar();
}
function escolherPasta(v) {
  escolha.pasta = v;
  lembrar();
  marcarRadio(listaPastas, v);
}
setas(contas, escolherConta);
setas(listaPastas, escolherPasta);

let marcaContas = '';
function desenharContas() {
  const lista = disponiveis();
  const auto = contaAutomatica();
  const nova = JSON.stringify([S.contas.map((c) => [c.id, c.nome, c.cor, c.pato, c.instalado, pct(c), vivas(c.id).map(estadoDoPato)]), auto?.id]);
  if (nova !== marcaContas) {
    marcaContas = nova;
    const botao = (v, rotulo, apoio, dica, ...visual) => el('button', { class: 'r-conta', type: 'button', role: 'radio', 'data-v': v, title: dica, onclick: () => escolherConta(v) }, ...visual, el('span', { class: 't' }, el('b', { text: rotulo }), el('span', { text: apoio })));
    const estadoConta = (c) => {
      const vs = vivas(c.id);
      return vs.some(precisa) ? 'pede' : vs.some((s) => s.status === 'working') ? 'trabalha' : vs.length ? 'parado' : 'dorme';
    };
    // replaceChildren escreveria "null" no lugar das partes ausentes
    contas.replaceChildren(
      ...[
        botao('auto', 'Automática', auto ? auto.nome : 'nenhuma livre', auto ? `A conta com mais limite livre agora: ${auto.nome} (${dicaDoUso(auto)})` : 'Nenhuma conta pronta para abrir sessões', el('span', { class: 'r-ic' }, icone('sparkle', 18))),
        // as contas sem o agente instalado aparecem, mas nao podem ser escolhidas
        ...S.contas.map((c) => {
          const p = pct(c);
          const instalada = c.instalado !== false;
          const b = botao(c.id, c.nome, !instalada ? 'não instalado' : p == null ? 'sem leitura' : p >= 100 ? 'limite atingido' : `${p}% em 5 h`, instalada ? dicaDoUso(c) : 'O agente desta conta não está instalado neste computador', miniPato(estadoConta(c), c));
          b.classList.toggle('cheia', instalada && p >= 100);
          b.disabled = !instalada;
          return b;
        }),
        lista.length >= 2 ? botao('todas', 'Todas', `${lista.length} contas juntas`, 'Cada conta abre uma sessão na mesma pasta e elas dividem a tarefa', el('span', { class: 'r-trio' }, ...lista.slice(0, 4).map((c) => miniPato(estadoConta(c), c)))) : null,
      ].filter(Boolean),
    );
    const n = contas.querySelectorAll('[role=radio]').length;
    dicas.querySelector('.r-dica-contas kbd').textContent = `Ctrl 1-${n}`;
  }
  marcarRadio(contas, escolha.conta);
}

let marcaPastas = '';
function desenharPastas() {
  const lista = pastas();
  const nova = JSON.stringify(lista);
  if (nova !== marcaPastas) {
    marcaPastas = nova;
    listaPastas.replaceChildren(
      ...(lista.length
        ? lista.map((p) => el('button', { class: 'chip', type: 'button', role: 'radio', 'data-v': p, title: p, onclick: () => escolherPasta(p) }, icone('folder', 16), el('span', { class: 'r-pasta-nome', text: pasta(p) || p })))
        : [el('span', { class: 'r-nada', text: 'Nenhuma pasta recente. Use Mais opções para escolher uma.' })]),
    );
  }
  marcarRadio(listaPastas, escolha.pasta);
}

// Equipes ("Todas as contas"): as sessoes com o mesmo equipe.id andam juntas.
function equipes() {
  const grupos = new Map();
  for (const s of vivas()) if (s.equipe?.id) (grupos.get(s.equipe.id) || grupos.set(s.equipe.id, []).get(s.equipe.id)).push(s);
  return [...grupos.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => (a.equipe.ordem || 0) - (b.equipe.ordem || 0)));
}
let itensSessao = [];
let marcaSessoes = '';
function desenharSessoes() {
  const filtro = escolha.conta === 'auto' || escolha.conta === 'todas' ? null : escolha.conta;
  const ordem = (s) => (precisa(s) ? 0 : s.status === 'working' ? 1 : 2);
  const lista = vivas(filtro)
    .filter((s) => !s.equipe?.id || filtro)
    .sort((a, b) => ordem(a) - ordem(b) || (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 5);
  const times = filtro ? [] : equipes();
  itensSessao = [...times.map((g) => ({ equipe: g })), ...lista.map((s) => ({ s }))];
  const conta = filtro && S.contas.find((c) => c.id === filtro);
  tituloSessoes.textContent = conta ? `Sessões de ${conta.nome}` : 'Sessões abertas';
  const nova = JSON.stringify(itensSessao.map((x) => (x.s ? [x.s.id, x.s.name, x.s.cwd, estadoDoPato(x.s), oQueFaz(x.s)] : x.equipe.map((s) => [s.id, estadoDoPato(s), oQueFaz(s)]))));
  if (nova === marcaSessoes) return;
  marcaSessoes = nova;
  const ativo = document.activeElement?.closest?.('.r-sessoes li')?.dataset.k;
  sessoes.replaceChildren(
    ...itensSessao.map((x, i) => {
      if (x.equipe) {
        const g = x.equipe;
        const pede = g.some(precisa);
        return el(
          'li',
          { role: 'option', tabIndex: -1, 'data-k': `eq:${g[0].equipe.id}`, class: `r-equipe${pede ? ' pede' : ''}`, onclick: () => app.rapidoAbrirTodas?.(g.map((s) => s.id)), onkeydown: (ev) => teclaNaLista(ev, i) },
          el('span', { class: 'r-trio grande' }, ...g.slice(0, 4).map((s) => miniPato(estadoDoPato(s), contaDe(s)))),
          el('span', { class: 't' }, el('b', { text: `Equipe de ${g.length} contas` }), el('span', { text: `${nomeDaSessao(g[0])}: ${g.map((s) => `${contaDe(s).nome} ${oQueFaz(s).toLowerCase()}`).join(', ')}` })),
          el('span', { class: 'r-acao', text: 'Abrir lado a lado' }),
        );
      }
      const s = x.s;
      const c = contaDe(s);
      return el(
        'li',
        { role: 'option', tabIndex: -1, 'data-k': s.id, class: precisa(s) ? 'pede' : '', onclick: () => app.rapidoAbrir?.(s.id), onkeydown: (ev) => teclaNaLista(ev, i) },
        miniPato(estadoDoPato(s), c),
        el('span', { class: 't' }, el('b', { text: nomeDaSessao(s) }), el('span', null, filtro ? null : `${c.nome}: `, el('span', { class: 'r-faz', text: oQueFaz(s) }))),
        el('span', { class: 'r-acao', text: 'Abrir' }),
      );
    }),
  );
  if (ativo) sessoes.querySelector(`[data-k="${CSS.escape(ativo)}"]`)?.focus();
  blocoSessoes.hidden = !itensSessao.length;
}
function teclaNaLista(ev, i) {
  const itens = [...sessoes.children];
  if (ev.key === 'ArrowDown') itens[Math.min(i + 1, itens.length - 1)]?.focus();
  else if (ev.key === 'ArrowUp') (i === 0 ? texto : itens[i - 1]).focus();
  else if (ev.key === 'Enter' || ev.key === ' ') itens[i].click();
  else return;
  ev.preventDefault();
}

function desenhar() {
  if (!S.pronto || !ligado) {
    estadoGeral.hidden = false;
    estadoGeral.replaceChildren(icone(ligado ? 'arrows-clockwise' : 'warning-circle', 18), el('span', { text: ligado ? 'Carregando as contas…' : 'Sem conexão com o duckV. Tentando de novo…' }));
    abrir.disabled = true;
    medir();
    return;
  }
  validarEscolha();
  const todas = escolha.conta === 'todas';
  const n = disponiveis().length;
  const semTerminal = !S.host.available;
  estadoGeral.hidden = !semTerminal && n > 0;
  const motivo = semTerminal
    ? 'Este computador não conseguiu carregar o terminal virtual. Rode a instalação do duckV de novo.'
    : S.contas.length
      ? 'O agente das contas não está instalado neste computador. Rode a instalação do duckV de novo ou instale o Claude Code.'
      : 'Nenhuma conta no duckV ainda. Adicione uma nas Opções.';
  estadoGeral.replaceChildren(icone('warning-circle', 18), el('span', { text: motivo }));
  rotuloTexto.textContent = todas ? 'O que as contas devem fazer juntas?' : 'O que a sessão deve fazer?';
  texto.placeholder = todas ? 'Obrigatório. Ex.: implemente a tela de pagamento e escreva os testes' : 'Opcional. Ex.: rode os testes e corrija o que estiver falhando';
  abrir.replaceChildren(todas ? `Abrir com ${n} contas` : 'Abrir sessão', el('kbd', { class: 'atalho r-enter', text: 'Enter' }));
  abrir.disabled = semTerminal || !n || enviando;
  // O pato ao lado do campo e o da conta que vai abrir (na automatica, a que ela escolheria agora).
  const c = contaReal();
  const marcaPato = todas ? `todas:${disponiveis().map((x) => x.id + x.pato).join()}` : `${c?.id}:${c?.pato}:${c?.cor}`;
  if (patoCampo.dataset.marca !== marcaPato) {
    patoCampo.dataset.marca = marcaPato;
    patoCampo.replaceChildren(todas ? el('span', { class: 'r-trio' }, ...disponiveis().slice(0, 4).map((x) => miniPato('trabalha', x))) : miniPato(c ? 'parado' : 'dorme', c));
    patoCampo.classList.toggle('varios', todas);
  }
  desenharContas();
  desenharPastas();
  desenharSessoes();
  medir();
}

// ------------------------------------------------------------ acoes
let enviando = false;
function enviar() {
  if (enviando || abrir.disabled) return;
  const todas = escolha.conta === 'todas';
  const c = contaReal();
  const t = texto.value.trim();
  if (!todas && !c) return mostrarErro('Escolha uma conta.');
  if (!escolha.pasta) return mostrarErro('Escolha a pasta do projeto em Mais opções.');
  if (todas && t.length < 3) {
    mostrarErro('Escreva o que as contas devem fazer juntas.');
    return texto.focus();
  }
  enviando = true;
  abrir.disabled = true;
  abrir.firstChild.textContent = todas ? 'Abrindo as contas…' : 'Abrindo…';
  mostrarErro('');
  const pronto = (falha, r) => {
    enviando = false;
    desenhar();
    if (falha) return mostrarErro(falha);
    texto.value = '';
    ajustarAltura();
    if (todas) app.rapidoAbrirTodas?.(r.instances || []);
    else app.rapidoAbrir?.(r.instance);
  };
  if (todas) return mandar({ t: 'equipe', cwd: escolha.pasta, texto: t }, pronto);
  const ag = agenteDe(c);
  const p = c.padroes || {};
  mandar({ t: 'start', account: c.id, cwd: escolha.pasta, texto: t || undefined, model: p.model || ag.modelos[0]?.id || 'default', effort: p.effort || null, mode: p.mode || ag.modos[0]?.id, cols: 110, rows: 34 }, pronto);
}
form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  enviar();
});
function ajustarAltura() {
  texto.style.height = 'auto';
  texto.style.height = `${Math.min(texto.scrollHeight, 140)}px`;
  medir();
}
texto.addEventListener('input', () => (mostrarErro(''), ajustarAltura()));
texto.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    enviar();
  } else if (ev.key === 'ArrowDown' && texto.selectionStart === texto.value.length && sessoes.firstChild && !blocoSessoes.hidden) {
    ev.preventDefault();
    sessoes.firstChild.focus();
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    ev.preventDefault();
    app.rapidoFechar?.();
  } else if ((ev.ctrlKey || ev.metaKey) && /^[1-9]$/.test(ev.key)) {
    const b = contas.querySelectorAll('[role=radio]')[Number(ev.key) - 1];
    if (!b || b.disabled) return;
    ev.preventDefault();
    escolherConta(b.dataset.v);
  }
});

// A janela do app ajusta a altura ao conteudo.
let ultimaAltura = 0;
function medir() {
  requestAnimationFrame(() => {
    const h = Math.ceil(form.getBoundingClientRect().height) + 40;
    if (h === ultimaAltura) return;
    ultimaAltura = h;
    app.rapidoTamanho?.(h);
  });
}
// Cada vez que o popup aparece: campo limpo e em foco, com a ultima conta escolhida.
function aoMostrar() {
  mostrarErro('');
  form.classList.remove('entra');
  if (!semMovimento.matches) requestAnimationFrame(() => form.classList.add('entra'));
  desenhar();
  texto.focus();
  texto.select();
}
app.aoMostrarRapido?.(aoMostrar);
ligar();
desenhar();
texto.focus();
