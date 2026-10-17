// Cada pato no seu worktree: quando a pasta da equipe e um repositorio git, cada conta ganha uma copia
// propria da pasta (um `git worktree`) num branch so dela, em vez de todas mexerem nos mesmos arquivos.
//
// O branch e `duckv/<equipe>-<conta>`, tirado do HEAD de agora, e a copia fica em
// `<repo>/.duckv/worktrees/<equipe>-<conta>`. O arquivo da divisao continua na pasta principal: e la
// que os patos combinam quem faz o que, e e para la que os branches voltam depois, um `git merge` por vez.
//
// Tudo aqui roda `git` por `execFile`, nunca por shell: nome de pasta com espaco, `&` ou `;` e so um
// argumento. Nenhuma falha derruba a equipe: a conta que nao conseguiu o worktree trabalha na pasta
// principal, como antes, e o motivo volta junto.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEMPO = 30_000;
// `.duckv/worktrees/` entra no .git/info/exclude do repositorio: as copias nao aparecem como
// arquivos novos do projeto, e o .gitignore da pessoa fica como ela escreveu.
export const PASTA_WORKTREES = '.duckv/worktrees';
const LINHA_EXCLUDE = `${PASTA_WORKTREES}/`;

const primeiraLinha = (t) =>
  String(t || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean) || '';

/** Roda o git numa pasta. Devolve sempre `{ ok, saida, erro }`, nunca lanca. */
export function git(cwd, args, { tempo = TEMPO } = {}) {
  return new Promise((pronto) =>
    execFile('git', args, { cwd, timeout: tempo, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out, erro) =>
      pronto({ ok: !err, saida: String(out || ''), erro: primeiraLinha(erro) || primeiraLinha(err?.message) }),
    ),
  );
}

const pastaReal = (dir) => {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
};

/** A raiz do repositorio git que contem a pasta, ou null quando ela nao esta num repositorio. */
export async function raizDoRepo(cwd) {
  const r = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!r.ok) return null;
  const raiz = r.saida.trim();
  return raiz ? pastaReal(raiz) : null;
}

/** O branch de um pato: `duckv/<equipe>-<conta>`. */
export const nomeDoBranch = (equipe, conta) => `duckv/${equipe}-${conta}`;
/** A pasta do pato dentro do repositorio: `<repo>/.duckv/worktrees/<equipe>-<conta>`. */
export const pastaDoWorktree = (raiz, equipe, conta) => path.join(raiz, ...PASTA_WORKTREES.split('/'), `${equipe}-${conta}`);

/**
 * Acrescenta `.duckv/worktrees/` ao `.git/info/exclude` do repositorio, uma vez. O `.gitignore` da
 * pessoa nao e tocado: o exclude e a lista local, que nao vai para nenhum commit.
 */
export async function excluirDoGit(cwd) {
  const r = await git(cwd, ['rev-parse', '--git-common-dir']);
  if (!r.ok) return { escrito: false, erro: r.erro };
  const gitDir = path.resolve(cwd, r.saida.trim());
  const arquivo = path.join(gitDir, 'info', 'exclude');
  try {
    const antes = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
    if (antes.split('\n').some((l) => l.trim() === LINHA_EXCLUDE)) return { escrito: false, arquivo };
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    const emenda = `${antes && !antes.endsWith('\n') ? '\n' : ''}# pastas das equipes do duckV\n${LINHA_EXCLUDE}\n`;
    fs.appendFileSync(arquivo, emenda);
    return { escrito: true, arquivo };
  } catch (e) {
    return { escrito: false, erro: e.message };
  }
}

/**
 * Prepara os worktrees de uma equipe. `contas` vem na ordem dos patos.
 * Devolve `{ isolado, motivo, raiz, base, patos: [{ conta, branch, dir, erro }] }`: `isolado` e falso
 * quando a pasta nao e um repositorio (ou nao tem nenhum commit), e ai todos ficam na pasta principal.
 */
export async function prepararWorktrees(cwd, { equipe, contas }) {
  const raiz = await raizDoRepo(cwd);
  if (!raiz) return { isolado: false, motivo: 'nao-git', raiz: null, base: null, patos: [] };
  const cabeca = await git(raiz, ['rev-parse', 'HEAD']);
  if (!cabeca.ok) return { isolado: false, motivo: 'sem-commits', raiz, base: null, patos: [] };
  const base = cabeca.saida.trim();
  const exclude = await excluirDoGit(raiz);
  const patos = [];
  for (const conta of contas) {
    const branch = nomeDoBranch(equipe, conta);
    const dir = pastaDoWorktree(raiz, equipe, conta);
    const r = await git(raiz, ['worktree', 'add', '-b', branch, dir, base]);
    if (!r.ok) patos.push({ conta, branch, dir, erro: `Não consegui criar a pasta desta conta: ${r.erro}` });
    else patos.push({ conta, branch, dir: pastaReal(dir) });
  }
  return { isolado: patos.some((p) => !p.erro), motivo: patos.some((p) => !p.erro) ? null : 'erro', raiz, base, patos, exclude };
}

