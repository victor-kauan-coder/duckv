// Limpeza de texto vindo dos agentes, em tempo linear.
// Expressoes como /<a[^>]*>[\s\S]*?<\/a>/g releem o texto ate o fim para cada abertura sem
// fechamento: com um texto hostil (um arquivo lido pelo agente, por exemplo) o servidor travava.
// Aqui as marcacoes sao lidas uma vez e cada abertura usa o primeiro fechamento depois dela,
// o mesmo resultado da expressao preguicosa.

const MARCA = /<(\/?)([a-z_-]+)[^<>]*>/g;

/**
 * Tira os blocos <nome ...>...</nome> do texto.
 * mesmoNome: o fechamento precisa ter o mesmo nome da abertura (</nome>); sem isso, vale qualquer </x>.
 */
export function semBlocos(t, { mesmoNome = true } = {}) {
  t = String(t ?? '');
  const marcas = [];
  for (const m of t.matchAll(MARCA)) marcas.push({ fecha: m[1] === '/', nome: m[2], ini: m.index, fim: m.index + m[0].length });
  if (!marcas.length) return t;
  // de tras para frente: para cada marca, o indice do proximo fechamento (de qualquer nome e do mesmo nome)
  const proxQualquer = new Array(marcas.length);
  const proxMesmo = new Array(marcas.length);
  const ultimoPorNome = new Map();
  let ultimo = -1;
  for (let i = marcas.length - 1; i >= 0; i--) {
    proxQualquer[i] = ultimo;
    proxMesmo[i] = ultimoPorNome.get(marcas[i].nome) ?? -1;
    if (marcas[i].fecha) {
      ultimo = i;
      ultimoPorNome.set(marcas[i].nome, i);
    }
  }
  let saida = '', pos = 0;
  for (let i = 0; i < marcas.length; i++) {
    const a = marcas[i];
    if (a.fecha || a.ini < pos) continue;
    const j = mesmoNome ? proxMesmo[i] : proxQualquer[i];
    if (j < 0) continue;
    saida += t.slice(pos, a.ini);
    pos = marcas[j].fim;
  }
  return saida + t.slice(pos);
}

/** O que esta dentro do primeiro <nome ...>...</nome>, ou null. */
export function dentroDe(t, nome) {
  t = String(t ?? '');
  const abre = new RegExp(`<${nome}(?:\\s[^<>]*)?>`).exec(t);
  if (!abre) return null;
  const ini = abre.index + abre[0].length;
  const fim = t.indexOf(`</${nome}>`, ini);
  return fim < 0 ? null : t.slice(ini, fim);
}
