#!/usr/bin/env node
// Canal do painel: um servidor MCP que o Claude Code inicia junto com a sessao.
// Ele leva as mensagens do celular para dentro da sessao e repassa os pedidos
// de permissao, devolvendo a resposta (aceitar / recusar) dada no celular.
//
// Importante: a saida padrao (stdout) e o fio de comunicacao com o Claude Code.
// Nada alem do protocolo pode ser escrito nela; avisos vao para stderr.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import WebSocket from 'ws';
import { hubConfig, ident } from './common.mjs';

const log = (...a) => process.stderr.write(`[painel] ${a.join(' ')}\n`);
const { account, instance } = ident();

const mcp = new Server(
  { name: 'painel', version: '0.1.0' },
  {
    capabilities: {
      experimental: {
        'claude/channel': {},
        'claude/channel/permission': {},
      },
    },
    instructions:
      'Mensagens que chegam como <channel source="painel" ...> foram escritas pelo proprio usuario no aplicativo ' +
      'do celular, que acompanha esta sessao a distancia. Trate-as exatamente como se ele as tivesse digitado ' +
      'aqui no terminal. Responda normalmente: o aplicativo mostra suas respostas, nao existe ferramenta de resposta.',
  },
);

let ws = null;
let retry = 1000;
const queue = []; // pedidos de permissao feitos enquanto o painel estava fora do ar

function toHub(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

// Pedido de permissao vindo do Claude Code: encaminha ao painel.
mcp.fallbackNotificationHandler = async (n) => {
  if (n?.method !== 'notifications/claude/channel/permission_request') return;
  const p = n.params || {};
  const msg = {
    t: 'perm',
    request_id: String(p.request_id || ''),
    tool_name: String(p.tool_name || ''),
    description: String(p.description || ''),
    input_preview: String(p.input_preview || ''),
  };
  if (!toHub(msg)) {
    queue.push({ at: Date.now(), msg });
    if (queue.length > 20) queue.shift();
  }
};

async function fromHub(m) {
  try {
    if (m.t === 'msg' && typeof m.text === 'string' && m.text.trim()) {
      await mcp.notification({
        method: 'notifications/claude/channel',
        params: { content: m.text, meta: { origem: 'celular' } },
      });
    } else if (m.t === 'verdict' && /^[a-km-z]{5}$/.test(m.request_id || '')) {
      await mcp.notification({
        method: 'notifications/claude/channel/permission',
        params: { request_id: m.request_id, behavior: m.behavior === 'allow' ? 'allow' : 'deny' },
      });
    }
  } catch (e) {
    log('falha ao entregar ao Claude Code:', e.message);
  }
}

function connect() {
  const cfg = hubConfig();
  if (!cfg) {
    setTimeout(connect, 15000).unref();
    return;
  }
  const port = process.env.PAINEL_PORT || cfg.port;
  ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, { headers: { 'x-painel-secret': cfg.agentSecret } });
  ws.on('open', () => {
    retry = 1000;
    toHub({ t: 'hello', account, instance, sessionId: process.env.CLAUDE_CODE_SESSION_ID || null, cwd: process.cwd() });
    const fresh = queue.splice(0).filter((q) => Date.now() - q.at < 10 * 60 * 1000);
    for (const q of fresh) toHub(q.msg);
  });
  ws.on('message', (raw) => {
    try {
      fromHub(JSON.parse(raw.toString('utf8')));
    } catch {
      /* mensagem invalida */
    }
  });
  ws.on('close', () => {
    ws = null;
    setTimeout(connect, retry).unref();
    retry = Math.min(retry * 2, 15000);
  });
  ws.on('error', () => {});
}

await mcp.connect(new StdioServerTransport());

// Sem o atalho da conta (PAINEL_INSTANCE ausente) a sessao nao pertence ao
// painel: o servidor fica ligado, mas quieto.
if (instance) connect();
else log('sessao aberta fora dos atalhos do painel; canal inativo.');

// Quando o Claude Code fecha, a entrada padrao termina: encerra junto.
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
