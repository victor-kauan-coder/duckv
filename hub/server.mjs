#!/usr/bin/env node
// Servidor do painel: roda no computador, recebe os relatorios de cada sessao
// do Claude Code e conversa com o app aberto no celular.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { WebSocketServer } from 'ws';
import webpush from 'web-push';
import qrcode from 'qrcode-terminal';
import { ROOT, DATA, CONFIG_FILE, ACCOUNTS_FILE, ensureConfig, loadAccounts, defaultAccounts, readJson, writeJson, DEFAULT_COLORS } from '../lib/config.mjs';
import { Tail, parseEntry, TaskTracker, scanWindowTokens } from './transcript.mjs';
import { hostedAvailable, hostedError, startHosted, loginConta, folderAllowed, listFolders, readPrompt, readFooter, MODELS, EFFORTS, MODES } from './hosted.mjs';

const argv = new Set(process.argv.slice(2));
const cfg = ensureConfig(() => webpush.generateVAPIDKeys());
const PORT = Number(process.env.PAINEL_PORT) || cfg.port;
const HOST = argv.has('--lan') ? '0.0.0.0' : '127.0.0.1';
const APP = path.join(ROOT, 'app');
const STATE_FILE = path.join(DATA, 'state.json');
const PUSH_FILE = path.join(DATA, 'push.json');
const APARELHOS_FILE = path.join(DATA, 'aparelhos.json');

// Celulares pareados. Cada um recebe a propria chave, e no disco fica so o hash dela:
// uma sessao do Claude que leia a pasta data/ nao consegue se passar por um celular.
const hashDe = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
let aparelhos = readJson(APARELHOS_FILE, []) || [];
if (cfg.token) {
  // Versoes antigas guardavam uma chave unica em config.json: vira um aparelho e sai de la.
  aparelhos.push({ id: 'antigo', nome: 'Pareado antes da versão 1.2', hash: hashDe(cfg.token), criado: Date.now() });
  delete cfg.token;
  writeJson(APARELHOS_FILE, aparelhos);
  writeJson(CONFIG_FILE, cfg);
}
if (argv.has('--novo-token')) {
  aparelhos = [];
  writeJson(APARELHOS_FILE, aparelhos);
  writeJson(PUSH_FILE, []);
  console.log('Todos os celulares foram despareados. Escaneie o codigo novo em cada um.');
}
// O codigo do QR vive so na memoria, muda a cada vez que o claudeV liga e depois de cada pareamento.
// PAINEL_CODIGO existe para os testes: com ele o codigo e fixo e o pareamento dispensa a confirmacao.
const TESTE_PAREAMENTO = !!process.env.PAINEL_CODIGO;
let CODIGO = process.env.PAINEL_CODIGO || crypto.randomBytes(24).toString('base64url');
delete process.env.PAINEL_CODIGO;
if (HOST === '0.0.0.0') {
  console.warn('\nATENCAO: --lan abre o claudeV sem criptografia na rede local. Quem estiver na mesma rede pode copiar o codigo de pareamento e comandar o computador. Prefira o Tailscale.\n');
}
const PREFS_FILE = path.join(DATA, 'prefs.json');
const FIVE_H = 5 * 3600 * 1000;
const WINDOWS = ['five_hour', 'seven_day'];

webpush.setVapidDetails('mailto:claudev@localhost', cfg.vapid.publicKey, cfg.vapid.privateKey);

const now = () => Date.now();
const clip = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const safeEq = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// ---------------------------------------------------------------- estado

const saved = readJson(STATE_FILE, {}) || {};
const accounts = new Map();
for (const a of loadAccounts()) {
  accounts.set(a.id, {
    ...a,
    usage: saved.usage?.[a.id] || {},
    lastReset: saved.lastReset?.[a.id] || null,
    tokens: null,
    tokCache: new Map(),
  });
}
// Opcoes escolhidas no app: valem para todos os celulares pareados.
const RAPIDAS_PADRAO = ['Pode continuar.', 'Rode os testes e me diga o resultado.', 'Resuma o que você fez até agora.', 'Faça o commit do que está pronto.', 'Explique essa última mudança.'];
const prefs = { contas: {}, avisos: { perm: true, fim: true, reset: true, limiar: 80 }, rapidas: RAPIDAS_PADRAO, ...(readJson(PREFS_FILE, {}) || {}) };
prefs.avisos = { perm: true, fim: true, reset: true, limiar: 80, ...(prefs.avisos || {}) };
if (!prefs.contas || typeof prefs.contas !== 'object') prefs.contas = {};
if (!Array.isArray(prefs.rapidas)) prefs.rapidas = RAPIDAS_PADRAO;
const savePrefs = () => writeJson(PREFS_FILE, prefs);
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function setPrefs(m) {
  if (m.op === 'conta') {
    const acc = accounts.get(m.id);
    if (!acc) return 'Conta não encontrada.';
    const atual = prefs.contas[acc.id] || {};
    if (m.nome != null) {
      const n = texto(m.nome, 30);
      if (!n) return 'O nome não pode ficar vazio.';
      atual.nome = n;
    }
    if (m.cor != null) {
      if (!/^#[0-9a-f]{6}$/i.test(m.cor)) return 'Cor inválida.';
      atual.cor = m.cor.toLowerCase();
    }
    // Tipo de patinho da conta (o app desenha cada um e escolhe a cor junto).
    if (m.pato != null) {
      if (!/^[a-z]{2,20}$/.test(m.pato)) return 'Tipo de patinho inválido.';
      atual.pato = m.pato;
    }
    if (m.padroes && typeof m.padroes === 'object') {
      const p = m.padroes;
      const novo = { ...(atual.padroes || {}) };
      if (p.model != null) {
        if (!MODELS.includes(p.model)) return 'Modelo inválido.';
        novo.model = p.model;
      }
      if (p.effort !== undefined) {
        if (p.effort && !EFFORTS.includes(p.effort)) return 'Nível de esforço inválido.';
        novo.effort = p.effort || null;
      }
      if (p.mode != null) {
        if (!MODES.includes(p.mode)) return 'Modo de permissão inválido.';
        novo.mode = p.mode;
      }
      if (p.cwd !== undefined) novo.cwd = texto(p.cwd, 400);
      atual.padroes = novo;
    }
    prefs.contas[acc.id] = atual;
  } else if (m.op === 'avisos') {
    for (const k of ['perm', 'fim', 'reset']) if (typeof m[k] === 'boolean') prefs.avisos[k] = m[k];
    if (m.limiar != null) {
      if (![50, 80, 95].includes(Number(m.limiar))) return 'Limite de aviso inválido.';
      prefs.avisos.limiar = Number(m.limiar);
    }
  } else if (m.op === 'rapidas') {
    if (!Array.isArray(m.lista)) return 'Lista inválida.';
    prefs.rapidas = m.lista.map((x) => texto(x, 200)).filter(Boolean).slice(0, 12);
  } else return 'Opção desconhecida.';
  savePrefs();
  dirty();
  return null;
}

// Contas novas pelo app: entram no contas.json e a instalacao (setup.mjs) roda de
// novo para criar a pasta, ligar o canal e gerar o atalho. O login e feito depois,
// numa sessao aberta pelo celular, com /login.
function listaContas() {
  const l = readJson(ACCOUNTS_FILE, null);
  return Array.isArray(l) && l.length ? l : defaultAccounts().map(({ id, nome, cor, dir }) => ({ id, nome, cor, dir }));
}
let setupRodando = null;
function rodarSetup() {
  if (process.env.PAINEL_DEMO === '1') return;
  if (setupRodando) return void (setupRodando.denovo = true);
  setupRodando = { denovo: false };
  execFile(process.execPath, [path.join(ROOT, 'setup.mjs')], { cwd: ROOT, windowsHide: true, timeout: 5 * 60000 }, (err) => {
    if (err) console.error('A instalacao da conta nova falhou:', err.message);
    const denovo = setupRodando.denovo;
    setupRodando = null;
    if (denovo) rodarSetup();
  });
}
function novaConta(nomePedido) {
  const lista = listaContas();
  const ids = new Set(lista.map((a) => a.id));
  const modelo = lista.find((a) => a.dir);
  const base = modelo ? path.dirname(modelo.dir) : path.join(os.homedir(), '.claude-contas');
  // Pula pastas que ja existem: uma conta removida deixa o login la, e a conta nova nao pode herdar.
  let n = lista.length + 1;
  while (ids.has(`conta${n}`) || fs.existsSync(path.join(base, `conta${n}`))) n++;
  const id = `conta${n}`;
  const nome = texto(nomePedido, 30).replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || `Conta ${n}`;
  const dir = path.join(base, id);
  const usadas = new Set([...accounts.values()].map((a) => (prefs.contas[a.id]?.cor || a.cor).toLowerCase()));
  const cor = [...DEFAULT_COLORS, '#3d8bfd', '#2fb37a', '#9b6bff', '#e0569a', '#f26b4e', '#8a3b12'].find((c) => !usadas.has(c)) || DEFAULT_COLORS[0];
  fs.mkdirSync(dir, { recursive: true });
  writeJson(ACCOUNTS_FILE, [...lista, { id, nome, cor, dir }]);
  accounts.set(id, { id, nome, cor, dir, padrao: false, usage: {}, lastReset: null, tokens: null, tokCache: new Map() });
  rodarSetup();
  dirty();
  return id;
}
function removerConta(id) {
  if (!accounts.has(id)) return 'Conta não encontrada.';
  if (accounts.size <= 1) return 'O claudeV precisa de pelo menos uma conta.';
  if ([...instances.values()].some((i) => i.account === id && i.status !== 'ended')) return 'Encerre as sessões desta conta antes de removê-la.';
  writeJson(ACCOUNTS_FILE, listaContas().filter((a) => a.id !== id));
  accounts.delete(id);
  delete prefs.contas[id];
  savePrefs();
  for (const ext of ['cmd', 'sh']) fs.rmSync(path.join(ROOT, `${id}.${ext}`), { force: true });
  dirty();
  return null;
}

const remembered = saved.inst || {};
// Pastas onde ja houve sessao: viram sugestoes ao abrir uma sessao pelo celular.
let folders = Array.isArray(saved.folders) ? saved.folders.filter((f) => typeof f === 'string').slice(0, 20) : [];
function rememberFolder(dir) {
  if (!dir || folders[0] === dir) return;
  folders = [dir, ...folders.filter((f) => f !== dir)].slice(0, 20);
  persistSoon();
}
let testCommand = null;
try {
  testCommand = process.env.PAINEL_CLAUDE_CMD ? JSON.parse(process.env.PAINEL_CLAUDE_CMD) : cfg.claudeCmd || null;
} catch {
  testCommand = null;
}
const instances = new Map();
let pushSubs = (readJson(PUSH_FILE, []) || []).filter((s) => aparelhos.some((a) => a.id === (s.aparelho || 'antigo')));

function getAccount(id) {
  id = /^[a-z0-9_-]{1,24}$/i.test(id || '') ? id : 'conta1';
  let a = accounts.get(id);
  if (!a) {
    a = {
      id,
      nome: id,
      cor: DEFAULT_COLORS[accounts.size % DEFAULT_COLORS.length],
      dir: null,
      usage: {},
      lastReset: null,
      tokens: null,
      tokCache: new Map(),
    };
    accounts.set(id, a);
  }
  return a;
}

// Nome da conta como aparece no app (as opcoes podem ter trocado o nome).
const pubAccount = (id) => {
  const a = getAccount(id);
  return { ...a, nome: nomeDe(a) };
};

function getInst(id, accountId) {
  id = clip(String(id), 80);
  let i = instances.get(id);
  if (!i) {
    const r = remembered[id] || {};
    i = {
      id,
      account: getAccount(accountId || r.account).id,
      sessionId: r.sessionId || null,
      name: r.name || null,
      cwd: r.cwd || null,
      model: r.model || null,
      transcript: null,
      tail: null,
      status: 'idle',
      activity: '',
      startedAt: r.startedAt || now(),
      updatedAt: now(),
      endedAt: null,
      ctx: null,
      cost: null,
      lines: null,
      tokens: { in: 0, out: 0, cw: 0, cr: 0 },
      usageById: new Map(),
      tracker: new TaskTracker(),
      messages: [],
      msgIds: new Set(),
      lastText: '',
      perms: [],
      localAsk: null,
      recentPre: [],
      hosted: null,
      pergunta: null,
      rodape: '',
      effort: null,
      permMode: null,
      agent: null,
      goneAt: null,
    };
    instances.set(id, i);
    if (r.transcript) setTranscript(i, r.transcript);
  } else if (accountId && i.account !== accountId) {
    i.account = getAccount(accountId).id;
  }
  return i;
}

function setTranscript(inst, file) {
  if (!file || inst.transcript === file) return;
  inst.transcript = file;
  inst.tail = new Tail(file);
  inst.usageById = new Map();
  inst.tokens = { in: 0, out: 0, cw: 0, cr: 0 };
  inst.tracker = new TaskTracker();
  inst.messages = [];
  inst.msgIds = new Set();
  for (const c of phones) if (c.open === inst.id) send(c, { t: 'history', instance: inst.id, items: [] });
}

function pubInst(i) {
  const tasks = i.tracker.list;
  return {
    id: i.id,
    account: i.account,
    name: i.name,
    cwd: i.cwd,
    model: i.model,
    status: i.status,
    activity: i.activity,
    startedAt: i.startedAt,
    updatedAt: i.updatedAt,
    ctx: i.ctx,
    cost: i.cost,
    lines: i.lines,
    tokens: i.tokens,
    last: i.last || null,
    turns: i.turns || 0,
    tasks,
    perms: i.perms.map((p) => ({ id: p.id, tool: p.tool, desc: p.desc, preview: p.preview, at: p.at, toolUseId: p.toolUseId })),
    localAsk: i.localAsk,
    hosted: !!i.hosted,
    pergunta: i.hosted ? i.pergunta : null,
    rodape: i.hosted ? i.rodape : '',
    effort: i.effort,
    permMode: i.permMode,
    canSend: (!!i.agent || !!i.hosted) && i.status !== 'ended',
    desktop: !!(i.desktop || i.historico),
    sessionId: i.desktop || i.historico ? i.sessionId : undefined,
    lastText: i.lastText,
  };
}

function snapshot() {
  return {
    t: 'state',
    now: now(),
    demo: process.env.PAINEL_DEMO === '1',
    prefs: { avisos: prefs.avisos, rapidas: prefs.rapidas },
    accounts: [...accounts.values()].map((a) => ({
      id: a.id,
      nome: nomeDe(a),
      email: a.email || null,
      plano: a.plano || null,
      cor: prefs.contas[a.id]?.cor || a.cor,
      pato: prefs.contas[a.id]?.pato || 'classico',
      padroes: prefs.contas[a.id]?.padroes || {},
      usage: a.usage,
      tokens: a.tokens,
      lastReset: a.lastReset,
    })),
    instances: [...instances.values()].map(pubInst),
    host: {
      available: hostedAvailable(),
      error: hostedAvailable() ? null : hostedError(),
      models: MODELS,
      efforts: EFFORTS,
      modes: MODES,
      folders,
      home: os.homedir(),
      sep: path.sep,
    },
  };
}

let saveTimer = null;
function persistSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const usage = {};
    const lastReset = {};
    for (const a of accounts.values()) {
      usage[a.id] = a.usage;
      lastReset[a.id] = a.lastReset;
    }
    const inst = {};
    for (const i of instances.values()) {
      if (i.status === 'ended' || i.hosted) continue;
      inst[i.id] = {
        account: i.account,
        sessionId: i.sessionId,
        name: i.name,
        cwd: i.cwd,
        model: i.model,
        transcript: i.transcript,
        startedAt: i.startedAt,
      };
    }
    try {
      writeJson(STATE_FILE, { usage, lastReset, inst, folders });
    } catch (e) {
      console.error('Nao consegui salvar o estado:', e.message);
    }
  }, 1500);
}

