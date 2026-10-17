// O duckV no sistema em que este teste roda (Windows, Linux ou macOS): scripts com o formato certo,
// atalhos e "ligar com o computador" criados e apagados direito, e caminhos com espaco, acento e aspas.
// Os atalhos sao criados numa pasta pessoal de mentira: nada aparece na sua area de trabalho.
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const sistema = WIN ? 'Windows' : MAC ? 'macOS' : 'Linux';
console.log(`Sistema: ${sistema} (${os.release()}, ${process.arch}), Node ${process.versions.node}\n`);

// ---------------------------------------------------------------- scripts versionados
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return null;
  }
};
const SH = ['iniciar-duckv.sh', 'abrir-web.sh', 'instalar.sh', 'testar.sh', 'demonstracao.sh', 'desinstalar.sh'];
const CMD = ['iniciar-duckv.cmd', 'abrir-web.cmd', 'instalar.cmd', 'testar.cmd', 'demonstracao.cmd', 'desinstalar.cmd'];
for (const f of SH) {
  const b = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(b.startsWith('#!/bin/sh\n') && !b.includes('\r'), `${f}: comeca com #!/bin/sh e usa quebra de linha Unix`);
}
for (const f of CMD) ok(fs.existsSync(path.join(ROOT, f)), `${f} existe para o Windows`);
const modos = git(['ls-files', '-s', '--', ...SH]);
if (modos) ok(SH.every((f) => new RegExp(`^100755 .*\\s${f.replace('.', '\\.')}$`, 'm').test(modos)), 'scripts .sh marcados como executaveis no git');
const gradlew = git(['ls-files', '-s', '--', 'android/gradlew']);
if (gradlew) ok(gradlew.startsWith('100755'), 'android/gradlew executavel no git (senao o build do app falha no Linux e no macOS)');
const atributos = git(['check-attr', 'eol', '--', 'iniciar-duckv.sh', 'iniciar-duckv.cmd']);
if (atributos) ok(/iniciar-duckv\.sh: eol: lf/.test(atributos) && /iniciar-duckv\.cmd: eol: crlf/.test(atributos), '.gitattributes garante LF nos .sh e CRLF nos .cmd em qualquer sistema');
if (!WIN) {
  const r = spawnSync('sh', ['-n', ...SH.map((f) => path.join(ROOT, f))], { encoding: 'utf8' });
  ok(r.status === 0, `scripts .sh sem erro de sintaxe no sh deste ${sistema}${r.stderr ? ': ' + r.stderr : ''}`);
}

