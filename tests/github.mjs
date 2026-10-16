// Login no GitHub pelo duckV: o codigo de dispositivo do gh, o fim do login, cancelar e sair.
// Tudo com um gh de mentira: nada aqui fala com o GitHub nem mexe no login de verdade.
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { criarGithub, lerCodigo } = await import(pathToFileURL(path.join(ROOT, 'hub/github.mjs')).href);
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// --- leitura do codigo
const c = lerCodigo('\n! First copy your one-time code: ab12-CD34\nOpen this URL to continue in your web browser: https://github.com/login/device\n');
ok(c?.codigo === 'AB12-CD34' && c.url === 'https://github.com/login/device', 'le o codigo de 8 letras e o endereco do GitHub');
ok(lerCodigo('outra coisa') === null, 'sem codigo na saida, nada inventado');
ok(lerCodigo('one-time code: ABCD-1234 Open this URL: https://evil.example/login/device').url === 'https://github.com/login/device', 'endereco que nao e do GitHub nao vai para a tela');

// --- um gh de mentira
function ghFalso() {
  const chamadas = [];
  let logado = 'eu-mesmo';
  const proc = { atual: null };
  const rodar = async (bin, args) => {
    chamadas.push(args.join(' '));
    if (args[0] === 'api') return logado ? { err: null, out: `${logado}\n`, erro: '' } : { err: new Error('401'), out: '', erro: 'HTTP 401' };
    if (args[0] === 'auth' && args[1] === 'logout') { logado = null; return { err: null, out: '', erro: '' }; }
    return { err: null, out: '', erro: '' };
  };
  const gerar = (bin, args, opts) => {
    chamadas.push(`spawn ${args.join(' ')} navegador=${opts.env.GH_BROWSER}`);
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.stdin = { write: () => {} };
    p.kill = () => setImmediate(() => p.emit('close', null));
    proc.atual = p;
    setImmediate(() => p.stderr.emit('data', '! First copy your one-time code: WXYZ-5678\nOpen this URL to continue in your web browser: https://github.com/login/device\n'));
    return p;
  };
  return { rodar, gerar, chamadas, proc, logar: (l) => (logado = l) };
}

const f = ghFalso();
let mudancas = 0;
const gh = criarGithub({ rodar: f.rodar, gerar: f.gerar, aoMudar: () => mudancas++ });
await gh.atualizar();
ok(gh.publico().login === 'eu-mesmo' && gh.publico().instalado === true, 'mostra quem esta logado no gh');
f.logar(null);
await gh.atualizar();
ok(gh.publico().login === null, 'sem login no gh, sem nome');

gh.entrar();
await espera(20);
const e = gh.publico().entrando;
ok(e?.codigo === 'WXYZ-5678' && e.url === 'https://github.com/login/device' && e.ate > Date.now(), 'entrar mostra o codigo e por quanto tempo vale');
ok(f.chamadas.some((x) => x.startsWith('spawn auth login --hostname github.com') && x.includes('--web') && x.includes('navegador=duckv-sem-navegador')), 'o gh nao abre navegador no computador: o app mostra o endereco');
gh.entrar();
await espera(10);
ok(f.chamadas.filter((x) => x.startsWith('spawn')).length === 1, 'tocar em entrar de novo nao abre um segundo login');

// a pessoa autorizou no GitHub: o gh termina com sucesso
f.logar('eu-mesmo');
f.proc.atual.emit('close', 0);
await espera(20);
ok(gh.publico().entrando === null && gh.publico().login === 'eu-mesmo', 'autorizado: o codigo some e aparece a conta');
ok(mudancas > 3, 'cada passo avisa os apps');
ok(!JSON.stringify(gh.publico()).match(/gho_|token/i), 'o estado publico nunca leva token');

// cancelar no meio
f.logar(null);
await gh.atualizar();
gh.entrar();
await espera(20);
gh.cancelar();
await espera(20);
ok(gh.publico().entrando === null && !gh.publico().erro, 'cancelar fecha o login sem mostrar erro');

// sair
f.logar('eu-mesmo');
await gh.atualizar();
await gh.sair();
ok(gh.publico().login === null && f.chamadas.includes('auth logout --hostname github.com --user eu-mesmo'), 'sair desloga so a conta mostrada');

// sem o gh instalado
const semGh = criarGithub({ rodar: async () => ({ err: Object.assign(new Error('x'), { code: 'ENOENT' }), out: '', erro: '' }) });
await semGh.atualizar();
ok(semGh.publico().instalado === false, 'sem gh no computador, o app sabe e explica');
