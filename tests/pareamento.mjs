// Pareamento com confirmacao no computador: o codigo do QR sozinho nao basta, e ele troca depois de usado.
// Usa uma pasta temporaria: nao toca nas suas contas nem nos dados do claudeV.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'claudev-teste-'));
fs.writeFileSync(path.join(TMP, 'contas.json'), JSON.stringify([{ id: 'conta1', nome: 'Conta 1', cor: '#ff7a1a', dir: path.join(TMP, 'c1') }]));
const PORT = '18767';
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const env = { ...process.env, PAINEL_DATA: TMP, PAINEL_CONTAS: path.join(TMP, 'contas.json'), PAINEL_PORT: PORT };
delete env.PAINEL_CODIGO;

const hub = spawn(process.execPath, [path.join(ROOT, 'hub/server.mjs'), '--sem-qr'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
let saida = '';
hub.stdout.on('data', (d) => (saida += d));
await sleep(6500);
const codigo = () => [...saida.matchAll(/parear\?k=([\w-]+)/g)].at(-1)?.[1];
const parear = (k) => fetch(`${base}/api/parear`, { method: 'POST', body: JSON.stringify({ k, nome: 'Celular de teste' }) });
const esperar = async (espera) => (await fetch(`${base}/api/parear/espera`, { method: 'POST', body: JSON.stringify({ espera }) })).json();

try {
  const k1 = codigo();
  ok(!!k1, 'a janela mostra o link de pareamento');

  // 1) codigo certo abre um pedido, sem chave ainda
  let r = await parear(k1);
  const p1 = await r.json();
  ok(r.status === 202 && !p1.chave && /^\d{4}$/.test(p1.sas), 'codigo certo so abre um pedido com 4 numeros, sem chave');
  ok(!saida.includes(p1.sas), 'os 4 numeros ficam so no celular, nao na janela do computador');

  // 2) recusar no computador nega o aparelho
  hub.stdin.write('n\n');
  const neg = await esperar(p1.espera);
  ok(neg.estado === 'negado' && !neg.chave, 'recusar no computador nega o aparelho');

  // 3) dois pedidos abertos: os numeros de um so liberam aquele, e "s" nao libera nada
  const intruso = await (await parear(k1)).json();
  const p2 = await (await parear(k1)).json();
  hub.stdin.write('s\n');
  hub.stdin.write(`${p2.sas === '0000' ? '1111' : '0000'}\n`);
  await sleep(300);
  hub.stdin.write(`${p2.sas}\n`);
  const lib = await esperar(p2.espera);
  ok(lib.estado === 'ok' && lib.chave?.length >= 16, 'digitar os numeros do celular libera aquele aparelho');
  const outro = await esperar(intruso.espera);
  ok(intruso.sas === p2.sas || (outro.estado === 'negado' && !outro.chave), 'o outro pedido aberto com o mesmo codigo e recusado');
  ok((await fetch(`${base}/api/state`, { headers: { cookie: `painel=${lib.chave}` } })).status === 200, 'a chave entregue abre o app');
  ok(!(await esperar(p2.espera)).chave, 'a chave nao sai de novo pelo mesmo pedido');

  // 4) o codigo usado deixa de valer e a janela mostra um novo
  ok((await parear(k1)).status === 403, 'o codigo do QR deixa de valer depois de usado');
  ok(codigo() && codigo() !== k1, 'a janela mostra um codigo novo');

  // 5) pedido sem resposta nao vira chave
  ok((await esperar('inventado')).estado === 'expirado', 'pedido inexistente nao vira chave');
} finally {
  hub.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
}
