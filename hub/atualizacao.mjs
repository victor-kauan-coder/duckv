// Atualizacao do app do celular. O repositorio e privado, entao o celular nao consulta o GitHub:
// o computador (que ja tem o gh logado) olha a ultima versao publicada, baixa o APK, confere o
// SHA-256 que o GitHub publica e entrega ao celular pela mesma ligacao pareada dos arquivos.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const SEIS_HORAS = 6 * 60 * 60 * 1000;
const executar = (bin, args, opts = {}) =>
  new Promise((resolve, reject) =>
    execFile(bin, args, { timeout: 120_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim().split('\n')[0])) : resolve(stdout),
    ),
  );
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

export function criarAtualizacao({ raiz, dados, aoMudar, automatico = true }) {
  const pasta = path.join(dados, 'atualizacao');
  let repo = null;
  let atual = null; // { versao, titulo, notas, publicada, tamanho, sha256, caminho }
  let erro = null;
  let verificadaEm = 0;
  let rodando = null;

  // owner/repo do remoto do git da pasta do duckV (https ou ssh)
  async function descobrirRepo() {
    if (repo) return repo;
    const url = (await executar('git', ['config', '--get', 'remote.origin.url'], { cwd: raiz })).trim();
    const m = /github\.com[:/]([^/]+\/[^/.]+?)(\.git)?$/.exec(url);
    if (!m) throw new Error('A pasta do duckV não veio do GitHub.');
    return (repo = m[1]);
  }

  // Com o gh logado funciona mesmo com o repositorio privado; sem ele, so se o repositorio for publico.
  async function ultimaVersao(r) {
    try {
      return JSON.parse(await executar('gh', ['api', `repos/${r}/releases/latest`]));
    } catch (e) {
      const res = await fetch(`https://api.github.com/repos/${r}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } }).catch(() => null);
      if (res?.ok) return res.json();
      throw new Error(/not found|404/i.test(e.message) ? 'Nenhuma versão publicada no GitHub.' : 'Não consegui ver as versões no GitHub. O gh está instalado e logado neste computador?');
    }
  }

  async function baixar(r, rel, apk, destino) {
    const tmp = `${destino}.parcial`;
    fs.rmSync(tmp, { force: true });
    try {
      await executar('gh', ['release', 'download', rel.tag_name, '-R', r, '-p', apk.name, '-O', tmp, '--clobber'], { timeout: 600_000 });
    } catch {
      const res = await fetch(apk.browser_download_url);
      if (!res.ok) throw new Error('Não consegui baixar o APK da versão nova.');
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    }
    const esperado = String(apk.digest || '').replace(/^sha256:/, '');
    const obtido = sha256(tmp);
    if (esperado && esperado !== obtido) {
      fs.rmSync(tmp, { force: true });
      throw new Error('O APK baixado não confere com o publicado no GitHub. Tento de novo mais tarde.');
    }
    fs.renameSync(tmp, destino);
    return obtido;
  }

  async function verificar() {
    const r = await descobrirRepo();
    const rel = await ultimaVersao(r);
    const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
    const versao = String(rel.tag_name || '').replace(/^v/i, '');
    if (!apk || !/^\d+(\.\d+)*$/.test(versao)) throw new Error('A última versão do GitHub não tem APK.');
    if (atual?.versao === versao && fs.existsSync(atual.caminho)) return;
    fs.mkdirSync(pasta, { recursive: true });
    const caminho = path.join(pasta, `duckV-${versao}.apk`);
    const hash = fs.existsSync(caminho) && apk.digest && sha256(caminho) === apk.digest.replace(/^sha256:/, '') ? apk.digest.replace(/^sha256:/, '') : await baixar(r, rel, apk, caminho);
    // so a versao mais nova fica guardada
    for (const f of fs.readdirSync(pasta)) if (f !== path.basename(caminho)) fs.rmSync(path.join(pasta, f), { force: true });
    atual = {
      versao,
      titulo: rel.name || `duckV ${versao}`,
      notas: String(rel.body || '').slice(0, 4000),
      publicada: Date.parse(rel.published_at) || Date.now(),
      tamanho: fs.statSync(caminho).size,
      sha256: hash,
      caminho,
    };
  }

  /** Consulta o GitHub (no maximo uma de cada vez). `forcar` ignora o intervalo de 6 horas. */
  function procurar(forcar = false) {
    if (rodando) return rodando;
    if (!forcar && Date.now() - verificadaEm < SEIS_HORAS) return Promise.resolve();
    rodando = verificar()
      .then(() => (erro = null))
      .catch((e) => (erro = e.message))
      .finally(() => {
        verificadaEm = Date.now();
        rodando = null;
        aoMudar();
      });
    return rodando;
  }

  if (automatico) {
    setTimeout(() => procurar(true), 10_000).unref();
    setInterval(() => procurar(), 30 * 60 * 1000).unref();
  }

  return {
    procurar,
    /** O que vai para o celular no estado: so a versao pronta para instalar (sem o caminho no computador). */
    publico() {
      if (!atual) return { verificadaEm, erro };
      const { caminho, ...resto } = atual;
      return { ...resto, verificadaEm, erro };
    },
    /** Para servir o download: o arquivo pronto, ou null. */
    arquivo() {
      return atual && fs.existsSync(atual.caminho) ? { caminho: atual.caminho, nome: `duckV-${atual.versao}.apk`, tipo: 'application/vnd.android.package-archive' } : null;
    },
  };
}