// ---------------------------------------------------------------- celular

const phones = new Set();
const send = (c, obj) => {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
};

let dirtyTimer = null;
function dirty() {
  if (dirtyTimer) return;
  dirtyTimer = setTimeout(() => {
    dirtyTimer = null;
    const snap = snapshot();
    for (const c of phones) send(c, snap);
  }, 80);
}

const anyVisiblePhone = () => [...phones].some((c) => c.visible);

function pushMsgs(inst, items) {
  const fresh = [];
  for (const it of items) {
    if (inst.msgIds.has(it.id)) continue;
    inst.msgIds.add(it.id);
    inst.messages.push(it);
    fresh.push(it);
    if (it.role === 'assistant') inst.lastText = clip(semMarkdown(it.text), 200);
  }
  if (!fresh.length) return;
  if (inst.messages.length > 5000) {
    const drop = inst.messages.splice(0, inst.messages.length - 5000);
    for (const d of drop) inst.msgIds.delete(d.id);
  }
  for (const c of phones) if (c.open === inst.id) send(c, { t: 'msgs', instance: inst.id, items: fresh });
}

const SEM_CANAL =
  'A mensagem não chegou: o Claude Code desta conta recusou mensagens do celular (organizações Team/Enterprise costumam desligar os canais). Crie uma sessão pelo celular com esta conta — essas funcionam em qualquer plano.';

function sysMsg(inst, text) {
  pushMsgs(inst, [{ id: `sys:${now()}:${Math.random().toString(36).slice(2, 7)}`, role: 'sys', text, ts: now() }]);
}

async function pushNotify(payload) {
  if (!pushSubs.length) return;
  const body = JSON.stringify(payload);
  const keep = [];
  await Promise.all(
    pushSubs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body, { TTL: 600, urgency: 'high' });
        keep.push(sub);
      } catch (e) {
        if (e.statusCode !== 404 && e.statusCode !== 410) keep.push(sub);
      }
    }),
  );
  if (keep.length !== pushSubs.length) {
    pushSubs = keep;
    writeJson(PUSH_FILE, pushSubs);
  }
}

function applyVerdict(instId, requestId, behavior, recado) {
  const nota = behavior === 'deny' ? texto(recado, 1000) : '';
  const inst = instances.get(instId);
  if (!inst) return 'Sessão não encontrada.';
  if (behavior !== 'allow' && behavior !== 'deny') return 'Resposta inválida.';
  const idx = inst.perms.findIndex((p) => p.id === requestId);
  if (idx < 0) return 'Esse pedido já foi respondido.';
  const waiting = inst.perms[idx];
  if (!waiting.resolve && (!inst.agent || inst.agent.readyState !== 1)) return 'A sessão não está conectada ao claudeV.';
  const [perm] = inst.perms.splice(idx, 1);
  if (perm.resolve) perm.resolve(behavior, nota);
  else {
    inst.agent.send(JSON.stringify({ t: 'verdict', request_id: requestId, behavior }));
    // Na sessao aberta no computador o recado segue como mensagem, logo depois da recusa.
    if (nota) inst.agent.send(JSON.stringify({ t: 'msg', text: `Recusei o pedido de ${perm.tool}. ${nota}` }));
  }
  if (nota) pushMsgs(inst, [{ id: `tel:${now()}:${Math.random().toString(36).slice(2, 7)}`, role: 'user', via: 'celular', text: nota, ts: now() }]);
  sysMsg(inst, `${behavior === 'allow' ? 'Você aceitou' : 'Você recusou'}: ${perm.tool}${perm.desc ? `, ${perm.desc}` : ''}`);
  if (!inst.perms.length) {
    inst.localAsk = null;
    inst.status = 'working';
    inst.activity = behavior === 'allow' ? `${perm.tool}: ${perm.desc || ''}`.trim() : 'Pensando';
  }
  inst.updatedAt = now();
  dirty();
  return null;
}

const logins = new Map(); // conta -> login em andamento pelo celular

