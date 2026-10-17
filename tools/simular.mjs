#!/usr/bin/env node
// Modo demonstracao: liga um duckV separado (porta 8766) com tres contas de
// mentira, para ver o app funcionando antes de conectar o Claude Code de verdade.
// Nada aqui toca nas suas contas nem gasta o seu limite.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = path.join(ROOT, 'data', 'demo');
const PORT = process.env.PAINEL_PORT || '8766';
fs.rmSync(DEMO, { recursive: true, force: true });
fs.mkdirSync(DEMO, { recursive: true });

const contas = [
  { id: 'conta1', nome: 'Trabalho', cor: '#ffb22e', dir: path.join(DEMO, 'conta1'), agente: 'claude' },
  { id: 'conta2', nome: 'Pessoal', cor: '#ff7a1a', dir: path.join(DEMO, 'conta2'), agente: 'codex' },
  { id: 'conta3', nome: 'Estudos', cor: '#c4420a', dir: path.join(DEMO, 'conta3'), agente: 'gemini' },
];
fs.writeFileSync(path.join(DEMO, 'contas.json'), JSON.stringify(contas, null, 2));

// Na demonstracao, "Abrir sessao" (de qualquer conta) e "Todas as contas" abrem o terminal de mentira
// em vez do agente de verdade. Com FAKE_TRABALHA=1 ele ainda finge trabalhar: a tarefa escrita ao abrir
// (ou o briefing de equipe) vira conversa e o estado e a atividade da sessao vao mudando, entao da para
// ver os patos da equipe andando juntos sem nenhuma conta de verdade.
const MENTIRA = path.join(ROOT, 'tests', 'terminal-de-mentira.mjs');
const env = {
  PAINEL_CLAUDE_CMD: JSON.stringify([process.execPath, MENTIRA]),
  FAKE_HOOK: path.join(ROOT, 'agent', 'hook.mjs'),
  FAKE_TRABALHA: '1',
  ...process.env,
  PAINEL_DEMO: '1',
  PAINEL_DATA: DEMO,   PAINEL_CONTAS: path.join(DEMO, 'contas.json'),
  PAINEL_PORT: PORT,
};
// Aberto pelo app do computador (DUCKV_DEMO=1): a chave da janela passa direto para o servidor de demonstracao.
const peloApp = typeof process.send === 'function';
const hub = spawn(process.execPath, [path.join(ROOT, 'hub', 'server.mjs'), ...process.argv.slice(2)], { env, stdio: peloApp ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit' });
if (peloApp) {
  process.on('message', (m) => hub.connected && hub.send(m));
  process.on('disconnect', () => hub.kill());
}
hub.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => hub.kill());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
let cfg = null;
for (let i = 0; i < 40 && !cfg; i++) {
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(DEMO, 'config.json'), 'utf8'));
  } catch {
    await sleep(250);
  }
}
if (!cfg) {
  console.error('O duckV de demonstracao nao iniciou.');
  process.exit(1);
}
const base = `http://127.0.0.1:${PORT}`;
const post = (p, body) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-painel-secret': cfg.agentSecret }, body: JSON.stringify(body) }).catch(() => {});

const seg = () => Math.floor(Date.now() / 1000);
const limites = {
  conta1: { five_hour: { used_percentage: 62, resets_at: seg() + 2 * 3600 + 13 * 60 }, seven_day: { used_percentage: 27, resets_at: seg() + 4 * 86400 } },
  conta2: { five_hour: { used_percentage: 88, resets_at: seg() + 41 * 60 }, seven_day: { used_percentage: 54, resets_at: seg() + 2 * 86400 + 3600 } },
  conta3: { five_hour: { used_percentage: 100, resets_at: seg() + 75 }, seven_day: { used_percentage: 71, resets_at: seg() + 6 * 86400 } },
};

