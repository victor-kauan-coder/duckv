// Funcoes usadas pelos pequenos programas que o Claude Code executa em cada sessao.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function hubConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(process.env.PAINEL_DATA || path.join(ROOT, 'data'), 'config.json'), 'utf8'));
    return c.port && c.agentSecret ? c : null;
  } catch {
    return null;
  }
}

// Quem esta falando: a conta e a janela do Claude Code, definidas pelo atalho que abriu a sessao.
export const ident = () => ({
  account: process.env.PAINEL_ACCOUNT || 'conta1',
  instance: process.env.PAINEL_INSTANCE || null,
});

export function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

// Envia um relatorio ao painel. Se o painel estiver desligado, desiste em silencio.
export async function post(pathname, body, ms = 900) {
  const c = hubConfig();
  if (!c) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${process.env.PAINEL_PORT || c.port}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-painel-secret': c.agentSecret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    return r.ok;
  } catch {
    return false;
  }
}
