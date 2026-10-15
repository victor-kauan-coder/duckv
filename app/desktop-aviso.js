'use strict';
// Aviso do duckV no canto da tela: o pedido mais antigo de todas as contas, com Aceitar e Recusar ali
// mesmo, sem abrir a janela. O app do computador mostra este aviso quando a janela nao esta em foco.
/* global icone */

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role' || k === 'title') node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}
try {
  document.documentElement.dataset.tema = JSON.parse(localStorage.getItem('duckv-notebook') || '{}').tema || 'sistema';
} catch {
  /* padrao do sistema */
}

const app = window.duckvApp || {};
const raiz = document.getElementById('aviso-pedido');
let S = { contas: [], sessoes: [] };
let ws = null;
let ref = 0;
const pendentes = new Map();
let mostrado = '';

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
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.t === 'state') {
      S = { contas: m.accounts, sessoes: m.instances };
      desenhar();
    } else if (m.t === 'ack' || m.t === 'err') {
      const f = pendentes.get(m.ref);
      pendentes.delete(m.ref);
      f?.(m.t === 'err' ? m.msg : null, m);
    }
  };
  ws.onclose = () => {
    ws = null;
    setTimeout(ligar, 1500);
  };
}

const contaDe = (s) => S.contas.find((c) => c.id === s.account) || { nome: s.account, cor: '#ff7a1a' };
const nomeDaSessao = (s) => s.name || String(s.cwd || '').split(/[\\/]/).filter(Boolean).pop() || 'Sessão';

// O pedido mais antigo: permissao (Aceitar/Recusar) ou pergunta de uma sessao aberta pelo duckV (opcoes).
function primeiro() {
  const itens = [];
  for (const s of S.sessoes) {
    if (s.status === 'ended') continue;
    for (const p of s.perms) itens.push({ tipo: 'perm', s, p, at: p.at, id: p.id });
    if (s.hosted && s.pergunta && !s.perms.length) itens.push({ tipo: 'pergunta', s, at: s.updatedAt, id: `q:${s.id}:${s.pergunta.titulo}:${s.pergunta.opcoes.length}` });
  }
  itens.sort((a, b) => a.at - b.at);
  return { item: itens[0] || null, total: itens.length };
}

function medir() {
  requestAnimationFrame(() => app.avisoTamanho?.(Math.ceil(raiz.getBoundingClientRect().height) + 2));
}

function desenhar() {
  const { item, total } = primeiro();
  if (!item) {
    mostrado = '';
    raiz.replaceChildren();
    app.avisoVazio?.();
    return;
  }
  const chave = `${item.id}|${total}`;
  if (chave === mostrado) return;
  mostrado = chave;
  const { s } = item;
  const conta = contaDe(s);
  const fechar = el('button', { class: 'so-icone', type: 'button', 'aria-label': 'Esconder este aviso', title: 'Esconder', onclick: () => app.avisoEsconder?.() }, icone('x', 16));
  const de = el('p', { class: 'de' }, el('i'), `${conta.nome} · ${nomeDaSessao(s)}`, total > 1 ? el('span', { class: 'mais', text: `+${total - 1}` }) : null, el('span', { class: 'espaco' }), fechar);
  const abrir = el('button', { class: 'botao texto pequeno', type: 'button', text: 'Abrir', onclick: () => app.avisoAbrir?.(s.id) });
  let corpo;
  if (item.tipo === 'perm') {
    const p = item.p;
    const aceitar = el('button', { class: 'botao principal', type: 'button' }, icone('check', 18), 'Aceitar');
    const recusar = el('button', { class: 'botao', type: 'button' }, icone('x', 18), 'Recusar');
    const responder = (behavior) => {
      aceitar.disabled = recusar.disabled = true;
      mandar({ t: 'verdict', instance: s.id, request_id: p.id, behavior }, (erro) => {
        if (erro) {
          aceitar.disabled = recusar.disabled = false;
          const a = document.getElementById('aviso');
          a.textContent = erro;
          a.classList.add('mostra');
          setTimeout(() => a.classList.remove('mostra'), 3000);
        }
      });
    };
    aceitar.addEventListener('click', () => responder('allow'));
    recusar.addEventListener('click', () => responder('deny'));
    corpo = [
      el('h3', null, icone('shield-check', 18), `Pode usar ${p.tool}?`),
      p.desc ? el('p', { class: 'oque', text: p.desc }) : null,
      p.preview ? el('pre', { text: p.preview }) : null,
      el('div', { class: 'botoes' }, aceitar, recusar, el('span', { class: 'espaco' }), abrir),
    ];
  } else {
    const q = s.pergunta;
    // Opcoes que valem para sempre ("nao perguntar de novo") ou pedem texto ficam para a janela.
    const simples = q.opcoes.filter((o) => !o.confirmar && !o.livre).slice(0, 4);
    corpo = [
      el('h3', null, icone('chat-text', 18), q.titulo || 'O agente fez uma pergunta'),
      q.contexto ? el('pre', { text: q.contexto.split('\n').slice(-8).join('\n') }) : null,
      el(
        'div',
        { class: 'respostas' },
        simples.map((o) => el('button', { class: 'botao', type: 'button', onclick: () => mandar({ t: 'key', instance: s.id, key: o.tecla }) }, el('span', { class: 'numero', text: o.tecla }), el('span', { text: o.rotulo }))),
      ),
      el('div', { class: 'botoes' }, el('span', { class: 'espaco' }), abrir),
    ];
  }
  const cartao = el('section', { class: 'pedido aviso-cartao', 'aria-label': 'Pedido do duckV' }, de, ...corpo);
  cartao.style.setProperty('--cor', conta.cor);
  raiz.replaceChildren(cartao);
  medir();
}

ligar();
