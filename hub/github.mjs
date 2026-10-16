// Login no GitHub de dentro do duckV, para escolher repositorios ao criar sessoes na nuvem.
// Quem guarda o login e o GitHub CLI (gh) do computador: o duckV so conduz o "gh auth login" pelo
// codigo de dispositivo. O app mostra o codigo de 8 letras e o endereco github.com/login/device; a
// pessoa autoriza (no celular ou no computador) e o gh grava o login no cofre do sistema. O token
// nunca passa pelo duckV nem vai para o celular.
import { spawn as spawnPadrao, execFile } from 'node:child_process';

const DISPOSITIVO = 'https://github.com/login/device';
const LIMITE = 15 * 60_000; // o codigo do GitHub vale 15 minutos

// O que o gh escreve ao comecar: "First copy your one-time code: ABCD-1234" e o endereco.
export function lerCodigo(texto) {
  const c = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(String(texto || ''));
  if (!c) return null;
  const u = /(https:\/\/github\.com\/login\/device)\b/.exec(texto);
  return { codigo: c[1].toUpperCase(), url: u ? u[1] : DISPOSITIVO };
}

const rodarPadrao = (bin, args, opts = {}) =>
  new Promise((ok) => execFile(bin, args, { windowsHide: true, timeout: 20_000, ...opts }, (err, out, erro) => ok({ err, out: String(out || ''), erro: String(erro || '') })));

export function criarGithub({ aoMudar = () => {}, rodar = rodarPadrao, gerar = spawnPadrao, demo = false } = {}) {
  let estado = { instalado: null, login: null, entrando: null, erro: null };
  let processo = null;
  const mudar = (novo) => {
    estado = { ...estado, ...novo };
    aoMudar(estado);
  };

  async function atualizar() {
    if (demo) {
      if (estado.instalado === null) mudar({ instalado: true, login: 'voce-no-github' });
      return estado;
    }
    const r = await rodar('gh', ['api', 'user', '--jq', '.login']);
    if (r.err?.code === 'ENOENT') mudar({ instalado: false, login: null });
    else mudar({ instalado: true, login: r.err ? null : r.out.trim() || null });
    return estado;
  }

  function entrar() {
    if (estado.entrando || processo) return estado;
    mudar({ erro: null });
    if (demo) {
      mudar({ entrando: { codigo: 'DUCK-2026', url: DISPOSITIVO, ate: Date.now() + LIMITE } });
      processo = setTimeout(() => {
        processo = null;
        mudar({ entrando: null, login: 'voce-no-github' });
      }, 8000);
      return estado;
    }
    let saida = '';
    // GH_BROWSER invalido: o gh nao abre navegador no computador, so mostra o endereco (que o app mostra)
    const p = gerar('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--skip-ssh-key'], {
      env: { ...process.env, GH_BROWSER: 'duckv-sem-navegador', BROWSER: 'duckv-sem-navegador' },
      windowsHide: true,
    });
    processo = p;
    const ler = (d) => {
      saida += d;
      const c = !estado.entrando && lerCodigo(saida);
      if (c) mudar({ entrando: { ...c, ate: Date.now() + LIMITE } });
      // versoes do gh que esperam um Enter antes de seguir
      if (/press enter/i.test(String(d))) p.stdin?.write('\n');
    };
    p.stdout?.on('data', ler);
    p.stderr?.on('data', ler);
    const prazo = setTimeout(() => p.kill(), LIMITE + 30_000);
    p.on('error', (e) => {
      clearTimeout(prazo);
      processo = null;
      mudar({ entrando: null, instalado: e.code === 'ENOENT' ? false : estado.instalado, erro: e.code === 'ENOENT' ? null : 'Não consegui iniciar o login do GitHub.' });
    });
    p.on('close', async (codigo) => {
      clearTimeout(prazo);
      const cancelado = processo !== p;
      processo = null;
      mudar({ entrando: null });
      if (cancelado) return;
      if (codigo !== 0) mudar({ erro: /expired|expirou|timed out/i.test(saida) ? 'O código venceu. Tente de novo.' : 'O login no GitHub não terminou.' });
      await atualizar();
    });
    return estado;
  }

  function cancelar() {
    if (demo && processo) clearTimeout(processo);
    else processo?.kill();
    processo = null;
    mudar({ entrando: null });
    return estado;
  }

  async function sair() {
    if (!estado.login) return estado;
    if (demo) return mudar({ login: null }), estado;
    const r = await rodar('gh', ['auth', 'logout', '--hostname', 'github.com', '--user', estado.login]);
    if (r.err) mudar({ erro: 'Não consegui sair do GitHub.' });
    return atualizar();
  }

  // o que os apps veem: nunca o token, so quem esta logado e o codigo em andamento
  const publico = () => ({ instalado: estado.instalado, login: estado.login, entrando: estado.entrando, erro: estado.erro });
  return { atualizar, entrar, cancelar, sair, publico };
}
