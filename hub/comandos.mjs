// Comandos de barra que o celular mostra enquanto voce digita "/": os do proprio agente
// e as skills e comandos personalizados instalados neste computador (da conta e da pasta do projeto).
import fs from 'node:fs';
import path from 'node:path';
import { agenteDe, codexHome, geminiHome } from './agentes.mjs';

const clip = (s, n) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const ler = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};
const pastas = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};
// Arquivos com a extensao dada, ate dois niveis de subpasta (o Claude Code aceita commands/frontend/x.md).
function arquivos(dir, ext, prof = 2, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const f = path.join(dir, e.name);
    if (e.isDirectory() && prof > 0) arquivos(f, ext, prof - 1, out);
    else if (e.isFile() && e.name.endsWith(ext)) out.push(f);
  }
  return out;
}

// Cabecalho YAML simples (name, description, allowed-tools), sem depender de biblioteca.
// Aceita valor na mesma linha, em bloco (> ou |) e em lista (- item).
function cabecalho(txt) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(txt || '');
  const out = { corpo: m ? txt.slice(m[0].length) : txt || '' };
  if (!m) return out;
  const linhas = m[1].split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(linhas[i]);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v === '' || v === '>' || v === '|' || v === '>-' || v === '|-') {
      const mais = [];
      while (i + 1 < linhas.length && /^(\s+|\s*-\s)/.test(linhas[i + 1])) mais.push(linhas[++i].replace(/^\s*-?\s*/, ''));
      v = mais.join(' ');
    }
    out[kv[1].toLowerCase()] = v.replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

// Uma skill ou comando que libera o terminal sem perguntar (allowed-tools com Bash, ou !`...` no texto)
// rodaria comandos no computador sem pedido de permissao: aparece na lista, mas so roda no computador.
// O ! precisa vir depois de espaco ou no comeco da linha, para nao pegar `#VALUE!` e afins.
const RODA_SOZINHO = 'Roda comandos no computador sem pedir permissão, então só vale no computador.';
function bloqueio(c) {
  if (/\bBash\b/.test(c['allowed-tools'] || '') || /(^|[\s(])!`[^`\n]+`/m.test(c.corpo) || /(^|[\s(])!\{[^}\n]+\}/m.test(c.corpo)) return RODA_SOZINHO;
  return null;
}

function skills(dir, origem, prefixo = '') {
  return pastas(dir).flatMap((nome) => {
    const c = cabecalho(ler(path.join(dir, nome, 'SKILL.md')));
    if (!c.corpo) return [];
    return [{ nome: `/${prefixo}${c.name || nome}`, desc: clip(c.description, 160), tipo: 'skill', origem, bloqueado: bloqueio(c) }];
  });
}

function comandosMd(dir, origem, prefixo = '') {
  return arquivos(dir, '.md').map((f) => {
    const c = cabecalho(ler(f));
    const primeira = c.corpo.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#')) || '';
    return { nome: `/${prefixo}${path.basename(f, '.md')}`, desc: clip(c.description || primeira, 160), tipo: 'personalizado', origem, bloqueado: bloqueio(c) };
  });
}

// Comandos do Gemini CLI em .toml: commands/git/commit.toml vira /git:commit.
function comandosToml(dir, origem) {
  return arquivos(dir, '.toml').map((f) => {
    const txt = ler(f) || '';
    const desc = /^description\s*=\s*"((?:[^"\\]|\\.)*)"/m.exec(txt)?.[1] || '';
    const nome = path.relative(dir, f).replace(/\.toml$/, '').split(path.sep).join(':');
    return { nome: `/${nome}`, desc: clip(desc, 160), tipo: 'personalizado', origem, bloqueado: /!\{/.test(txt) ? RODA_SOZINHO : null };
  });
}

// Plugins instalados no Claude Code: cada um traz skills e comandos com o nome do plugin na frente.
function plugins(dirConta) {
  const lista = (() => {
    try {
      return JSON.parse(ler(path.join(dirConta, 'plugins', 'installed_plugins.json')) || '{}').plugins || {};
    } catch {
      return {};
    }
  })();
  return Object.entries(lista).flatMap(([id, instalacoes]) => {
    const onde = [].concat(instalacoes || []).find((x) => x?.installPath)?.installPath;
    if (!onde) return [];
    const nome = id.split('@')[0];
    return [...skills(path.join(onde, 'skills'), `Plugin ${nome}`, `${nome}:`), ...comandosMd(path.join(onde, 'commands'), `Plugin ${nome}`, `${nome}:`)];
  });
}

function doClaude(dirConta, cwd) {
  const synced = path.join(dirConta, 'skills', 'synced');
  return [
    ...(cwd ? [...skills(path.join(cwd, '.claude', 'skills'), 'Este projeto'), ...comandosMd(path.join(cwd, '.claude', 'commands'), 'Este projeto')] : []),
    ...skills(path.join(dirConta, 'skills'), 'Sua conta').filter((s) => s.nome !== '/synced'),
    ...comandosMd(path.join(dirConta, 'commands'), 'Sua conta'),
    // skills da organizacao no claude.ai, sincronizadas pelo Claude Code
    ...pastas(synced).flatMap((p) => skills(path.join(synced, p), 'claude.ai', 'anthropic-skills:')),
    ...plugins(dirConta),
  ];
}

const cache = new Map();

/**
 * Lista para uma sessao. Nas abertas pelo celular o texto e digitado no terminal, entao valem
 * os comandos do agente; nas abertas no computador a mensagem chega ao Claude como texto, e so
 * as skills e comandos personalizados funcionam (o Claude os chama pelo nome).
 * `fresco` le as pastas de novo (abrir a lista); a conferencia de cada mensagem usa o que ja foi lido.
 */
export function listarComandos({ agente, dir, padrao, cwd, hospedada }, fresco = false) {
  const ag = agenteDe(agente);
  const chave = [ag.id, dir, cwd, hospedada].join('|');
  const c = cache.get(chave);
  if (c && !fresco && Date.now() - c.em < 30_000) return c.itens;

  let extras = [];
  if (ag.id === 'claude') extras = doClaude(dir, cwd);
  else if (ag.id === 'codex') extras = comandosMd(path.join(codexHome(dir, padrao), 'prompts'), 'Sua conta', 'prompts:');
  else if (ag.id === 'gemini') {
    extras = [...(cwd ? comandosToml(path.join(cwd, '.gemini', 'commands'), 'Este projeto') : []), ...comandosToml(path.join(geminiHome(dir, padrao), 'commands'), 'Sua conta')];
  }
  // Fora do Claude, so a sessao aberta pelo celular digita no terminal do agente.
  if (!hospedada && ag.id !== 'claude') extras = [];

  const itens = [];
  const vistos = new Set();
  const embutidos = hospedada ? ag.comandos.map(([nome, desc]) => ({ nome, desc, tipo: 'comando', origem: ag.nome, bloqueado: null })) : [];
  for (const it of [...embutidos, ...extras.sort((a, b) => a.nome.localeCompare(b.nome))]) {
    const k = it.nome.toLowerCase();
    if (vistos.has(k) || !/^\/[\w:.-]+$/.test(it.nome)) continue;
    vistos.add(k);
    itens.push(it);
  }
  cache.set(chave, { em: Date.now(), itens: itens.slice(0, 300) });
  return itens.slice(0, 300);
}
