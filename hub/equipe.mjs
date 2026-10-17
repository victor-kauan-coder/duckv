// "Todas as contas": uma sessao por conta, todas na mesma pasta, dividindo uma tarefa.
// O briefing abaixo e a primeira mensagem que cada pato recebe: ele diz quem e quem e
// manda a divisao do trabalho ser combinada no arquivo da pasta, nao entre as sessoes
// (elas nao se falam). O arquivo nasce aqui, antes das sessoes abrirem, para nenhum pato
// comecar sem nada caso o pato 1 falhe. Quem monta o time e abre as sessoes e o hub/server.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const novoIdEquipe = () => `eq${crypto.randomBytes(4).toString('hex')}`;

// O arquivo onde os patos combinam a divisao, dentro da pasta do projeto.
export const arquivoDaEquipe = (id) => `.duckv/equipe-${id}.md`;

// Lista em portugues: "o pato 2 (Pessoal)" / "o pato 2 (Pessoal) e o pato 3 (Estudos)".
const juntar = (itens) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

// Primeira linha da tarefa, curta, para o titulo do arquivo.
const tituloDaTarefa = (tarefa) => {
  const linha = String(tarefa).split('\n').find((l) => l.trim()) || 'tarefa sem titulo';
  const limpa = linha.trim().replace(/\s+/g, ' ');
  return limpa.length > 80 ? `${limpa.slice(0, 79)}…` : limpa;
};

// O pato que propoe a divisao: o pato 1, ou o de menor numero que abriu quando ele nao abriu.
const quemPropoe = (abertos) => (abertos.includes(1) ? 1 : Math.min(...abertos));

// Conteudo do arquivo da equipe: a tarefa, a lista dos patos e as tres secoes vazias para preencher.
// `nomes` vem na ordem dos patos (o primeiro e o pato 1).
export function textoDoArquivo({ nomes, tarefa }) {
  return [
    `# Equipe duckV: ${tituloDaTarefa(tarefa)}`,
    '',
    'A tarefa, como ela chegou:',
    '',
    ...String(tarefa).trimEnd().split('\n').map((l) => `> ${l}`.trimEnd()),
    '',
    'Os patos desta equipe:',
    '',
    ...nomes.map((n, i) => `- pato ${i + 1}: ${n}`),
    '',
    'Este arquivo é o único lugar onde os patos se falam: o pato 1 propõe a divisão, cada um pega a sua',
    'parte e anota aqui o que pegou e o que terminou. Ninguém mexe nos arquivos de outro pato sem',
    'combinar antes aqui.',
    '',
    '## Divisão (o pato 1 propõe)',
    '',
    '## Quem pegou o quê',
    '',
    '## Feito',
    '',
  ].join('\n');
}

// Cria `<cwd>/.duckv/equipe-<id>.md` com o conteudo acima, antes de as sessoes abrirem. Nunca
// sobrescreve um arquivo que ja exista. Devolve { arquivo, criado, erro }: falhar aqui nao impede a
// equipe, so muda o que o briefing manda o pato fazer.
export function criarArquivoDaEquipe(cwd, { id, nomes, tarefa }) {
  const relativo = arquivoDaEquipe(id);
  const alvo = path.join(cwd, ...relativo.split('/'));
  try {
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    // 'wx' falha se o arquivo existir: ninguem perde o que ja escreveu ali.
    fs.writeFileSync(alvo, textoDoArquivo({ nomes, tarefa }), { flag: 'wx' });
    return { arquivo: relativo, criado: true };
  } catch (e) {
    if (e.code === 'EEXIST') return { arquivo: relativo, criado: false };
    return { arquivo: relativo, criado: false, erro: e.message };
  }
}

// `nomes` vem na ordem dos patos (o primeiro e o pato 1); `ordem` comeca em 1.
// `abertos` sao as ordens dos patos que abriram de verdade (sem as contas que falharam) e
// `arquivo` diz se o arquivo da equipe ja esta na pasta.
export function briefingEquipe({ id, ordem, nomes, tarefa, abertos, arquivo = true, caminho = null, branch = null, principal = null }) {
  // Sem a lista de quem abriu, a equipe e a lista inteira de nomes.
  const time = abertos?.length ? [...new Set(abertos)].sort((a, b) => a - b) : nomes.map((_, i) => i + 1);
  const total = time.length;
  const outros = time.filter((i) => i !== ordem);
  const quem = juntar(outros.map((i) => `o pato ${i} (${nomes[i - 1]})`));
  // Quem propoe: o pato 1; sem ele, o de menor numero que abriu, para o arquivo nunca ficar sem divisao.
  const propoe = quemPropoe(time);
  const propositor = propoe === ordem ? 'você' : `o pato ${propoe} (${nomes[propoe - 1]})`;
  const faltou = total === 1 || time.includes(1) ? '' : ' (o pato 1 não abriu nesta rodada, então propõe o pato de menor número que abriu)';
  // Isolada, cada sessao abre no worktree dela: o arquivo da divisao fica na pasta principal, e o pato
  // precisa do caminho inteiro dele e do nome do seu branch.
  const onde = caminho || `${arquivoDaEquipe(id)} desta pasta`;
  const sobreOBranch = branch
    ? `Você trabalha na sua própria cópia desta pasta, no branch ${branch}, tirado do que a pasta principal (${principal}) tinha quando a equipe abriu: os outros patos têm cada um a sua cópia e o seu branch, então ninguém atropela o arquivo de ninguém. Commite o seu trabalho nesse branch; quem junta os branches na pasta principal é a pessoa, pelo duckV, quando a equipe terminar.`
    : null;
  const sobreOArquivo = arquivo
    ? `A divisão do trabalho é combinada no arquivo ${onde}, que o duckV já criou com a tarefa, a lista dos patos e as seções para preencher: quem preenche a seção "Divisão (o pato 1 propõe)", com as partes e os arquivos de cada um, é ${propositor}${faltou}; os outros leem a proposta e pegam a sua parte; cada um anota ali o que pegou, em "Quem pegou o quê", e o que já terminou, em "Feito"; ninguém mexe nos arquivos de outro pato sem combinar antes no arquivo.`
    : `A divisão do trabalho é combinada no arquivo ${onde}, que o duckV não conseguiu criar: quem cria o arquivo e propõe ali a divisão por partes e arquivos é ${propositor}${faltou}, nas seções "Divisão (o pato 1 propõe)", "Quem pegou o quê" e "Feito"; os outros leem a proposta e pegam a sua parte; cada um anota ali o que pegou e o que já terminou; ninguém mexe nos arquivos de outro pato sem combinar antes no arquivo.`;
  return [
    total === 1
      ? 'Você é o único pato do duckV que conseguiu abrir nesta tarefa, nesta pasta.'
      : branch
        ? `Você é um dos ${total} patos do duckV trabalhando juntos, ao mesmo tempo, nesta mesma tarefa, cada um na sua cópia da pasta.`
        : `Você é um dos ${total} patos do duckV trabalhando juntos, ao mesmo tempo, nesta mesma pasta.`,
    total === 1
      ? `Você é o pato ${ordem}, da conta ${nomes[ordem - 1]}. Nenhuma outra conta abriu, então a tarefa inteira é sua.`
      : `Você é o pato ${ordem}, da conta ${nomes[ordem - 1]}. ${outros.length === 1 ? 'O outro é' : 'Os outros são'} ${quem}.`,
    sobreOArquivo,
    sobreOBranch,
    `A tarefa da equipe: ${tarefa}`,
  ].filter(Boolean).join('\n');
}