async function onPhoneMessage(c, m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'open': {
      const inst = instances.get(m.instance);
      c.open = inst ? inst.id : null;
      if (inst) send(c, { t: 'history', instance: inst.id, items: inst.messages });
      break;
    }
    case 'close':
      c.open = null;
      break;
    case 'vis':
      c.visible = !!m.visible;
      break;
    case 'send': {
      const inst = instances.get(m.instance);
      const text = typeof m.text === 'string' ? m.text.trim() : '';
      let err = null;
      if (!inst) err = 'Sessão não encontrada.';
      else if (!text) err = 'Mensagem vazia.';
      else if (text.length > 8000) err = 'Mensagem longa demais (máximo de 8000 caracteres).';
      else if (!inst.hosted && (!inst.agent || inst.agent.readyState !== 1)) err = 'Essa sessão não está conectada ao claudeV.';
      else if (!inst.hosted && inst.semCanal) err = SEM_CANAL;
      else if (inst.hosted) err = textoPerigoso(text);
      if (err) {
        send(c, { t: 'err', ref: m.ref, msg: err });
        break;
      }
      if (inst.hosted) {
        // Digitado no terminal da sessao; a mensagem aparece na conversa quando o Claude Code a registra.
        inst.hosted.send(text);
      } else {
        inst.agent.send(JSON.stringify({ t: 'msg', text }));
        pushMsgs(inst, [{ id: `tel:${now()}:${Math.random().toString(36).slice(2, 7)}`, role: 'user', via: 'celular', text, ts: now() }]);
        // Organizacoes (Team/Enterprise) podem desligar canais: o Claude Code descarta a mensagem calado.
        // Se ela nao aparecer no historico, avisa em vez de ficar "recebendo" para sempre.
        if (!inst.canalOk && inst.tail && inst.status === 'idle') {
          clearTimeout(inst.canalTimer);
          inst.canalTimer = setTimeout(() => {
            if (inst.canalOk) return;
            inst.semCanal = true;
            if (inst.status === 'working' && inst.activity === 'Recebendo sua mensagem') inst.status = 'idle';
            inst.activity = '';
            sysMsg(inst, SEM_CANAL);
            dirty();
          }, 30_000);
        }
      }
      if (inst.status === 'idle' && !text.startsWith('/')) {
        inst.status = 'working';
        inst.activity = 'Recebendo sua mensagem';
      }
      inst.updatedAt = now();
      send(c, { t: 'ack', ref: m.ref });
      dirty();
      break;
    }
    case 'verdict': {
      const err = applyVerdict(m.instance, m.request_id, m.behavior, m.note);
      if (err) send(c, { t: 'err', ref: m.ref, msg: err });
      else send(c, { t: 'ack', ref: m.ref });
      break;
    }
    case 'key': {
      const inst = instances.get(m.instance);
      if (!inst?.hosted) send(c, { t: 'err', ref: m.ref, msg: 'Teclas só funcionam em sessões abertas pelo celular.' });
      else if (!inst.hosted.key(String(m.key || ''))) send(c, { t: 'err', ref: m.ref, msg: 'Tecla desconhecida.' });
      else send(c, { t: 'ack', ref: m.ref });
      break;
    }
    case 'responder': {
      // Resposta escrita para uma pergunta do Claude (a opcao "Type something.").
      const inst = instances.get(m.instance);
      if (!inst?.hosted) send(c, { t: 'err', ref: m.ref, msg: 'Só dá para responder por aqui nas sessões abertas pelo celular.' });
      else if (!inst.hosted.responder(String(m.tecla || ''), typeof m.texto === 'string' ? m.texto : '')) send(c, { t: 'err', ref: m.ref, msg: 'Escreva a resposta.' });
      else send(c, { t: 'ack', ref: m.ref });
      break;
    }
    case 'term': {
      const inst = instances.get(m.instance);
      c.term = m.on && inst?.hosted ? inst.id : null;
      if (c.term) {
        if (m.cols && m.rows) inst.hosted.resize(Number(m.cols), Number(m.rows));
        send(c, { t: 'screen', instance: inst.id, ...inst.hosted.snapshot() });
      }
      break;
    }
    case 'start': {
      const r = startSession(m);
      if (r.err) send(c, { t: 'err', ref: m.ref, msg: r.err });
      else send(c, { t: 'ack', ref: m.ref, instance: r.id });
      break;
    }
    case 'stop': {
      const inst = instances.get(m.instance);
      if (!inst?.hosted) send(c, { t: 'err', ref: m.ref, msg: 'Só dá para encerrar daqui as sessões abertas pelo celular.' });
      else {
        inst.hosted.kill();
        send(c, { t: 'ack', ref: m.ref });
      }
      break;
    }
    case 'ls': {
      const roots = [os.homedir(), ...(cfg.pastasPermitidas || [])];
      const dir = folderAllowed(String(m.path || os.homedir()), cfg.pastasPermitidas || [], folders);
      if (!dir) send(c, { t: 'err', ref: m.ref, msg: 'Pasta não encontrada ou fora das pastas permitidas.' });
      else {
        const up = path.dirname(dir);
        const parent = up !== dir && folderAllowed(up, cfg.pastasPermitidas || [], folders) ? up : null;
        send(c, { t: 'ack', ref: m.ref, path: dir, parent, dirs: listFolders(dir), roots });
      }
      break;
    }
    case 'prefs': {
      const err = setPrefs(m);
      send(c, err ? { t: 'err', ref: m.ref, msg: err } : { t: 'ack', ref: m.ref });
      break;
    }
    // Entrar numa conta pelo celular: o celular abre o link, voce entra na conta Claude
    // e cola aqui o codigo que a pagina mostra no fim.
    case 'login': {
      const acc = accounts.get(m.account);
      if (!acc?.dir || acc.padrao) {
        send(c, { t: 'err', ref: m.ref, msg: 'Essa conta entra pelo Claude Code de sempre, no computador.' });
        break;
      }
      logins.get(acc.id)?.fechar();
      let l;
      try {
        l = loginConta(acc.dir);
      } catch (e) {
        send(c, { t: 'err', ref: m.ref, msg: e.message });
        break;
      }
      logins.set(acc.id, l);
      setTimeout(() => logins.get(acc.id) === l && (l.fechar(), logins.delete(acc.id)), 15 * 60_000).unref();
      l.url.then(
        (url) => send(c, { t: 'ack', ref: m.ref, url }),
        (e) => {
          l.fechar();
          if (logins.get(acc.id) === l) logins.delete(acc.id);
          send(c, { t: 'err', ref: m.ref, msg: e.message });
        },
      );
      break;
    }
    case 'loginCodigo': {
      const acc = accounts.get(m.account);
      const l = acc && logins.get(acc.id);
      const cod = typeof m.codigo === 'string' ? m.codigo.trim() : '';
      if (!l) send(c, { t: 'err', ref: m.ref, msg: 'Comece de novo: toque em Entrar na conta.' });
      else if (!/^[A-Za-z0-9_#.\-]{8,400}$/.test(cod)) send(c, { t: 'err', ref: m.ref, msg: 'Esse não parece o código da página de entrada. Copie o código inteiro.' });
      else {
        const ok = await l.codigo(cod);
        l.fechar();
        logins.delete(acc.id);
        if (!ok) {
          send(c, { t: 'err', ref: m.ref, msg: 'O Claude Code não aceitou o código. Toque em Entrar na conta e tente de novo.' });
          break;
        }
        await consultarUso(acc).catch(() => false);
        dirty();
        send(c, { t: 'ack', ref: m.ref, email: acc.email });
      }
      break;
    }
    case 'historico': {
      const acc = accounts.get(m.account);
      if (!acc) send(c, { t: 'err', ref: m.ref, msg: 'Conta não encontrada.' });
      else send(c, { t: 'ack', ref: m.ref, itens: historicoDa(acc).map(({ file, ...x }) => x) });
      break;
    }
    case 'abrirHistorico': {
      const acc = accounts.get(m.account);
      const item = acc && historicoDa(acc).find((x) => x.sid === m.sid);
      if (!item) {
        send(c, { t: 'err', ref: m.ref, msg: 'Essa conversa não foi encontrada.' });
        break;
      }
      // Ja aberta (no celular, no computador ou como leitura)? Vai para ela.
      const viva = [...instances.values()].find((i) => i.sessionId === item.sid && i.status !== 'ended');
      if (viva) {
        send(c, { t: 'ack', ref: m.ref, instance: viva.id });
        break;
      }
      const inst = getInst(`hist-${item.sid.slice(0, 8)}`, acc.id);
      inst.historico = true;
      inst.sessionId = item.sid;
      inst.configDir = item.origem === 'conta' ? acc.dir : null;
      inst.cwd = item.cwd;
      inst.name = item.titulo;
      inst.startedAt = item.mtime;
      setTranscript(inst, item.file);
      dirty();
      send(c, { t: 'ack', ref: m.ref, instance: inst.id });
      break;
    }
    case 'conta': {
      if (m.op === 'nova') {
        try {
          send(c, { t: 'ack', ref: m.ref, id: novaConta(m.nome) });
        } catch (e) {
          send(c, { t: 'err', ref: m.ref, msg: `Não consegui criar a conta: ${e.message}` });
        }
      } else if (m.op === 'remover') {
        const err = removerConta(String(m.id || ''));
        send(c, err ? { t: 'err', ref: m.ref, msg: err } : { t: 'ack', ref: m.ref });
      }
      break;
    }
    case 'ping':
      send(c, { t: 'pong' });
      break;
    default:
  }
}

// ---------------------------------------------------------------- sessoes

const LETTERS = 'abcdefghijkmnopqrstuvwxyz';
const permId = () => Array.from(crypto.randomBytes(5), (b) => LETTERS[b % LETTERS.length]).join('');

function addPerm(inst, perm) {
  inst.perms.push(perm);
  linkPerms(inst);
  inst.status = 'waiting';
  inst.activity = `${perm.tool}${perm.desc ? `: ${perm.desc}` : ''}`;
  inst.updatedAt = now();
  dirty();
  if (prefs.avisos.perm && !anyVisiblePhone()) {
    const acc = pubAccount(inst.account);
    pushNotify({
      title: `${acc.nome} pede permissão`,
      body: clip(`${perm.tool}: ${perm.preview || perm.desc}`, 180),
      tag: `perm-${perm.id}`,
      url: `/#/s/${encodeURIComponent(inst.id)}`,
      perm: { instance: inst.id, request_id: perm.id },
    });
  }
}

// Sessao aberta pelo celular: o gancho de permissao do Claude Code espera aqui
// pela resposta. Sem resposta, devolve "sem decisao" e o pedido aparece no terminal.
function waitPermission(body, res) {
  return new Promise((resolve) => {
    const inst = instances.get(body?.instance);
    const ev = body?.event || {};
    if (!inst?.hosted) return resolve({ behavior: null });
    let done = false;
    const perm = {
      id: permId(),
      tool: clip(ev.tool_name || 'Ferramenta', 60),
      desc: clip(ev.tool_summary || '', 400),
      preview: clip(ev.tool_preview || '', 4000),
      at: now(),
    };
    const finish = (behavior, message) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const idx = inst.perms.indexOf(perm);
      if (idx >= 0) inst.perms.splice(idx, 1);
      if (!behavior && inst.status === 'waiting' && !inst.perms.length) {
        inst.localAsk = { tool: perm.tool, text: perm.desc, at: now() };
      }
      dirty();
      resolve({ behavior: behavior || null, message: message || '' });
    };
    perm.resolve = finish;
    const timer = setTimeout(() => finish(null), 28 * 60 * 1000);
    // Se o gancho desistir (sessao fechada), a conexao cai antes da resposta.
    res.on('close', () => {
      if (!res.writableEnded) finish(null);
    });
    addPerm(inst, perm);
  });
}

