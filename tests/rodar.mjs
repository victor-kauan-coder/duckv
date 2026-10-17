// Roda todas as baterias de teste, uma de cada vez, mesmo se uma falhar, e mostra o resumo no fim.
//   node tests/rodar.mjs              todas
//   node tests/rodar.mjs seguranca    so as que tem esse nome
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
// Da mais rapida para a mais lenta; cada uma usa uma porta propria, entao nao se atrapalham.
const SUITES = ['unidade', 'portabilidade', 'previas', 'nuvem', 'github', 'servidor', 'pareamento', 'sessoes', 'equipe', 'seguranca', 'desktop', 'rapido', 'retomar', 'servico', 'diff'];
const LIMITE = 5 * 60_000;
const filtro = process.argv.slice(2);
const escolhidas = filtro.length ? SUITES.filter((s) => filtro.some((f) => s.includes(f))) : SUITES;

const resultados = [];
for (const s of escolhidas) {
  const t0 = Date.now();
  console.log(`\n=== ${s} ===`);
  const r = await new Promise((resolve) => {
    let passou = 0, falhou = 0, resto = '';
    const p = spawn(process.execPath, [path.join(AQUI, `${s}.mjs`)], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => {
      process.stdout.write(d);
      const linhas = (resto + d).split('\n');
      resto = linhas.pop();
      for (const l of linhas) {
        if (l.startsWith('PASS')) passou++;
        else if (l.startsWith('FAIL')) falhou++;
      }
    });
    const prazo = setTimeout(() => {
      console.log(`\n[${s}] passou de ${LIMITE / 60000} minutos: interrompido.`);
      p.kill();
    }, LIMITE);
    p.on('close', (code) => {
      clearTimeout(prazo);
      resolve({ s, passou, falhou, code, ms: Date.now() - t0 });
    });
  });
  resultados.push(r);
}

console.log('\n================ resumo ================');
let total = 0, falhas = 0;
for (const r of resultados) {
  const ok = r.code === 0 && r.falhou === 0;
  total += r.passou + r.falhou;
  falhas += r.falhou + (ok || r.falhou ? 0 : 1);
  console.log(`${ok ? 'ok   ' : 'FALHA'}  ${r.s.padEnd(14)} ${String(r.passou).padStart(3)} passaram  ${String(r.falhou).padStart(2)} falharam  ${(r.ms / 1000).toFixed(1).padStart(6)} s`);
}
console.log(`\n${total} verificacoes em ${process.platform} (Node ${process.versions.node}): ${falhas ? `${falhas} com problema` : 'todas certas'}.`);
process.exit(falhas ? 1 : 0);
