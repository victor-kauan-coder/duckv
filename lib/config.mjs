// Caminhos e arquivos de configuracao compartilhados pelo servidor e pela instalacao.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// PAINEL_DATA e PAINEL_CONTAS existem para o modo de demonstracao usar arquivos separados.
export const DATA = process.env.PAINEL_DATA || path.join(ROOT, 'data');
export const CONFIG_FILE = path.join(DATA, 'config.json');
export const ACCOUNTS_FILE = process.env.PAINEL_CONTAS || path.join(ROOT, 'contas.json');

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const secret = () => crypto.randomBytes(32).toString('base64url');

// Cria data/config.json na primeira vez. `makeVapid` vem de quem tem a
// biblioteca web-push carregada (o servidor e a instalacao).
export function ensureConfig(makeVapid) {
  const cfg = readJson(CONFIG_FILE, {}) || {};
  let changed = false;
  if (!cfg.port) { cfg.port = 8765; changed = true; }
  if (!cfg.agentSecret) { cfg.agentSecret = secret(); changed = true; }
  if (!cfg.vapid && makeVapid) { cfg.vapid = makeVapid(); changed = true; }
  if (changed) writeJson(CONFIG_FILE, cfg);
  return cfg;
}

export const AGENTES_IDS = ['claude', 'codex', 'gemini', 'opencode', 'cline'];

// Tres tons de fogo: ambar, laranja e queimado.
export const DEFAULT_COLORS = ['#ffb22e', '#ff7a1a', '#c4420a'];

export function defaultAccounts() {
  const base = path.join(os.homedir(), '.claude-contas');
  return [1, 2, 3].map((n, i) => ({
    id: `conta${n}`,
    nome: `Conta ${n}`,
    cor: DEFAULT_COLORS[i],
    dir: path.join(base, `conta${n}`),
    padrao: false,
    agente: 'claude',
  }));
}

export function loadAccounts() {
  const list = readJson(ACCOUNTS_FILE, null);
  if (!Array.isArray(list) || !list.length) return defaultAccounts();
  return list
    .filter((a) => a && typeof a.id === 'string' && /^[a-z0-9_-]{1,24}$/i.test(a.id))
    .map((a, i) => ({
      id: a.id,
      nome: String(a.nome || a.id).slice(0, 40),
      cor: /^#[0-9a-f]{6}$/i.test(a.cor || '') ? a.cor : DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      // "dir": null usa a pasta padrao do agente (o login que voce ja tem).
      dir: a.dir ? String(a.dir) : path.join(os.homedir(), '.claude'),
      padrao: !a.dir,
      // Qual agente de codigo a conta usa; sem o campo, e o Claude Code.
      agente: AGENTES_IDS.includes(a.agente) ? a.agente : 'claude',
    }));
}
