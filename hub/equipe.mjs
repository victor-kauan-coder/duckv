// "Todas as contas": uma sessao por conta, todas na mesma pasta, dividindo uma tarefa.
// O briefing abaixo e a primeira mensagem que cada pato recebe: ele diz quem e quem e
// manda a divisao do trabalho ser combinada num arquivo da pasta, nao entre as sessoes
// (elas nao se falam). Quem monta o time e abre as sessoes e o hub/server.mjs.
import crypto from 'node:crypto';

export const novoIdEquipe = () => `eq${crypto.randomBytes(4).toString('hex')}`;

// O arquivo onde os patos combinam a divisao, dentro da pasta do projeto.
export const arquivoDaEquipe = (id) => `.duckv/equipe-${id}.md`;

// Lista em portugues: "o pato 2 (Pessoal)" / "o pato 2 (Pessoal) e o pato 3 (Estudos)".
const juntar = (itens) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

// `nomes` vem na ordem dos patos (o primeiro e o pato 1); `ordem` comeca em 1.
export function briefingEquipe({ id, ordem, nomes, tarefa }) {
  const total = nomes.length;
  const outros = nomes.map((n, i) => [i + 1, n]).filter(([i]) => i !== ordem);
  const quem = juntar(outros.map(([i, n]) => `o pato ${i} (${n})`));
  return [
    `Você é um dos ${total} patos do duckV trabalhando juntos, ao mesmo tempo, nesta mesma pasta.`,
    `Você é o pato ${ordem}, da conta ${nomes[ordem - 1]}. ${outros.length === 1 ? 'O outro é' : 'Os outros são'} ${quem}.`,
    `A divisão do trabalho é combinada no arquivo ${arquivoDaEquipe(id)} desta pasta: o pato 1 cria o arquivo e propõe a divisão por partes e arquivos; os outros leem a proposta e pegam a sua parte; cada um anota ali o que pegou e o que já terminou; ninguém mexe nos arquivos de outro pato sem combinar antes no arquivo.`,
    `A tarefa da equipe: ${tarefa}`,
  ].join('\n');
}