// ---------------------------------------------------------------- as equipes abertas

// O que cada equipe aberta deixou no repositorio, para comparar, juntar e limpar depois.
const abertas = new Map();

/** Guarda uma equipe (isolada ou nao) para as mensagens de comparar, juntar e limpar. */
export function guardarEquipe(info) {
  abertas.set(info.id, { ...info, criada: info.criada || Date.now() });
  return abertas.get(info.id);
}
export const equipeGuardada = (id) => abertas.get(String(id || '')) || null;
export const equipesGuardadas = () => [...abertas.values()];
export const esquecerEquipe = (id) => abertas.delete(String(id || ''));

// ---------------------------------------------------------------- comparar

const numero = (t) => (/^\d+$/.test(String(t || '').trim()) ? Number(String(t).trim()) : 0);

/** Soma do `git diff --numstat` entre dois pontos, com a lista de arquivos (para a tela de comparacao). */
async function diferenca(raiz, de, para) {
  const r = await git(raiz, ['diff', '--numstat', '-M', de, para]);
  if (!r.ok) return { mais: 0, menos: 0, arquivos: [], erro: r.erro };
  const arquivos = [];
  let mais = 0;
  let menos = 0;
  for (const linha of r.saida.split('\n')) {
    if (!linha.trim()) continue;
    const [a, b, ...resto] = linha.split('\t');
    const caminho = resto.join('\t');
    if (!caminho) continue;
    // arquivo binario vem como "-\t-": conta como arquivo mexido, sem linhas
    const m = numero(a);
    const n = numero(b);
    mais += m;
    menos += n;
    arquivos.push({ caminho, mais: m, menos: n, binario: a === '-' || b === '-' });
  }
  arquivos.sort((x, y) => y.mais + y.menos - (x.mais + x.menos) || x.caminho.localeCompare(y.caminho));
  return { mais, menos, arquivos };
}

/** Quantos arquivos o pato mexeu e ainda nao commitou na pasta dele. */
async function pendentesEm(dir) {
  const r = await git(dir, ['status', '--porcelain']);
  if (!r.ok) return 0;
  return r.saida.split('\n').filter((l) => l.trim()).length;
}

/**
 * Como esta cada pato: o branch, os commits a frente da base e as linhas somadas e tiradas.
 * `arquivos` leva a lista de cada um, que a tela de comparacao mostra lado a lado.
 */
export async function resultadoDaEquipe(id) {
  const eq = equipeGuardada(id);
  if (!eq) return { err: 'Essa equipe não foi encontrada. Ela existe enquanto o duckV estiver ligado.' };
  if (!eq.isolado) return { equipe: eq.id, isolado: false, motivo: eq.motivo, raiz: eq.raiz || null, principal: eq.cwd, patos: [] };
  const patos = [];
  for (const p of eq.patos) {
    if (p.erro) {
      patos.push({ conta: p.conta, branch: p.branch, dir: p.dir, erro: p.erro });
      continue;
    }
    const contagem = await git(eq.raiz, ['rev-list', '--count', `${eq.base}..${p.branch}`]);
    const d = await diferenca(eq.raiz, eq.base, p.branch);
    patos.push({
      conta: p.conta,
      branch: p.branch,
      dir: p.dir,
      commits: numero(contagem.saida),
      mais: d.mais,
      menos: d.menos,
      arquivos: d.arquivos,
      pendentes: await pendentesEm(p.dir),
      juntado: p.juntado || null,
      erro: contagem.ok ? d.erro || null : contagem.erro,
    });
  }
  const limpa = await git(eq.raiz, ['status', '--porcelain']);
  return {
    equipe: eq.id,
    isolado: true,
    raiz: eq.raiz,
    principal: eq.cwd,
    base: eq.base,
    // a pasta principal precisa estar sem mudancas penduradas para receber um merge
    principalLimpa: limpa.ok && !limpa.saida.trim(),
    patos,
  };
}

// ---------------------------------------------------------------- juntar

/**
 * Traz o branch de um pato para a pasta principal com `git merge --no-ff`. Recusa, explicando, quando a
 * pasta principal tem mudancas nao commitadas; num conflito, desfaz o merge e diz quais arquivos brigaram.
 */
