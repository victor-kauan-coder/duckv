#!/usr/bin/env node
// Linha de status do Claude Code. Alem de mostrar o uso no terminal, repassa
// ao painel os numeros que o Claude Code entrega: limites, contexto e custo.
import { ident, post, readStdin } from './common.mjs';

let d = {};
try {
  d = JSON.parse(await readStdin());
} catch {
  /* sem dados: mostra uma linha simples */
}

const cw = d.context_window || {};
const rl = d.rate_limits || null;
const pct = (v) => (typeof v === 'number' ? `${Math.round(v)}%` : null);

const parts = [process.env.PAINEL_ACCOUNT_NAME || process.env.PAINEL_ACCOUNT || 'Claude'];
if (d.model?.display_name) parts.push(d.model.display_name);
const five = pct(rl?.five_hour?.used_percentage);
const week = pct(rl?.seven_day?.used_percentage);
const ctx = pct(cw.used_percentage);
if (five) parts.push(`5h ${five}`);
if (week) parts.push(`semana ${week}`);
if (ctx) parts.push(`contexto ${ctx}`);
// Escreve a linha e espera ela sair antes de falar com o painel.
await new Promise((done) => process.stdout.write(`${parts.join(' | ')}\n`, done));

await post(
  '/ingest/status',
  {
  ...ident(),
  data: {
    session_id: d.session_id,
    session_name: d.session_name,
    cwd: d.workspace?.current_dir || d.cwd,
    model: d.model?.display_name || d.model?.id,
    effort: d.effort?.level,
    transcript_path: d.transcript_path,
    ctx:
      typeof cw.context_window_size === 'number'
        ? {
            pct: typeof cw.used_percentage === 'number' ? cw.used_percentage : null,
            in: cw.total_input_tokens || 0,
            out: cw.total_output_tokens || 0,
            size: cw.context_window_size,
          }
        : null,
    cost: d.cost?.total_cost_usd,
    lines: d.cost ? { add: d.cost.total_lines_added || 0, rem: d.cost.total_lines_removed || 0 } : null,
    rate_limits: rl
      ? {
          five_hour: rl.five_hour || null,
          seven_day: rl.seven_day || null,
        }
      : null,
    },
  },
  600,
);
process.exit(0);
