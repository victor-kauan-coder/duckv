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
import { hostedAvailable, hostedError, startHosted, folderAllowed, listFolders, readPrompt, readFooter, MODELS, EFFORTS, MODES } from './hosted.mjs';

const argv = new Set(process.argv.slice(2));
const cfg = ensureConfig(() => webpush.generateVAPIDKeys());
if (argv.has('--novo-token')) {
  cfg.token = crypto.randomBytes(32).toString('base64url');
  writeJson(CONFIG_FILE, cfg);
  console.log('Novo codigo de pareamento criado. Os celulares ja pareados precisam parear de novo.');
}
const PORT = Number(process.env.PAINEL_PORT) || cfg.port;
const HOST = argv.has('--lan') ? '0.0.0.0' : '127.0.0.1';
const APP = path.join(ROOT, 'app');
const STATE_FILE = path.join(DATA, 'state.json');
const PUSH_FILE = path.join(DATA, 'push.json');
// Codigo novo tambem corta os avisos de quem tinha o codigo antigo.
if (argv.has('--novo-token')) writeJson(PUSH_FILE, []);
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
  let n = lista.length + 1;
  while (ids.has(`conta${n}`)) n++;
  const id = `conta${n}`;
  const nome = texto(nomePedido, 30).replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || `Conta ${n}`;
  const modelo = lista.find((a) => a.dir);
  const base = modelo ? path.dirname(modelo.dir) : path.join(os.homedir(), '.claude-contas');
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
let pushSubs = readJson(PUSH_FILE, []) || [];

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
  return { ...a, nome: prefs.contas[a.id]?.nome || a.nome };
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
    tasks,
    perms: i.perms.map((p) => ({ id: p.id, tool: p.tool, desc: p.desc, preview: p.preview, at: p.at, toolUseId: p.toolUseId })),
    localAsk: i.localAsk,
    hosted: !!i.hosted,
    pergunta: i.hosted ? i.pergunta : null,
    rodape: i.hosted ? i.rodape : '',
    effort: i.effort,
    permMode: i.permMode,
    canSend: (!!i.agent || !!i.hosted) && i.status !== 'ended',
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
      nome: prefs.contas[a.id]?.nome || a.nome,
      cor: prefs.contas[a.id]?.cor || a.cor,
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
    if (it.role === 'assistant') inst.lastText = clip(it.text, 200);
  }
  if (!fresh.length) return;
  if (inst.messages.length > 400) {
    const drop = inst.messages.splice(0, inst.messages.length - 400);
    for (const d of drop) inst.msgIds.delete(d.id);
  }
  for (const c of phones) if (c.open === inst.id) send(c, { t: 'msgs', instance: inst.id, items: fresh });
}

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

function onPhoneMessage(c, m) {
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
  const acc = accounts.get(m.account);
  if (!acc) return { err: 'Conta não encontrada.' };
  const cwd = folderAllowed(String(m.cwd || ''), cfg.pastasPermitidas || [], folders);
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
  if (!acc.padrao && acc.dir) env.CLAUDE_CONFIG_DIR = acc.dir;
  try {
    inst.hosted = startHosted({
      cwd,
      env,
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
      if (ev.last_assistant_message) inst.lastText = clip(ev.last_assistant_message, 200);
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
    items.push(...p.items);
  }
  if (changed) {
    const t = { in: 0, out: 0, cw: 0, cr: 0 };
    for (const u of inst.usageById.values()) {
      t.in += u.in;
      t.out += u.out;
      t.cw += u.cw;
      t.cr += u.cr;
    }
    inst.tokens = t;
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
    const r = a.usage.five_hour?.resetsAt;
    if (!a.dir || !r) continue;
    try {
      const since = r - FIVE_H;
      const total = scanWindowTokens(a.dir, since, a.tokCache);
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
  if (!scanTimer) scanTimer = setTimeout(scanTokens, 4000);
}
setInterval(scanTokens, 60000).unref();

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

function cookieToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === 'painel') return part.slice(eq + 1).trim();
  }
  return null;
}
const isPhone = (req) => {
  const t = cookieToken(req);
  return !!t && safeEq(t, cfg.token);
};
const isAgent = (req) => {
  const s = req.headers['x-painel-secret'];
  return typeof s === 'string' && safeEq(s, cfg.agentSecret);
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
      if (!k || !safeEq(k, cfg.token)) {
        res.writeHead(403, { ...SEC_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Codigo de pareamento invalido. Abra o link mostrado na janela do claudeV, no computador.');
        return;
      }
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.writeHead(302, {
        ...SEC_HEADERS,
        'Set-Cookie': `painel=${cfg.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
        Location: '/',
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
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

    if (p.startsWith('/api/')) {
      if (!isPhone(req)) return json(res, 401, { erro: 'nao pareado' });
      if (!originOk(req)) return json(res, 403, { erro: 'origem' });
      if (p === '/api/state' && req.method === 'GET') return json(res, 200, snapshot());
      if (p === '/api/push/key' && req.method === 'GET') return json(res, 200, { key: cfg.vapid.publicKey });
      if (p === '/api/push/subscribe' && req.method === 'POST') {
        const sub = await readBody(req);
        if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
          return json(res, 400, { erro: 'inscricao invalida' });
        }
        pushSubs = pushSubs.filter((s) => s.endpoint !== sub.endpoint);
        pushSubs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
        if (pushSubs.length > 10) pushSubs = pushSubs.slice(-10);
        writeJson(PUSH_FILE, pushSubs);
        return json(res, 200, { ok: true });
      }
      if (p === '/api/desparear' && req.method === 'POST') {
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
  if (p === '/ws' && isPhone(req) && originOk(req)) {
    wssPhone.handleUpgrade(req, socket, head, (ws) => wssPhone.emit('connection', ws, req));
  } else if (p === '/agent' && isAgent(req)) {
    wssAgent.handleUpgrade(req, socket, head, (ws) => wssAgent.emit('connection', ws, req));
  } else {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
  }
});

wssPhone.on('connection', (ws) => {
  const c = { ws, open: null, term: null, visible: true };
  phones.add(c);
  send(c, snapshot());
  ws.on('message', (raw) => {
    try {
      onPhoneMessage(c, JSON.parse(raw.toString('utf8')));
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

server.listen(PORT, HOST, async () => {
  tailnetHost = await detectTailnet();
  let base;
  if (tailnetHost) base = `https://${tailnetHost}`;
  else if (HOST === '0.0.0.0' && lanAddresses().length) base = `http://${lanAddresses()[0]}:${PORT}`;
  else base = `http://localhost:${PORT}`;
  const link = `${base}/parear?k=${cfg.token}`;
  console.log('\nclaudeV ligado.\n');
  if (!argv.has('--sem-qr')) {
    console.log('Para parear o celular, aponte a camera para o codigo abaixo:\n');
    qrcode.generate(link, { small: true });
  }
  console.log(`\nLink de pareamento (nao compartilhe):\n${link}\n`);
  if (!tailnetHost && HOST !== '0.0.0.0') {
    console.log('Tailscale nao encontrado: por enquanto o claudeV so abre neste computador.');
    console.log('Veja o LEIAME.md, passo "Acesso de qualquer lugar".\n');
  }
  console.log(`Contas: ${[...accounts.values()].map((a) => a.nome).join(', ')}`);
  console.log('Deixe esta janela aberta. Ctrl+C para desligar.\n');
});