// ---------------------------------------------------------------- atalhos numa pasta pessoal de mentira
if (WIN) {
  // No Windows os atalhos .lnk vao para pastas especiais do usuario (Area de Trabalho, Inicializar);
  // aqui so conferimos que o lancador certo e escolhido, sem criar nada na sua area de trabalho.
  const { lancador } = await import(new URL('../lib/atalhos.mjs', import.meta.url));
  ok(lancador('C:\\duckv').endsWith('iniciar-duckv.cmd'), 'no Windows o atalho abre o iniciar-duckv.cmd');
} else {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-casa-'));
  // Pasta do duckV com espaco, acento, aspas e $: tudo isso precisa chegar inteiro no atalho.
  const raiz = path.join(casa, `Meus Projetos/duckV "teste" $HOME á`);
  fs.mkdirSync(path.join(raiz, 'app', 'icons'), { recursive: true });
  fs.mkdirSync(path.join(casa, 'Desktop'));
  const script = `
    const a = await import(${JSON.stringify(new URL('../lib/atalhos.mjs', import.meta.url).href)});
    const raiz = ${JSON.stringify(raiz)};
    const out = { aviso: a.criarAtalho(raiz) };
    out.antes = a.ligaComSistema();
    a.ligarComSistema(raiz);
    out.depois = a.ligaComSistema();
    out.lancador = a.lancador(raiz);
    console.log(JSON.stringify(out));`;
  const env = { ...process.env, HOME: casa, XDG_CONFIG_HOME: path.join(casa, '.config'), PATH: process.env.PATH };
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
  let out = {};
  try {
    out = JSON.parse(r.stdout.trim().split('\n').pop());
  } catch {
    console.log(r.stderr);
  }
  ok(out.lancador?.endsWith('iniciar-duckv.sh'), `no ${sistema} o atalho abre o iniciar-duckv.sh`);
  ok(out.antes === false && out.depois === true, 'ligar com o computador e detectado depois de ligado');
  if (MAC) {
    const cmd = path.join(casa, 'Desktop', 'duckV.command');
    const plist = path.join(casa, 'Library', 'LaunchAgents', 'io.github.duckv.plist');
    ok(fs.existsSync(cmd) && (fs.statSync(cmd).mode & 0o111) !== 0, 'duckV.command criado na Mesa e executavel');
    const c = fs.readFileSync(cmd, 'utf8');
    ok(spawnSync('sh', ['-n', cmd]).status === 0 && c.includes(`'${raiz.replace(/'/g, `'\\''`)}'`), 'duckV.command com a pasta entre aspas simples (espaco, aspas e $ intactos)');
    const p = fs.existsSync(plist) ? fs.readFileSync(plist, 'utf8') : '';
    ok(p.includes('<string>/usr/bin/open</string>') && p.includes('&quot;') === false && p.includes('"teste"') && !p.includes('<string>' + raiz + '</string>x'), 'LaunchAgent abre o Terminal com o lancador');
    if (spawnSync('plutil', ['-lint', plist]).status !== null) ok(spawnSync('plutil', ['-lint', plist]).status === 0, 'LaunchAgent e um plist valido (plutil)');
  } else {
    const menu = path.join(casa, '.local', 'share', 'applications', 'duckv.desktop');
    const auto = path.join(casa, '.config', 'autostart', 'duckv.desktop');
    const mesa = path.join(casa, 'Desktop', 'duckv.desktop');
    ok(fs.existsSync(menu) && fs.existsSync(mesa) && fs.existsSync(auto), 'atalhos criados no menu, na area de trabalho e na inicializacao');
    const d = fs.readFileSync(menu, 'utf8');
    // Exec com as aspas escapadas como pede a especificacao freedesktop: \" \$ \\ dentro de aspas duplas.
    ok(d.includes('Exec="') && d.includes('\\"teste\\"') && d.includes('\\$HOME') && /Terminal=true/.test(d), 'Exec do atalho com aspas e $ escapados (especificacao freedesktop)');
    if (spawnSync('desktop-file-validate', ['--version']).status === 0) {
      const v = spawnSync('desktop-file-validate', [menu, auto], { encoding: 'utf8' });
      ok(v.status === 0 && !/error/i.test(v.stdout), `desktop-file-validate aceita os atalhos${v.stdout ? ': ' + v.stdout : ''}`);
    }
    ok((fs.statSync(mesa).mode & 0o111) !== 0, 'atalho da area de trabalho executavel');
  }
  // remover apaga tudo
  const rm = spawnSync(process.execPath, ['--input-type=module', '-e', `const a = await import(${JSON.stringify(new URL('../lib/atalhos.mjs', import.meta.url).href)}); a.removerAtalhos(); console.log(a.ligaComSistema());`], { env, encoding: 'utf8' });
  const sobrou = [path.join(casa, 'Desktop', 'duckV.command'), path.join(casa, 'Desktop', 'duckv.desktop'), path.join(casa, '.local', 'share', 'applications', 'duckv.desktop'), path.join(casa, '.config', 'autostart', 'duckv.desktop'), path.join(casa, 'Library', 'LaunchAgents', 'io.github.duckv.plist')].filter((f) => fs.existsSync(f));
  ok(rm.stdout.trim() === 'false' && !sobrou.length, `desinstalar apaga todos os atalhos${sobrou.length ? ': sobrou ' + sobrou.join(', ') : ''}`);
  fs.rmSync(casa, { recursive: true, force: true });
}

// ---------------------------------------------------------------- pastas de dados por sistema
{
  const { ROOT: raiz, DATA } = await import(new URL('../lib/config.mjs', import.meta.url));
  ok(path.resolve(raiz) === ROOT && path.isAbsolute(DATA), 'pastas do duckV resolvidas a partir do proprio projeto');
}
// O terminal embutido (node-pty) tem binario pronto para este sistema e arquitetura.
// Linux com musl (Alpine) fica de fora: o binario e para glibc e derruba o processo (ver hub/hosted.mjs).
if (process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime) {
  const { hostedAvailable, hostedError } = await import(new URL('../hub/hosted.mjs', import.meta.url));
  ok(!hostedAvailable() && /musl/.test(hostedError()), 'Linux com musl: o terminal embutido fica desligado com o motivo, em vez de derrubar o duckV');
} else {
  let pty = null;
  try {
    pty = (await import('@lydell/node-pty')).default ?? (await import('@lydell/node-pty'));
  } catch (e) {
    console.log(e.message);
  }
  ok(!!pty?.spawn, `terminal embutido (node-pty) carrega em ${process.platform}-${process.arch}`);
  if (pty?.spawn) {
    const saida = await new Promise((resolve) => {
      let b = '';
      const p = pty.spawn(process.execPath, ['-e', 'process.stdout.write("pato-ok " + process.platform)'], { cols: 80, rows: 10, cwd: os.tmpdir(), env: process.env });
      p.onData((d) => (b += d));
      p.onExit(() => resolve(b));
      setTimeout(() => { try { p.kill(); } catch {} resolve(b); }, 8000);
    });
    ok(saida.includes(`pato-ok ${process.platform}`), 'um programa roda dentro do terminal embutido e a saida chega');
  }
}

// ---------------------------------------------------------------- "Terminal do sistema" no macOS
// O .command que o Terminal abre: roda aqui no sh (Git Bash no Windows) com uma pasta de nome perigoso.
{
  const { comandoMac } = await import(new URL('../lib/atalhos.mjs', import.meta.url));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duckv-mac-'));
  const pasta = path.join(base, `a b'c;$(touch PWNED)`);
  fs.mkdirSync(pasta);
  const atalho = path.join(base, 'conta1.sh');
  fs.writeFileSync(atalho, 'printf "%s|%s" "$1" "$(pwd)"\n');
  const cmd = path.join(base, 'conta1.command');
  fs.writeFileSync(cmd, comandoMac(atalho, pasta));
  const r = spawnSync('sh', [cmd], { encoding: 'utf8', cwd: base });
  const [arg] = (r.stdout || '').split('|');
  ok(r.status === 0 && arg === pasta,'macOS: o .command entrega ao atalho da conta a pasta inteira, como um argumento só');
  ok(!fs.existsSync(path.join(base, 'PWNED')) && !fs.existsSync(path.join(pasta, 'PWNED')) && !fs.existsSync('PWNED'), 'macOS: nada escondido no nome da pasta vira comando');
  fs.rmSync(base, { recursive: true, force: true });
}

console.log(process.exitCode ? '\nAlgum teste falhou.' : `\nPortabilidade (${sistema}): tudo certo.`);
