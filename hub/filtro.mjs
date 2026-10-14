// Filtro do que o celular digita numa sessao: o que mexe em permissoes ou roda no computador fica so la.
// Texto que comeca com ! vira comando no terminal do computador sem pedir permissao, e alguns comandos
// de barra mudam as permissoes; por isso so passam os comandos de barra da lista de cada agente e as
// skills e comandos personalizados instalados, menos os que liberam o terminal sozinhos (ver comandos.mjs).
// Devolve a mensagem de recusa, ou null quando o texto pode seguir.
export function textoPerigoso(text, ag, extras = []) {
  const t = text.trimStart();
  if (t.startsWith('!')) return `Comandos com ! rodam no computador sem pedir permissão, então não valem pelo celular. Peça ao ${ag.curto} em texto comum.`;
  if (!t.startsWith('/')) return null;
  const nome = '/' + t.slice(1).split(/\s/)[0].toLowerCase();
  if (ag.comandos.some(([n]) => n === nome)) return null;
  const extra = extras.find((x) => x.nome.toLowerCase() === nome);
  if (extra) return extra.bloqueado;
  return `O comando ${nome} não vale pelo celular. Digite / para ver os que valem; os outros mexem em permissões ou no computador e ficam lá.`;
}