let n = 0;
class Sessao {
  constructor(conta, nome, pastaProjeto, modelo) {
    Object.assign(this, { conta, nome, modelo, cwd: pastaProjeto });
    this.id = `${conta}-demo${++n}`;
    this.sid = `demo-${n}`;
    this.arquivo = path.join(DEMO, conta, 'projects', 'demo', `${this.sid}.jsonl`);
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    fs.writeFileSync(this.arquivo, '');
    this.seq = 0;
    this.ctx = 9000 + n * 7000;
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/agent`, { headers: { 'x-painel-secret': cfg.agentSecret } });
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'hello', account: conta, instance: this.id, sessionId: this.sid, cwd: pastaProjeto })));
    this.ws.on('message', (raw) => this.doPainel(JSON.parse(raw)));
    this.ws.on('error', () => {});
  }
  linha(o) {
    fs.appendFileSync(this.arquivo, `${JSON.stringify({ uuid: `${this.sid}-${++this.seq}`, timestamp: new Date().toISOString(), ...o })}\n`);
  }
  usuario(texto) {
    this.linha({ type: 'user', message: { role: 'user', content: texto } });
  }
  claude(texto, ferramentas = []) {
    this.ctx += 1800;
    this.linha({
      type: 'assistant',
      message: {
        id: `msg-${this.sid}-${this.seq}`,
        role: 'assistant',
        content: [...(texto ? [{ type: 'text', text: texto }] : []), ...ferramentas.map((f, i) => ({ type: 'tool_use', id: `tu-${this.sid}-${this.seq}-${i}`, ...f }))],
        usage: { input_tokens: 40, output_tokens: 900 + Math.round(Math.random() * 900), cache_creation_input_tokens: 2400, cache_read_input_tokens: this.ctx },
      },
    });
  }
  hook(nome, extra = {}) {
    return post('/ingest/hook', { account: this.conta, instance: this.id, event: { hook_event_name: nome, session_id: this.sid, transcript_path: this.arquivo, cwd: this.cwd, ...extra } });
  }
  status() {
    return post('/ingest/status', {
      account: this.conta,
      instance: this.id,
      data: {
        session_id: this.sid,
        session_name: this.nome,
        cwd: this.cwd,
        model: this.modelo,
        transcript_path: this.arquivo,
        ctx: { pct: (this.ctx / 200000) * 100, in: this.ctx, out: 1200, size: 200000 },
        lines: { add: 40 + this.seq * 3, rem: 6 + this.seq },
        rate_limits: limites[this.conta],
      },
    });
  }
  pedir(tool, desc, preview) {
    const letras = 'abcdefghijkmnopqrstuvwxyz';
    const rid = Array.from({ length: 5 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
    this.ws.send(JSON.stringify({ t: 'perm', request_id: rid, tool_name: tool, description: desc, input_preview: preview }));
  }
  async doPainel(m) {
    if (m.t === 'verdict') {
      console.log(`[demo] ${this.nome}: pedido ${m.behavior === 'allow' ? 'ACEITO' : 'RECUSADO'} no celular`);
      this.claude(m.behavior === 'allow' ? 'Permissão recebida. Publicando a versão nova.' : 'Tudo bem, não vou publicar. Me diga como prefere seguir.');
      await this.hook('Stop', { last_assistant_message: m.behavior === 'allow' ? 'Versão publicada.' : 'Publicação cancelada.' });
      setTimeout(() => this.pedirDeploy(), 25000);
    } else if (m.t === 'msg') {
      console.log(`[demo] ${this.nome}: mensagem do celular: ${m.text}`);
      await this.hook('UserPromptSubmit');
      await sleep(1800);
      this.claude(`Recebi sua mensagem do celular: “${m.text}”. No uso real, eu começaria a trabalhar nela agora.`);
      await this.status();
      await this.hook('Stop', { last_assistant_message: 'Recebi sua mensagem do celular.' });
    }
  }
  async pedirDeploy() {
    await this.hook('UserPromptSubmit');
    this.claude('Os testes passaram. Para publicar preciso rodar o comando de deploy.', [{ name: 'Bash', input: { command: 'npm run deploy -- --env producao', description: 'Publica a versão nova em produção' } }]);
    await this.hook('PreToolUse', { tool_name: 'Bash', tool_summary: 'Publica a versão nova em produção' });
    this.pedir('Bash', 'Publica a versão nova em produção', '{"command":"npm run deploy -- --env producao"}');
  }
}

const loja = new Sessao('conta1', 'loja-api', 'C:\\projetos\\loja-api', 'Sonnet');
const site = new Sessao('conta1', 'site-novo', 'C:\\projetos\\site-novo', 'Opus');
const app = new Sessao('conta2', 'app-entregas', 'C:\\projetos\\app-entregas', 'Sonnet');
const blog = new Sessao('conta3', 'blog', 'C:\\projetos\\blog', 'Haiku');
await sleep(600);

// conta 1: duas sessoes trabalhando, uma delas com lista de tarefas
for (const s of [loja, site, app, blog]) await s.hook('SessionStart', { source: 'startup' });
loja.usuario('Os testes de pagamento estão falhando desde ontem. Descubra o motivo e corrija.');
loja.claude('Vou rodar a suíte de pagamentos para ver o erro exato.', [
  { name: 'TodoWrite', input: { todos: [
    { content: 'Reproduzir a falha', status: 'completed' },
    { content: 'Achar a causa no cálculo do frete', status: 'completed' },
    { content: 'Corrigir o arredondamento', status: 'in_progress' },
    { content: 'Rodar a suíte completa', status: 'pending' },
    { content: 'Abrir o pull request', status: 'pending' },
  ] } },
]);
loja.claude('A falha vem do arredondamento do frete:\n```\nesperado 12.35\nrecebido 12.34\n```\nVou ajustar a função `calcularFrete`.', [{ name: 'Edit', input: { file_path: 'C:\\projetos\\loja-api\\src\\frete.js' } }]);
site.usuario('Troque o cabeçalho pelo layout novo do Figma.');
site.claude('Certo. Começando pelo componente do cabeçalho.', [{ name: 'Read', input: { file_path: 'C:\\projetos\\site-novo\\src\\Header.tsx' } }]);
blog.usuario('Revise o texto do post sobre o lançamento.');
blog.claude('Revisei o post e deixei três sugestões de corte no primeiro parágrafo.');
for (const s of [loja, site, app, blog]) await s.status();
await loja.hook('UserPromptSubmit');
await site.hook('UserPromptSubmit');
await blog.hook('Stop', { last_assistant_message: 'Revisei o post e deixei três sugestões de corte no primeiro parágrafo.' });
app.usuario('Rode os testes e publique se estiver tudo certo.');
await app.pedirDeploy();

console.log(`\n[demo] Tres contas de mentira ligadas. A Conta 3 reinicia o limite em pouco mais de um minuto.\n`);

const passos = [
  ['Bash', 'Roda os testes de pagamento'],
  ['Edit', 'frete.js'],
  ['Grep', 'calcularFrete'],
  ['Read', 'pedido.test.js'],
  ['Bash', 'Confere o formato do código'],
];
let i = 0;
setInterval(async () => {
  const [tool, resumo] = passos[i++ % passos.length];
  await loja.hook('PreToolUse', { tool_name: tool, tool_summary: resumo });
  await site.hook('PreToolUse', { tool_name: 'Edit', tool_summary: i % 2 ? 'Header.tsx' : 'header.css' });
  if (i % 3 === 0) {
    loja.claude('', [{ name: tool, input: { description: resumo, file_path: resumo, pattern: resumo } }]);
    await loja.status();
  }
}, 4000);