function startSession(m) {
  if (!hostedAvailable()) return { err: `Este computador não conseguiu carregar o terminal virtual (${hostedError()}).` };
  // Continuar pelo celular uma sessao do Claude desktop: mesma conversa, mesma pasta, login padrao.
  // Continuar pelo celular uma conversa do desktop ou do historico: mesma conversa, mesma pasta, mesmo login.
  const desk = m.resume ? [...instances.values()].find((i) => (i.desktop || i.historico) && i.sessionId === m.resume) : null;
  if (m.resume && (!desk || !/^[0-9a-f-]{36}$/.test(m.resume))) return { err: 'Essa conversa não foi encontrada.' };
  const acc = accounts.get(desk ? desk.account : m.account);
  if (!acc) return { err: 'Conta não encontrada.' };
  const cwd = folderAllowed(String(desk ? desk.cwd : m.cwd || ''), cfg.pastasPermitidas || [], desk ? [...folders, desk.cwd] : folders);
  if (!cwd) {
    return { err: 'Pasta não encontrada ou fora das pastas permitidas. Abra uma sessão nela pelo computador uma vez, ou inclua a pasta em "pastasPermitidas" no arquivo data/config.json.' };
  }
  const model = String(m.model || 'default');
  if (!MODELS.includes(model) && !/^claude-[a-z0-9.\-]{1,60}(\[1m\])?$/.test(model)) return { err: 'Modelo inválido.' };
  const effort = m.effort ? String(m.effort) : null;
  if (effort && !EFFORTS.includes(effort)) return { err: 'Nível de esforço inválido.' };
  const mode = m.mode ? String(m.mode) : null;
  if (mode && !MODES.includes(mode)) return { err: 'Modo de permissão inválido.' };
  const name = String(m.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 50) || null;
  if ([...instances.values()].filter((i) => i.hosted).length >= 8) return { err: 'Já existem 8 sessões abertas pelo celular. Encerre uma antes de abrir outra.' };

  const id = `${acc.id}-c${crypto.randomBytes(4).toString('hex')}`;
  const inst = getInst(id, acc.id);
  inst.cwd = cwd;
  inst.name = name;
  inst.permMode = mode === 'manual' ? 'default' : mode;
  inst.effort = effort;
  if (model !== 'default') inst.model = model;
  const env = { PAINEL_ACCOUNT: acc.id, PAINEL_ACCOUNT_NAME: pubAccount(acc.id).nome, PAINEL_INSTANCE: id, PAINEL_HOSTED: '1', PAINEL_PORT: String(PORT) };
  // A conversa mora na pasta da conta (historico da conta) ou na pasta padrao (Claude desktop).
  // Conversa do desktop de outra conta (nao a logada no Claude Code padrao): copia para a pasta da conta e
  // continua de la, com o login certo. A continuacao fica no historico da conta.
  if (desk && !desk.configDir && !acc.padrao && acc.dir && acc.email !== emailDesktop && desk.transcript) {
    try {
      const destino = path.join(acc.dir, 'projects', path.basename(path.dirname(desk.transcript)));
      fs.mkdirSync(destino, { recursive: true });
      fs.copyFileSync(desk.transcript, path.join(destino, path.basename(desk.transcript)));
      desk.configDir = acc.dir;
    } catch (e) {
      return { err: `Não consegui preparar a conversa para esta conta: ${e.message}` };
    }
  }
  const pastaConfig = desk ? desk.configDir : !acc.padrao ? acc.dir : null;
  if (pastaConfig) env.CLAUDE_CONFIG_DIR = pastaConfig;
  // Na pasta padrao nao ha ganchos do claudeV: vao pela linha de comando, sem mexer nas configuracoes de sempre.
  const ajustes = desk && !desk.configDir && acc.dir ? path.join(acc.dir, 'settings.json') : null;
  if (desk) {
    inst.sessionId = desk.sessionId;
    inst.name = inst.name || desk.name;
    instances.delete(desk.id);
  }
  try {
    inst.hosted = startHosted({
      cwd,
      env,
      resume: desk?.sessionId,
      settings: ajustes && fs.existsSync(ajustes) ? ajustes : null,
      model,
      effort,
      mode,
      name,
      cols: Number(m.cols) || 60,
      rows: Number(m.rows) || 32,
      command: testCommand,
      onScreen: (snap) => {
        for (const c of phones) if (c.term === id) send(c, { t: 'screen', instance: id, ...snap });
        const pergunta = readPrompt(snap.lines);
        const rodape = readFooter(snap.lines);
        if (JSON.stringify(pergunta) !== JSON.stringify(inst.pergunta) || rodape !== inst.rodape) {
          inst.pergunta = pergunta;
          inst.rodape = rodape;
          dirty();
        }
      },
      onExit: () => {
        inst.hosted = null;
        for (const p of [...inst.perms]) p.resolve?.(null);
        for (const c of phones) if (c.term === id) c.term = null;
        markEnded(inst);
        dirty();
      },
    });
  } catch (e) {
    instances.delete(id);
    return { err: `Não consegui abrir o Claude Code: ${e.message}` };
  }
  rememberFolder(cwd);
  dirty();
  return { id };
}

function clearPerm(inst, tool, toolUseId) {
  if (!tool && !toolUseId) {
    const open = inst.perms;
    inst.perms = [];
    inst.localAsk = null;
    for (const p of open) p.resolve?.(null); // libera ganchos que ainda esperam resposta
    return;
  }
  let idx = toolUseId ? inst.perms.findIndex((p) => p.toolUseId === toolUseId) : -1;
  if (idx < 0 && tool) idx = inst.perms.findIndex((p) => p.tool === tool && (!toolUseId || !p.toolUseId));
  if (idx >= 0) inst.perms.splice(idx, 1);
  if (inst.localAsk && (inst.localAsk.tool === tool || !inst.perms.length)) inst.localAsk = null;
}

// Liga cada pedido de permissao a chamada de ferramenta que o originou, para
// saber quando ele foi respondido direto no computador.
function linkPerms(inst) {
  for (const perm of inst.perms) {
    if (perm.toolUseId) continue;
    const used = new Set(inst.perms.map((p) => p.toolUseId).filter(Boolean));
    const pre = [...inst.recentPre]
      .reverse()
      .find((x) => x.tool === perm.tool && !used.has(x.id) && Math.abs(x.at - perm.at) < 60000);
    if (pre) perm.toolUseId = pre.id;
  }
}

function markEnded(inst) {
  if (inst.status === 'ended') return;
  inst.status = 'ended';
  inst.activity = '';
  inst.endedAt = now();
  clearPerm(inst);
  persistSoon();
}