export async function juntarPato(id, conta, { nome } = {}) {
  const eq = equipeGuardada(id);
  if (!eq) return { err: 'Essa equipe não foi encontrada. Ela existe enquanto o duckV estiver ligado.' };
  if (!eq.isolado) return { err: 'Esta equipe não tem branches: todas as contas trabalharam na mesma pasta.' };
  const pato = eq.patos.find((p) => p.conta === String(conta));
  if (!pato) return { err: 'Essa conta não está nesta equipe.' };
  if (pato.erro) return { err: `Esta conta não tem branch: ${pato.erro}` };
  const quem = nome || pato.conta;
  const sujo = await git(eq.raiz, ['status', '--porcelain']);
  if (!sujo.ok) return { err: `Não consegui ler a pasta principal: ${sujo.erro}` };
  if (sujo.saida.trim()) {
    const quantos = sujo.saida.split('\n').filter((l) => l.trim()).length;
    return {
      err: `A pasta principal tem ${quantos} ${quantos === 1 ? 'arquivo' : 'arquivos'} com mudanças não commitadas. Faça um commit (ou guarde as mudanças) antes de juntar o branch de ${quem}.`,
    };
  }
  const contagem = await git(eq.raiz, ['rev-list', '--count', `${eq.base}..${pato.branch}`]);
  if (contagem.ok && numero(contagem.saida) === 0) {
    return { err: `${quem} ainda não commitou nada no branch ${pato.branch}. Não há o que juntar.` };
  }
  const merge = await git(eq.raiz, ['merge', '--no-ff', '-m', `duckV: junta ${quem} (${pato.branch})`, pato.branch]);
  if (!merge.ok) {
    const brigaram = await git(eq.raiz, ['diff', '--name-only', '--diff-filter=U']);
    const arquivos = brigaram.saida.split('\n').filter((l) => l.trim());
    if (arquivos.length) {
      await git(eq.raiz, ['merge', '--abort']);
      return {
        err: `O merge de ${quem} deu conflito em ${arquivos.length} ${arquivos.length === 1 ? 'arquivo' : 'arquivos'} (${arquivos.slice(0, 3).join(', ')}${arquivos.length > 3 ? ' e outros' : ''}). Desfiz o merge: a pasta principal está como estava. Junte este branch à mão, no terminal.`,
        conflitos: arquivos,
      };
    }
    return { err: `Não consegui juntar o branch de ${quem}: ${merge.erro}` };
  }
  pato.juntado = Date.now();
  const sha = await git(eq.raiz, ['rev-parse', 'HEAD']);
  return { equipe: eq.id, conta: pato.conta, branch: pato.branch, commit: sha.saida.trim().slice(0, 8) };
}

// ---------------------------------------------------------------- limpar

/** Tira os worktrees e os branches da equipe. O que foi juntado ja esta na pasta principal. */
export async function limparEquipe(id) {
  const eq = equipeGuardada(id);
  if (!eq) return { err: 'Essa equipe não foi encontrada. Ela existe enquanto o duckV estiver ligado.' };
  if (!eq.isolado) return { err: 'Esta equipe não tem pastas nem branches para tirar.' };
  const tirados = [];
  const falhas = [];
  for (const p of eq.patos) {
    if (p.erro) continue;
    const w = await git(eq.raiz, ['worktree', 'remove', '--force', p.dir]);
    if (!w.ok && fs.existsSync(p.dir)) {
      falhas.push({ conta: p.conta, branch: p.branch, erro: `Não consegui tirar a pasta de ${p.conta}: ${w.erro}` });
      continue;
    }
    const b = await git(eq.raiz, ['branch', '-D', p.branch]);
    if (!b.ok) falhas.push({ conta: p.conta, branch: p.branch, erro: `A pasta saiu, mas o branch ${p.branch} ficou: ${b.erro}` });
    else tirados.push({ conta: p.conta, branch: p.branch });
  }
  await git(eq.raiz, ['worktree', 'prune']);
  // a pasta .duckv/worktrees sai quando ficar vazia; o arquivo da divisao fica onde esta
  const caixa = path.join(eq.raiz, ...PASTA_WORKTREES.split('/'));
  try {
    if (fs.existsSync(caixa) && !fs.readdirSync(caixa).length) fs.rmdirSync(caixa);
  } catch {
    /* a pasta fica; e so uma pasta vazia */
  }
  if (!falhas.length) esquecerEquipe(eq.id);
  return { equipe: eq.id, tirados, falhas: falhas.length ? falhas : null };
}

/** Por que esta equipe nao foi isolada, em uma frase para a tela. */
export const motivoEmTexto = (motivo) =>
  motivo === 'nao-git'
    ? 'Esta pasta não é um repositório git, então as contas trabalham todas nela, nos mesmos arquivos.'
    : motivo === 'sem-commits'
      ? 'Este repositório ainda não tem nenhum commit, então as contas trabalham todas na mesma pasta. Faça o primeiro commit para cada conta ganhar o seu branch.'
      : motivo === 'desligado'
        ? 'Você escolheu deixar todas as contas na mesma pasta.'
        : 'As contas trabalham todas na mesma pasta.';
