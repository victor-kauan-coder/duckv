#!/usr/bin/env node
// Confere, com o login de cada conta, o que a Anthropic deixa o duckV ler: as sessoes da nuvem e do
// Cowork e as conversas normais do claude.ai. Mostra so o codigo de cada resposta e os nomes dos
// campos: nada de token, titulo ou conteudo de conversa aparece na tela.
//
//   node tools/sondar.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAccounts } from '../lib/config.mjs';

const lerJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const formato = (v, prof = 0) => {
  if (Array.isArray(v)) return `[${v.length}${v.length ? ` x ${formato(v[0], prof + 1)}` : ''}]`;
  if (v && typeof v === 'object') return prof > 1 ? '{…}' : `{${Object.keys(v).slice(0, 24).map((k) => `${k}: ${formato(v[k], prof + 1)}`).join(', ')}}`;
  return typeof v;
};

for (const a of loadAccounts()) {
  if ((a.agente || 'claude') !== 'claude') continue;
  const dir = a.dir || path.join(os.homedir(), '.claude');
  const k = lerJson(path.join(dir, '.credentials.json'))?.claudeAiOauth;
  const org = lerJson(a.dir ? path.join(a.dir, '.claude.json') : path.join(os.homedir(), '.claude.json'))?.oauthAccount?.organizationUuid;
  console.log(`\n=== ${a.id}  login: ${k?.accessToken ? 'sim' : 'nao'}  vence em: ${k?.expiresAt ? Math.round((k.expiresAt - Date.now()) / 60000) + ' min' : '?'}  escopos: ${(k?.scopes || []).join(' ')}`);
  if (!k?.accessToken) continue;
  const base = { Authorization: `Bearer ${k.accessToken}`, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', ...(org ? { 'x-organization-uuid': org } : {}) };
  const testes = [
    ['nuvem: /v1/sessions', 'https://api.anthropic.com/v1/sessions', { 'anthropic-beta': 'ccr-byoc-2025-07-29' }],
    ['nuvem: /v1/code/sessions', 'https://api.anthropic.com/v1/code/sessions', {}],
    ['chats: api.anthropic.com', `https://api.anthropic.com/api/organizations/${org}/chat_conversations?limit=2`, { 'anthropic-beta': 'oauth-2025-04-20' }],
    ['chats: claude.ai', `https://claude.ai/api/organizations/${org}/chat_conversations?limit=2`, {}],
  ];
  for (const [nome, url, extra] of testes) {
    try {
      const r = await fetch(url, { headers: { ...base, ...extra }, signal: AbortSignal.timeout(15000) });
      const t = await r.text();
      let j = null;
      try {
        j = JSON.parse(t);
      } catch {
        /* nao e JSON */
      }
      console.log(`${nome.padEnd(28)} ${r.status}  ${j ? formato(j) : `(${t.length} bytes, nao e JSON)`}`);
    } catch (e) {
      console.log(`${nome.padEnd(28)} falhou: ${e.message}`);
    }
  }
}

// --detalhe: os campos de uma sessao e de alguns eventos dela (so nomes e tipos, sem valores).
if (process.argv.includes('--detalhe')) {
  const campos = (v, prof = 0) => {
    if (Array.isArray(v)) return `[${v.length}${v.length ? ` x ${campos(v[0], prof + 1)}` : ''}]`;
    if (v && typeof v === 'object') return prof > 3 ? '{…}' : `{${Object.keys(v).map((k) => `${k}: ${campos(v[k], prof + 1)}`).join(', ')}}`;
    return v === null ? 'null' : typeof v;
  };
  const a = loadAccounts().find((x) => x.id === (process.argv.find((x) => x.startsWith('--conta='))?.slice(8) || 'conta3'));
  const k = lerJson(path.join(a.dir, '.credentials.json')).claudeAiOauth;
  const org = lerJson(path.join(a.dir, '.claude.json'))?.oauthAccount?.organizationUuid;
  const h = { Authorization: `Bearer ${k.accessToken}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'ccr-byoc-2025-07-29', 'x-organization-uuid': org };
  const lista = await (await fetch('https://api.anthropic.com/v1/sessions', { headers: h })).json();
  const s = lista.data[0];
  console.log('\nsessao:', campos(s));
  console.log('status:', [...new Set(lista.data.map((x) => `${x.status}/${x.worker_status}/${x.environment_kind}`))].join('  '));
  const r = await fetch(`https://api.anthropic.com/v1/sessions/${s.id}/events`, { headers: h });
  const ev = await r.json().catch(() => null);
  console.log('eventos:', r.status, campos(Object.fromEntries(Object.entries(ev || {}).filter(([k]) => k !== 'data'))));
  for (const e of (ev?.data || []).slice(0, 6)) console.log('  ', campos(e));
  console.log('tipos:', [...new Set((ev?.data || []).map((e) => e.type))].join(' '));
}