function onHook(body) {
  const ev = body?.event;
  if (!ev || typeof ev !== 'object') return;
  // Cada passo da sessao grava no historico: soma de novo para o numero acompanhar.
  scheduleTokenScan();
  const id = body.instance || (ev.session_id ? `s:${ev.session_id}` : null);
  if (!id) return;
  const inst = getInst(id, body.account);
  const acc = getAccount(inst.account);
  inst.updatedAt = now();
  inst.endedAt = null;
  if (inst.status === 'ended') inst.status = 'idle';
  if (ev.session_id) inst.sessionId = ev.session_id;
  if (ev.cwd) {
    inst.cwd = ev.cwd;
    rememberFolder(ev.cwd);
  }
  if (ev.permission_mode) inst.permMode = ev.permission_mode;
  if (ev.transcript_path) setTranscript(inst, ev.transcript_path);
  const tool = ev.tool_name;
  const label = tool ? `${tool}${ev.tool_summary ? `: ${ev.tool_summary}` : ''}` : '';

  switch (ev.hook_event_name) {
    case 'SessionStart':
      if (ev.model) inst.model = inst.model || ev.model;
      if (ev.session_title) inst.name = ev.session_title;
      inst.status = 'idle';
      inst.activity = '';
      clearPerm(inst);
      break;
    case 'UserPromptSubmit':
      clearPerm(inst);
      inst.status = 'working';
      inst.activity = 'Pensando';
      break;
    case 'PreToolUse':
      if (ev.tool_use_id && tool) {
        inst.recentPre.push({ tool, id: ev.tool_use_id, at: now() });
        if (inst.recentPre.length > 30) inst.recentPre.shift();
        linkPerms(inst);
      }
      if (inst.status !== 'waiting') {
        inst.status = 'working';
        inst.activity = label;
      }
      break;
    case 'PermissionRequest':
      inst.status = 'waiting';
      inst.activity = label;
      inst.localAsk = { tool, text: ev.tool_summary || '', at: now() };
      break;
    case 'Notification':
      if (ev.notification_type === 'permission_prompt' && inst.status !== 'waiting') {
        inst.status = 'waiting';
        inst.activity = clip(ev.message || 'Pedindo permissão', 160);
        inst.localAsk = inst.localAsk || { tool: null, text: clip(ev.message || '', 200), at: now() };
      }
      break;
    case 'PermissionDenied':
    case 'PostToolUse':
    case 'PostToolUseFailure':
      clearPerm(inst, tool, ev.tool_use_id);
      if (!inst.perms.length && !inst.localAsk) {
        inst.status = 'working';
        inst.activity = 'Pensando';
      }
      break;
    case 'Stop': {
      clearPerm(inst);
      inst.status = 'idle';
      inst.activity = '';
      if (ev.last_assistant_message) inst.lastText = clip(semMarkdown(ev.last_assistant_message), 200);
      if (prefs.avisos.fim && !anyVisiblePhone()) {
        pushNotify({
          title: `${pubAccount(inst.account).nome} terminou`,
          body: clip(ev.last_assistant_message || 'A sessão está esperando você.', 160),
          tag: `fim-${inst.id}`,
          url: `/#/s/${encodeURIComponent(inst.id)}`,
        });
      }
      break;
    }
    case 'StopFailure':
      clearPerm(inst);
      inst.status = 'error';
      inst.activity = clip(ev.error_message || ev.error || 'A vez terminou com erro.', 200);
      break;
    case 'SessionEnd':
      markEnded(inst);
      break;
    default:
  }
  pollInst(inst);
  persistSoon();
  dirty();
}

function onStatus(body) {
  const d = body?.data;
  if (!d || typeof d !== 'object') return;
  const id = body.instance || (d.session_id ? `s:${d.session_id}` : null);
  if (!id) return;
  const inst = getInst(id, body.account);
  const acc = getAccount(inst.account);
  inst.updatedAt = now();
  if (inst.status === 'ended') {
    inst.status = 'idle';
    inst.endedAt = null;
  }
  if (d.session_id) inst.sessionId = d.session_id;
  if (d.cwd) inst.cwd = d.cwd;
  if (d.session_name) inst.name = clip(d.session_name, 80);
  if (d.model) inst.model = clip(d.model, 60);
  if (d.effort) inst.effort = clip(d.effort, 20);
  if (d.transcript_path) setTranscript(inst, d.transcript_path);
  if (d.ctx) inst.ctx = d.ctx;
  if (typeof d.cost === 'number') inst.cost = d.cost;
  if (d.lines) inst.lines = d.lines;

  const rl = d.rate_limits;
  if (rl && typeof rl === 'object') {
    for (const w of WINDOWS) {
      const x = rl[w];
      const resetMs = x?.resets_at ? Number(x.resets_at) * 1000 : null;
      if (resetMs && resetMs <= now()) continue; // janela ja encerrada: leitura velha
      if (x && typeof x.used_percentage === 'number') {
        acc.usage[w] = {
          pct: Math.max(0, Math.min(100, x.used_percentage)),
          resetsAt: resetMs,
        };
      }
    }
    acc.usage.at = now();
    scheduleTokenScan();
  }
  persistSoon();
  dirty();
}

function pollInst(inst) {
  if (!inst.tail) return;
  const entries = inst.tail.read();
  if (!entries.length) return;
  const items = [];
  let changed = false;
  for (const e of entries) {
    if (e.type === 'user' && JSON.stringify(e.message?.content ?? '').includes('<channel source=')) {
      inst.canalOk = true; // o Claude Code recebeu uma mensagem do celular
      clearTimeout(inst.canalTimer);
    }
    const p = parseEntry(e);
    if (p.usage) {
      inst.usageById.set(p.usage.id, p.usage);
      changed = true;
    }
    for (const t of p.tools) if (inst.tracker.onTool(t)) changed = true;
    for (const r of p.results) {
      if (inst.tracker.onResult(r)) changed = true;
      if (inst.perms.some((x) => x.toolUseId === r.id)) {
        clearPerm(inst, null, r.id);
        if (!inst.perms.length && inst.status === 'waiting') {
          inst.status = 'working';
          inst.activity = 'Pensando';
        }
        changed = true;
      }
    }
    // Imagens ficam na memoria do computador; a conversa leva so o endereco delas.
    items.push(...p.items.map((it) => (it.role === 'image' ? { id: it.id, role: 'image', via: it.via, ts: it.ts, img: guardarImagem(it) } : it)));
  }
  if (changed) {
    const t = { in: 0, out: 0, cw: 0, cr: 0 };
    let ultima = null;
    for (const u of inst.usageById.values()) {
      t.in += u.in;
      t.out += u.out;
      t.cw += u.cw;
      t.cr += u.cr;
      if (!ultima || u.ts >= ultima.ts) ultima = u;
    }
    inst.tokens = t;
    // A ultima resposta mostra do que o contexto e feito agora.
    inst.last = ultima && { in: ultima.in, out: ultima.out, cw: ultima.cw, cr: ultima.cr };
    inst.turns = inst.usageById.size;
  }
  if (items.length) pushMsgs(inst, items);
  if (changed || items.length) dirty();
}

setInterval(() => {
  for (const inst of instances.values()) if (inst.status !== 'ended' || now() - inst.endedAt < 5000) pollInst(inst);
}, 1000).unref();

// Reinicio dos limites, limpeza de sessoes encerradas e pedidos antigos.
function tick() {
  const t = now();
  let changed = false;
  for (const a of accounts.values()) {
    for (const w of WINDOWS) {
      const u = a.usage[w];
      if (u?.resetsAt && t >= u.resetsAt) {
        a.lastReset = { win: w, at: u.resetsAt, was: u.pct };
        if (prefs.avisos.reset && u.pct >= prefs.avisos.limiar) {
          pushNotify({
            title: `${pubAccount(a.id).nome}: limite reiniciado`,
            body: w === 'five_hour' ? 'O limite de 5 horas voltou a zero.' : 'O limite semanal voltou a zero.',
            tag: `reset-${a.id}-${w}`,
            url: '/',
          });
        }
        a.usage[w] = { pct: 0, resetsAt: null, fresh: true };
        if (w === 'five_hour') a.tokens = null;
        changed = true;
      }
    }
  }
  for (const inst of instances.values()) {
    if (inst.status !== 'ended' && !inst.agent && inst.goneAt && t - inst.goneAt > 15000) {
      markEnded(inst);
      changed = true;
    }
    if (inst.status === 'ended' && t - inst.endedAt > 10 * 60 * 1000) {
      instances.delete(inst.id);
      changed = true;
    }
    const before = inst.perms.length;
    inst.perms = inst.perms.filter((p) => t - p.at < 30 * 60 * 1000);
    if (inst.perms.length !== before) changed = true;
  }
  if (changed) {
    persistSoon();
    dirty();
  }
}
setInterval(tick, 5000).unref();

// Tokens gastos na janela de 5 horas, somados dos historicos de cada conta.
let scanTimer = null;
function scanTokens() {
  scanTimer = null;
  let changed = false;
  for (const a of accounts.values()) {
    if (!a.dir) continue;
    try {
      // Sem leitura do limite ainda, conta as ultimas 5 horas: o numero aparece desde o primeiro uso.
      const r = a.usage.five_hour?.resetsAt;
      const since = r && r > Date.now() ? r - FIVE_H : Date.now() - FIVE_H;
      const total = scanWindowTokens(a.dir, since, a.tokCache);
      // Conversas do Claude desktop (pasta padrao) entram na conta dona de cada uma.
      if (!a.padrao) {
        a.tokCacheDesk ||= new Map();
        const minha = (f) => {
          const sid = /([0-9a-f]{8}-[0-9a-f-]{27})/.exec(path.relative(PROJETOS_DESKTOP, f))?.[1];
          return sid ? donoDaConversa(sid) === a : a.email === emailDesktop;
        };
        const d = scanWindowTokens(path.join(os.homedir(), '.claude'), since, a.tokCacheDesk, minha);
        for (const k of Object.keys(total)) total[k] += d[k] || 0;
      }
      const next = { ...total, since };
      if (JSON.stringify(next) !== JSON.stringify(a.tokens)) {
        a.tokens = next;
        changed = true;
      }
    } catch (e) {
      console.error(`Nao consegui somar os tokens de ${a.nome}:`, e.message);
    }
  }
  if (changed) dirty();
}
function scheduleTokenScan() {
  if (!scanTimer) scanTimer = setTimeout(scanTokens, 800);
}
// Quase em tempo real: so os arquivos que mudaram sao relidos, entao a varredura e leve.
setInterval(scanTokens, 5000).unref();

