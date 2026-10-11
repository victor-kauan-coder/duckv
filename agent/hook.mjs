#!/usr/bin/env node
// Chamado pelo Claude Code a cada evento da sessao (inicio, ferramenta, fim da
// vez...). Quase sempre so avisa o painel e sai.
//
// Unica excecao: nas sessoes abertas pelo celular (PAINEL_HOSTED=1), o pedido
// de permissao espera a resposta dada no app e a devolve ao Claude Code.
import { ident, post, readStdin, hubConfig } from './common.mjs';
import { toolSummary } from '../hub/transcript.mjs';

let ev = null;
try {
  ev = JSON.parse(await readStdin());
} catch {
  process.exit(0);
}
if (!ev || typeof ev !== 'object' || !ev.hook_event_name) process.exit(0);

const clip = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const resumo = ev.tool_name ? toolSummary(ev.tool_name, ev.tool_input) : undefined;

if (ev.hook_event_name === 'PermissionRequest' && process.env.PAINEL_HOSTED === '1') {
  const cfg = hubConfig();
  let behavior = null;
  let recado = '';
  if (cfg) {
    let previa = '';
    try {
      previa = JSON.stringify(ev.tool_input ?? {}, null, 1);
    } catch {
      /* entrada nao serializavel: segue sem previa */
    }
    try {
      const r = await fetch(`http://127.0.0.1:${process.env.PAINEL_PORT || cfg.port}/ingest/permission`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-painel-secret': cfg.agentSecret },
        body: JSON.stringify({
          ...ident(),
          event: { tool_name: ev.tool_name, tool_use_id: ev.tool_use_id, tool_summary: resumo, tool_preview: clip(previa, 4000) },
        }),
        signal: AbortSignal.timeout(29 * 60 * 1000),
      });
      if (r.ok) {
        const resposta = await r.json();
        behavior = resposta.behavior;
        recado = typeof resposta.message === 'string' ? resposta.message : '';
      }
    } catch {
      /* painel fora do ar ou tempo esgotado: sem decisao */
    }
  }
  if (behavior === 'allow' || behavior === 'deny') {
    const decision = behavior === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: recado ? `Recusado pelo usuario no celular, com este recado: ${recado}` : 'Recusado pelo usuario no aplicativo do celular.' };
    await new Promise((done) =>
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }), done),
    );
  }
  // Sem decisao, nao escreve nada: o Claude Code mostra o pedido no proprio terminal.
  process.exit(0);
}

await post('/ingest/hook', {
  ...ident(),
  event: {
    hook_event_name: ev.hook_event_name,
    session_id: ev.session_id,
    transcript_path: ev.transcript_path,
    cwd: ev.cwd,
    permission_mode: ev.permission_mode,
    agent_id: ev.agent_id,
    source: ev.source,
    model: ev.model,
    session_title: ev.session_title,
    tool_name: ev.tool_name,
    tool_use_id: ev.tool_use_id,
    tool_summary: resumo,
    notification_type: ev.notification_type,
    message: clip(ev.message, 400),
    last_assistant_message: clip(ev.last_assistant_message, 600),
    error: clip(typeof ev.error === 'string' ? ev.error : undefined, 300),
    error_message: clip(ev.error_message, 300),
  },
});
process.exit(0);