// Sessoes do Claude desktop (e do claude aberto sem os atalhos): ficam na pasta padrao do Claude Code.
// O celular acompanha a conversa; para mandar mensagens, continua a sessao por aqui (--resume).
const PROJETOS_DESKTOP = path.join(os.homedir(), '.claude', 'projects');
let emailDesktop = null;
const lerDir = (d) => {
  try {
    return fs.readdirSync(d, { withFileTypes: true });
  } catch {
    return [];
  }
};
function pastaDaSessao(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buf.subarray(0, n).toString('utf8'));
    return m ? JSON.parse(`"${m[1]}"`) : null;
  } catch {
    return null;
  }
}
// O app Claude desktop pode estar logado em varias contas e grava as conversas de todas na pasta
// padrao; o dono de cada uma fica em claude-code-sessions/<conta>/<organizacao>/local_*.json.
// No Windows o app vem da loja (MSIX): fora dele, a pasta Roaming dele mora em Packages\Claude_*\LocalCache.
function pastaSessoesApp() {
  const sub = path.join('Claude', 'claude-code-sessions');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', sub);
  if (process.platform !== 'win32') return path.join(os.homedir(), '.config', sub);
  const pacotes = path.join(os.homedir(), 'AppData', 'Local', 'Packages');
  const opcoes = [
    ...lerDir(pacotes).filter((d) => d.isDirectory() && /^Claude_/.test(d.name)).map((d) => path.join(pacotes, d.name, 'LocalCache', 'Roaming', sub)),
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), sub),
  ];
  return opcoes.find((p) => fs.existsSync(p)) || opcoes.at(-1);
}
let donos = { at: 0, map: new Map() };
function donosDoDesktop() {
  if (now() - donos.at < 15000) return donos.map;
  const SESSOES_APP = pastaSessoesApp();
  const map = new Map(); // sid da conversa -> { uuid da conta, titulo }
  for (const conta of lerDir(SESSOES_APP)) {
    if (!conta.isDirectory()) continue;
    for (const org of lerDir(path.join(SESSOES_APP, conta.name))) {
      if (!org.isDirectory()) continue;
      for (const f of lerDir(path.join(SESSOES_APP, conta.name, org.name))) {
        if (!/^local_.*\.json$/.test(f.name)) continue;
        try {
          const j = JSON.parse(fs.readFileSync(path.join(SESSOES_APP, conta.name, org.name, f.name), 'utf8'));
          if (j.cliSessionId) map.set(j.cliSessionId, { uuid: conta.name, titulo: typeof j.title === 'string' ? j.title : null });
        } catch {
          /* arquivo pela metade */
        }
      }
    }
  }
  donos = { at: now(), map };
  return map;
}
// Conta dona de uma conversa da pasta padrao: a do app desktop, ou a logada no Claude Code padrao.
function donoDaConversa(sid) {
  const uuid = donosDoDesktop().get(sid)?.uuid;
  const contas = [...accounts.values()];
  return (uuid && contas.find((a) => a.uuid === uuid)) || contas.find((a) => a.email && a.email === emailDesktop) || contas[0];
}

function sessoesDoDesktop() {
  try {
    emailDesktop = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8')).oauthAccount?.emailAddress || null;
  } catch {
    /* sem login padrao */
  }
  if (!accounts.size) return;
  const desde = now() - 12 * 3600 * 1000;
  const achadas = [];
  for (const proj of lerDir(PROJETOS_DESKTOP)) {
    if (!proj.isDirectory()) continue;
    for (const f of lerDir(path.join(PROJETOS_DESKTOP, proj.name))) {
      if (!f.isFile() || !/^[0-9a-f-]{36}\.jsonl$/.test(f.name)) continue;
      const full = path.join(PROJETOS_DESKTOP, proj.name, f.name);
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs > desde) achadas.push({ full, sid: f.name.slice(0, 36), mtime: st.mtimeMs });
      } catch {
        /* sumiu */
      }
    }
  }
  achadas.sort((a, b) => b.mtime - a.mtime);
  const vivas = new Set();
  let mudou = false;
  for (const a of achadas.slice(0, 12)) {
    // Ja continuada pelo celular: a sessao do celular mostra tudo.
    if ([...instances.values()].some((i) => !i.desktop && i.sessionId === a.sid && i.status !== 'ended')) continue;
    const id = `desk-${a.sid.slice(0, 8)}`;
    vivas.add(id);
    let inst = instances.get(id);
    if (!inst) {
      inst = getInst(id, donoDaConversa(a.sid).id);
      inst.desktop = true;
      inst.sessionId = a.sid;
      inst.cwd = pastaDaSessao(a.full);
      inst.startedAt = a.mtime;
      setTranscript(inst, a.full);
      mudou = true;
    }
    if (!inst.name && donosDoDesktop().get(a.sid)?.titulo) {
      inst.name = clip(donosDoDesktop().get(a.sid).titulo, 40);
      mudou = true;
    }
    if (!inst.name) {
      const primeira = inst.messages.find((x) => x.role === 'user' && x.text);
      if (primeira) {
        inst.name = clip(primeira.text.replace(/\s+/g, ' '), 40);
        mudou = true;
      }
    }
    const status = now() - a.mtime < 20000 ? 'working' : 'idle';
    if (inst.status !== status) {
      inst.status = status;
      inst.activity = status === 'working' ? 'Trabalhando no Claude desktop' : '';
      mudou = true;
    }
  }
  for (const inst of [...instances.values()]) {
    if (inst.desktop && !vivas.has(inst.id)) {
      instances.delete(inst.id);
      mudou = true;
    }
  }
  if (mudou) dirty();
}
if (process.env.PAINEL_DEMO !== '1' && !process.env.PAINEL_DATA) {
  setTimeout(sessoesDoDesktop, 2500).unref();
  setInterval(sessoesDoDesktop, 5000).unref();
}

// Historico de cada conta: todas as conversas guardadas na pasta da conta e, para a conta
// logada no Claude desktop, tambem as da pasta padrao. Titulo pelo resumo ou pela primeira mensagem.
const cacheTitulo = new Map();
function tituloDaSessao(file, mtime) {
  const k = cacheTitulo.get(file);
  if (k && k.mtime === mtime) return k.titulo;
  let titulo = null;
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(131072);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    for (const l of buf.subarray(0, n).toString('utf8').split('\n')) {
      let e;
      try {
        e = JSON.parse(l);
      } catch {
        continue;
      }
      if ((e.type === 'summary' && e.summary) || (e.type === 'custom-title' && e.customTitle)) {
        titulo = e.customTitle || e.summary;
        break;
      }
      if (!titulo && e.type === 'user' && !e.isMeta && !e.isSidechain) {
        const cont = e.message?.content;
        // o primeiro texto escrito por voce; blocos internos (<ide_...>, <command-...>) ficam de fora
        const textos = typeof cont === 'string' ? [cont] : Array.isArray(cont) ? cont.filter((b) => b?.type === 'text').map((b) => b.text) : [];
        const t = textos.map((x) => String(x || '').replace(/<([a-z-]+)[^>]*>[\s\S]*?<\/\1>/g, '').trim()).find((x) => x && !x.startsWith('<'));
        if (t) titulo = t;
      }
    }
  } catch {
    /* sem leitura */
  }
  titulo = titulo ? clip(String(titulo).replace(/\s+/g, ' ').trim(), 70) : null;
  cacheTitulo.set(file, { mtime, titulo });
  return titulo;
}
function historicoDa(acc) {
  const pastas = [];
  if (acc.dir && !acc.padrao) pastas.push([path.join(acc.dir, 'projects'), 'conta']);
  pastas.push([PROJETOS_DESKTOP, 'desktop']);
  const itens = [];
  for (const [raiz, origem] of pastas) {
    for (const proj of lerDir(raiz)) {
      if (!proj.isDirectory()) continue;
      for (const f of lerDir(path.join(raiz, proj.name))) {
        if (!f.isFile() || !/^[0-9a-f-]{36}\.jsonl$/.test(f.name)) continue;
        const sid = f.name.slice(0, 36);
        if (origem === 'desktop' && donoDaConversa(sid) !== acc) continue;
        const file = path.join(raiz, proj.name, f.name);
        try {
          const st = fs.statSync(file);
          if (st.size < 200) continue;
          itens.push({ sid, file, origem, mtime: st.mtimeMs });
        } catch {
          /* sumiu */
        }
      }
    }
  }
  itens.sort((a, b) => b.mtime - a.mtime);
  // A mesma conversa pode existir nas duas pastas (continuada pelo celular): fica a mais recente.
  const vistos = new Set();
  const unicos = itens.filter((x) => !vistos.has(x.sid) && vistos.add(x.sid));
  return unicos.slice(0, 120).map((x) => ({ ...x, cwd: pastaDaSessao(x.file), titulo: donosDoDesktop().get(x.sid)?.titulo || tituloDaSessao(x.file, x.mtime) || 'Conversa sem título' }));
}

// Imagens da conversa, servidas so para celulares pareados. As mais antigas saem primeiro.
// ponytail: cache em memoria com teto de 60 imagens; reler o historico traz de volta as que sairem.
const imagens = new Map();
function guardarImagem(it) {
  const id = crypto.createHash('sha256').update(it.data).digest('hex').slice(0, 24);
  imagens.delete(id);
  imagens.set(id, { media: it.media, buf: Buffer.from(it.data, 'base64') });
  while (imagens.size > 60) imagens.delete(imagens.keys().next().value);
  return id;
}

// Uso de cada conta direto da Anthropic, com o login que o Claude Code guardou na pasta da conta.
// E a mesma consulta do /usage: o numero vale na hora, com ou sem sessao aberta.
// ponytail: so le o login; se ele venceu, espera o Claude Code renova-lo na proxima sessao.
const USO_URL = 'https://api.anthropic.com/api/oauth/usage';
// E-mail do login da conta, para dar nome as contas que ainda se chamam "Conta 1".
function lerEmail(a) {
  const f = a.padrao ? path.join(os.homedir(), '.claude.json') : path.join(a.dir, '.claude.json');
  try {
    const o = JSON.parse(fs.readFileSync(f, 'utf8')).oauthAccount;
    a.email = o?.emailAddress || null;
    a.uuid = o?.accountUuid || null;
  } catch {
    a.email = null;
  }
}
const nomeDe = (a) => prefs.contas[a.id]?.nome || (/^Conta \d+$/.test(a.nome) && a.email ? a.email.split('@')[0] : a.nome);

async function consultarUso(a) {
  lerEmail(a);
  let k;
  try {
    k = JSON.parse(fs.readFileSync(path.join(a.dir, '.credentials.json'), 'utf8')).claudeAiOauth;
  } catch {
    return false;
  }
  // plano da assinatura (pro, max, team...), para o app mostrar no cartao da conta
  if (typeof k?.subscriptionType === 'string') a.plano = k.subscriptionType;
  if (!k?.accessToken || (k.expiresAt && k.expiresAt < now())) return false;
  const r = await fetch(USO_URL, {
    headers: { Authorization: `Bearer ${k.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return false;
  const j = await r.json();
  for (const w of WINDOWS) {
    const x = j?.[w];
    // Janela sem nenhum uso vem vazia: a contagem recomeca no proximo uso.
    if (x == null) a.usage[w] = { pct: 0, resetsAt: null, fresh: true };
    else if (typeof x.utilization === 'number') {
      a.usage[w] = { pct: Math.max(0, Math.min(100, x.utilization)), resetsAt: Date.parse(x.resets_at) || null };
    }
  }
  a.usage.at = now();
  return true;
}
async function consultarContas() {
  if (process.env.PAINEL_DEMO === '1') return;
  const mudou = await Promise.all([...accounts.values()].map((a) => consultarUso(a).catch(() => false)));
  if (mudou.some(Boolean)) {
    persistSoon();
    dirty();
  }
}
setTimeout(consultarContas, 1500).unref();
setInterval(consultarContas, 60000).unref();

// ---------------------------------------------------------------- http

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

let tailnetHost = null;

// Numa sessao aberta pelo celular o texto e digitado no terminal. "!" roda um comando
// sem pedir permissao e alguns comandos de barra mudam as permissoes; por isso so
// passam os comandos de barra desta lista. Pedidos em texto comum continuam livres.
const COMANDOS_DO_CELULAR = new Set(['model', 'effort', 'compact', 'clear', 'login', 'status', 'cost', 'usage', 'context', 'help', 'init', 'resume', 'rename', 'review']);
function textoPerigoso(text) {
  const t = text.trimStart();
  if (t.startsWith('!')) return 'Comandos com ! rodam no computador sem pedir permissão, então não valem pelo celular. Peça ao Claude em texto comum.';
  if (!t.startsWith('/')) return null;
  const nome = t.slice(1).split(/\s/)[0].toLowerCase();
  if (COMANDOS_DO_CELULAR.has(nome)) return null;
  return `Pelo celular valem só estes comandos: ${[...COMANDOS_DO_CELULAR].map((c) => '/' + c).join(', ')}. Os outros, como /permissions, ficam no computador.`;
}

function cookieToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === 'painel') return part.slice(eq + 1).trim();
  }
  return null;
}
function aparelhoDe(req) {
  const t = cookieToken(req);
  if (!t) return null;
  const h = hashDe(t);
  return aparelhos.find((a) => safeEq(a.hash, h)) || null;
}
const isPhone = (req) => !!aparelhoDe(req);
function novoAparelho(nome) {
  const chave = crypto.randomBytes(32).toString('base64url');
  aparelhos.push({ id: crypto.randomBytes(6).toString('hex'), nome: texto(nome, 40) || 'Celular', hash: hashDe(chave), criado: Date.now() });
  writeJson(APARELHOS_FILE, aparelhos);
  return chave;
}
// Pareamento em duas etapas: o codigo do QR so abre um pedido; quem libera e voce, no computador,
// conferindo que os 4 numeros na janela sao os mesmos da tela do celular. Um link vazado sozinho nao entra.
const pedidosPar = new Map(); // espera -> { nome, sas, ate, estado, chave }
function pedirPareamento(nome) {
  for (const [k, p] of pedidosPar) if (p.ate < now()) pedidosPar.delete(k);
  if ([...pedidosPar.values()].filter((p) => p.estado === 'pendente').length >= 3) return null;
  const p = { espera: crypto.randomBytes(24).toString('base64url'), nome: texto(nome, 40) || 'Celular', sas: String(crypto.randomInt(0, 10000)).padStart(4, '0'), ate: now() + 3 * 60_000, estado: 'pendente', chave: null };
  pedidosPar.set(p.espera, p);
  if (TESTE_PAREAMENTO) aprovarPareamento(p);
  else {
    // Os 4 numeros so aparecem no celular: digitar aqui prova que o aparelho e o que esta na sua mao.
    console.log(`\n>>> Um aparelho quer se conectar: ${p.nome}`);
    console.log('>>> Para permitir, digite aqui os 4 numeros que aparecem na tela dele e Enter.');
    console.log('>>> Se nao foi voce, digite N e Enter.\n');
  }
  return p;
}
function aprovarPareamento(p) {
  p.chave = novoAparelho(p.nome);
  p.estado = 'ok';
  if (!TESTE_PAREAMENTO) {
    CODIGO = crypto.randomBytes(24).toString('base64url'); // o QR usado deixa de valer
    for (const x of pedidosPar.values()) if (x.estado === 'pendente') x.estado = 'negado'; // e os pedidos feitos com ele tambem
    console.log(`Pronto: ${p.nome} conectado.`);
    mostrarPareamento();
  }
}
// Resposta no teclado do computador (a janela que ligou o claudeV). Os 4 numeros liberam so o
// pedido que os mostrou; N recusa todos os pedidos abertos. Tres numeros errados derrubam os pedidos.
let errosPar = 0;
if (!TESTE_PAREAMENTO) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('error', () => {});
  process.stdin.on('data', (linha) => {
    const r = String(linha).trim().toLowerCase();
    const abertos = [...pedidosPar.values()].filter((x) => x.estado === 'pendente' && x.ate > now());
    if (!abertos.length || !r) return;
    if (r.startsWith('n')) {
      for (const p of abertos) p.estado = 'negado';
      return console.log('Pedidos recusados.');
    }
    const p = /^\d{4}$/.test(r) && abertos.find((x) => x.sas === r);
    if (p) {
      errosPar = 0;
      return aprovarPareamento(p);
    }
    if (++errosPar >= 3) {
      errosPar = 0;
      for (const x of abertos) x.estado = 'negado';
      return console.log('Numeros errados demais: os pedidos foram recusados. Escaneie o codigo de novo no celular.');
    }
    console.log('Esses numeros nao batem com nenhum aparelho. Confira a tela do celular e digite de novo.');
  });
}
// O celular espera a resposta aqui (consulta longa de ate 25 s).
async function esperarPareamento(espera) {
  const p = pedidosPar.get(String(espera || ''));
  for (let i = 0; p && p.estado === 'pendente' && p.ate > now() && i < 50; i++) await new Promise((r) => setTimeout(r, 500));
  if (!p || p.ate < now()) return { estado: 'expirado' };
  if (p.estado === 'ok') pedidosPar.delete(p.espera); // a chave sai uma vez so
  return p.estado === 'ok' ? { estado: 'ok', chave: p.chave } : { estado: p.estado };
}

const cookiePainel = (req, chave) =>
  `painel=${chave}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;

function esquecerAparelho(id) {
  aparelhos = aparelhos.filter((a) => a.id !== id);
  writeJson(APARELHOS_FILE, aparelhos);
  pushSubs = pushSubs.filter((s) => (s.aparelho || 'antigo') !== id);
  writeJson(PUSH_FILE, pushSubs);
  for (const p of phones) if (p.aparelho === id) p.ws.close(4001, 'despareado');
}
// Os programas do Claude Code falam direto com 127.0.0.1; nada que chegue pela rede
// (Tailscale ou --lan) passa por agente, mesmo com o segredo.
const local = (req) => !req.headers['x-forwarded-for'] && /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(req.socket.remoteAddress || '');
const isAgent = (req) => {
  const s = req.headers['x-painel-secret'];
  return typeof s === 'string' && local(req) && safeEq(s, cfg.agentSecret);
};

// Recusa pedidos vindos de outros sites (o navegador manda o cabecalho Origin).
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const ok = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
  if (req.headers.host) ok.add(String(req.headers.host).toLowerCase());
  if (req.headers['x-forwarded-host']) ok.add(String(req.headers['x-forwarded-host']).toLowerCase());
  if (tailnetHost) ok.add(tailnetHost);
  return ok.has(host);
}

function json(res, code, obj) {
  res.writeHead(code, { ...SEC_HEADERS, 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('grande demais'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = null;
  }
  const file = rel ? path.resolve(APP, `.${rel}`) : null;
  if (!file || !(file === APP || file.startsWith(APP + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { ...SEC_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nao encontrado');
    return;
  }
  res.writeHead(200, {
    ...SEC_HEADERS,
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://x');
  } catch {
    res.writeHead(400).end();
    return;
  }
  const p = url.pathname;
  try {
    if (p === '/parear' && req.method === 'GET') {
      const k = url.searchParams.get('k') || '';
      if (!k || !safeEq(k, CODIGO)) {
        res.writeHead(403, { ...SEC_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Codigo de pareamento invalido. Abra o link mostrado na janela do claudeV, no computador.');
        return;
      }
      const pd = pedirPareamento('Navegador');
      if (!pd) return json(res, 429, { erro: 'Pedidos demais. Responda os que estao na janela do claudeV.' });
      if (pd.estado === 'ok') {
        pedidosPar.delete(pd.espera);
        res.writeHead(302, { ...SEC_HEADERS, 'Set-Cookie': cookiePainel(req, pd.chave), Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      // A pagina mostra os 4 numeros e espera a liberacao; o pedido vai no #, que nao sai do navegador.
      res.writeHead(302, { ...SEC_HEADERS, Location: `/parear.html#${pd.espera}.${pd.sas}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (p === '/api/parear/espera' && req.method === 'POST') {
      const b = await readBody(req, 4096);
      const r = await esperarPareamento(b?.espera);
      if (r.estado === 'ok' && b?.navegador) {
        res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': MIME['.json'], 'Set-Cookie': cookiePainel(req, r.chave), 'Cache-Control': 'no-store' });
        return res.end('{"estado":"ok"}');
      }
      return json(res, r.estado === 'pendente' || r.estado === 'ok' ? 200 : 403, r);
    }

    if (p.startsWith('/ingest/')) {
      if (req.method !== 'POST' || !isAgent(req)) return json(res, 403, { erro: 'negado' });
      const body = await readBody(req);
      if (p === '/ingest/status') onStatus(body);
      else if (p === '/ingest/hook') onHook(body);
      else if (p === '/ingest/permission') return json(res, 200, await waitPermission(body, res));
      else return json(res, 404, { erro: 'rota' });
      return json(res, 200, { ok: true });
    }

    // O app Android troca o codigo do QR pela chave propria do aparelho.
    if (p === '/api/parear' && req.method === 'POST') {
      const b = await readBody(req, 4096);
      if (typeof b?.k !== 'string' || !safeEq(b.k, CODIGO)) return json(res, 403, { erro: 'codigo invalido' });
      const pd = pedirPareamento(b.nome);
      if (!pd) return json(res, 429, { erro: 'Pedidos demais. Responda os que estao na janela do claudeV.' });
      if (pd.estado === 'ok') {
        pedidosPar.delete(pd.espera);
        return json(res, 200, { chave: pd.chave });
      }
      return json(res, 202, { espera: pd.espera, sas: pd.sas });
    }

    if (p.startsWith('/api/')) {
      const aparelho = aparelhoDe(req);
      if (!aparelho) return json(res, 401, { erro: 'nao pareado' });
      if (!originOk(req)) return json(res, 403, { erro: 'origem' });
      if (p === '/api/state' && req.method === 'GET') return json(res, 200, snapshot());
      if (p.startsWith('/api/img/') && req.method === 'GET') {
        const img = imagens.get(p.slice(9));
        if (!img) return json(res, 404, { erro: 'imagem' });
        res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': img.media, 'Cache-Control': 'private, max-age=86400' });
        return res.end(img.buf);
      }
      // Arquivo anexado no celular: fica numa pasta do claudeV e a mensagem leva o caminho para o Claude ler.
      // ponytail: data/anexos nunca e limpa; apagar pastas antigas quando ocupar espaco.
      if (p === '/api/anexo' && req.method === 'POST') {
        const nome = (url.searchParams.get('nome') || 'arquivo').normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._]+/, '').slice(-80) || 'arquivo';
        const partes = [];
        let total = 0;
        for await (const ch of req) {
          total += ch.length;
          if (total > 25 * 1024 * 1024) return json(res, 413, { erro: 'Arquivo grande demais (máximo de 25 MB).' });
          partes.push(ch);
        }
        if (!total) return json(res, 400, { erro: 'Arquivo vazio.' });
        const pasta = path.join(DATA, 'anexos', `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`);
        fs.mkdirSync(pasta, { recursive: true });
        const caminho = path.join(pasta, nome);
        fs.writeFileSync(caminho, Buffer.concat(partes));
        return json(res, 200, { caminho });
      }
      if (p === '/api/push/key' && req.method === 'GET') return json(res, 200, { key: cfg.vapid.publicKey });
      if (p === '/api/push/subscribe' && req.method === 'POST') {
        const sub = await readBody(req);
        if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
          return json(res, 400, { erro: 'inscricao invalida' });
        }
        pushSubs = pushSubs.filter((s) => s.endpoint !== sub.endpoint);
        pushSubs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, aparelho: aparelho.id });
        if (pushSubs.length > 10) pushSubs = pushSubs.slice(-10);
        writeJson(PUSH_FILE, pushSubs);
        return json(res, 200, { ok: true });
      }
      if (p === '/api/desparear' && req.method === 'POST') {
        esquecerAparelho(aparelho.id);
        res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': MIME['.json'], 'Set-Cookie': 'painel=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
        res.end('{"ok":true}');
        return;
      }
      if (p === '/api/verdict' && req.method === 'POST') {
        const b = await readBody(req);
        const err = applyVerdict(b.instance, b.request_id, b.behavior);
        return json(res, err ? 409 : 200, err ? { erro: err } : { ok: true });
      }
      return json(res, 404, { erro: 'rota' });
    }

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, p);
    res.writeHead(405, SEC_HEADERS).end();
  } catch (e) {
    json(res, 400, { erro: 'pedido invalido' });
  }
});

const wssPhone = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const wssAgent = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

server.on('upgrade', (req, socket, head) => {
  let p = '';
  try {
    p = new URL(req.url, 'http://x').pathname;
  } catch {
    /* cai no destroy abaixo */
  }
  const aparelho = p === '/ws' ? aparelhoDe(req) : null;
  if (aparelho && originOk(req)) {
    wssPhone.handleUpgrade(req, socket, head, (ws) => wssPhone.emit('connection', ws, req, aparelho));
  } else if (p === '/agent' && isAgent(req)) {
    wssAgent.handleUpgrade(req, socket, head, (ws) => wssAgent.emit('connection', ws, req));
  } else {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
  }
});

wssPhone.on('connection', (ws, req, aparelho) => {
  const c = { ws, open: null, term: null, visible: true, aparelho: aparelho.id };
  phones.add(c);
  send(c, snapshot());
  ws.on('message', (raw) => {
    try {
      onPhoneMessage(c, JSON.parse(raw.toString('utf8'))).catch(() => {});
    } catch {
      /* mensagem invalida */
    }
  });
  ws.on('close', () => phones.delete(c));
  ws.on('error', () => {});
});

wssAgent.on('connection', (ws) => {
  let inst = null;
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    if (m.t === 'hello' && m.instance) {
      inst = getInst(m.instance, m.account);
      if (inst.agent && inst.agent !== ws) {
        try {
          inst.agent.close();
        } catch {
          /* ja fechado */
        }
      }
      inst.agent = ws;
      inst.goneAt = null;
      inst.updatedAt = now();
      if (inst.status === 'ended') {
        inst.status = 'idle';
        inst.endedAt = null;
      }
      if (m.sessionId && !inst.sessionId) inst.sessionId = m.sessionId;
      if (m.cwd && !inst.cwd) inst.cwd = m.cwd;
      persistSoon();
      dirty();
      return;
    }
    if (!inst) return;
    if (m.t === 'perm' && /^[a-km-z]{5}$/.test(m.request_id || '')) {
      if (inst.perms.some((p) => p.id === m.request_id)) return;
      const perm = {
        id: m.request_id,
        tool: clip(m.tool_name || 'Ferramenta', 60),
        desc: clip(m.description || '', 400),
        preview: clip(m.input_preview || '', 4000),
        at: now(),
      };
      addPerm(inst, perm);
    }
  });
  ws.on('close', () => {
    if (inst && inst.agent === ws) {
      inst.agent = null;
      inst.goneAt = now();
      dirty();
    }
  });
  ws.on('error', () => {});
});

// ---------------------------------------------------------------- inicio

function detectTailnet() {
  return new Promise((resolve) => {
    const tries = ['tailscale'];
    if (process.platform === 'win32') tries.push('C:\\Program Files\\Tailscale\\tailscale.exe');
    const next = () => {
      const bin = tries.shift();
      if (!bin) return resolve(null);
      execFile(bin, ['status', '--json'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) return next();
        tailscaleBin = bin;
        try {
          const name = JSON.parse(stdout)?.Self?.DNSName;
          resolve(name ? String(name).replace(/\.$/, '').toLowerCase() : null);
        } catch {
          next();
        }
      });
    };
    next();
  });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  }
  return out;
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`A porta ${PORT} ja esta em uso. O claudeV ja esta aberto em outra janela?`);
  else console.error(e.message);
  process.exit(1);
});

// Publica o claudeV so dentro da rede do Tailscale: HTTPS se os certificados estiverem ligados
// no painel do Tailscale, senao HTTP (a rede do Tailscale ja e criptografada de ponta a ponta).
let tailscaleBin = 'tailscale';
function publicarNoTailscale() {
  const serve = (args) => new Promise((r) => execFile(tailscaleBin, ['serve', '--bg', ...args, `localhost:${PORT}`], { timeout: 15000, windowsHide: true }, (err) => r(!err)));
  return serve(['--https=443']).then((ok) => (ok ? 'https' : serve(['--http=80']).then((ok2) => (ok2 ? 'http' : null))));
}

let basePareamento = `http://localhost:${PORT}`;
function mostrarPareamento() {
  const link = `${basePareamento}/parear?k=${CODIGO}`;
  if (!argv.has('--sem-qr')) {
    console.log('Para conectar um celular, abra o app claudeV e aponte a camera para o codigo abaixo:\n');
    qrcode.generate(link, { small: true });
  }
  console.log(`\nLink de pareamento (nao compartilhe):\n${link}\n`);
  console.log('Depois de escanear, o celular mostra 4 numeros: digite-os aqui nesta janela para liberar.\n');
}

server.listen(PORT, HOST, async () => {
  tailnetHost = await detectTailnet();
  // Hub de teste (pasta de dados propria) nao mexe no Tailscale de verdade.
  const esquema = tailnetHost && !TESTE_PAREAMENTO && !process.env.PAINEL_DATA ? await publicarNoTailscale() : null;
  if (tailnetHost && esquema) basePareamento = `${esquema}://${tailnetHost}`;
  else if (HOST === '0.0.0.0' && lanAddresses().length) basePareamento = `http://${lanAddresses()[0]}:${PORT}`;
  console.log('\nclaudeV ligado.\n');
  mostrarPareamento();
  if (!esquema && HOST !== '0.0.0.0') {
    console.log(tailnetHost ? 'O Tailscale nao aceitou publicar o claudeV; confira se ele esta conectado.' : 'Tailscale nao encontrado: por enquanto o claudeV so abre neste computador.');
    console.log('Instale o Tailscale no computador e no celular, entre com a mesma conta e abra o claudeV de novo.\n');
  }
  console.log(`Contas: ${[...accounts.values()].map((a) => nomeDe(a)).join(', ')}`);
  console.log('Deixe esta janela aberta. Ctrl+C para desligar.\n');
});

// Resumo de uma resposta para a lista de sessoes e os avisos: sem asteriscos, crases e titulos do markdown.
function semMarkdown(t) {
  return String(t || '').replace(/[*`#>]+/g, '').replace(/\s+/g, ' ').trim();
}
