// Automacoes agendadas: uma hora marcada, uma pasta, uma conta e um texto. Na hora, o duckV abre uma
// sessao como a tela "Nova sessao" abriria e manda o texto como primeira mensagem.
//
// O "quando" tem quatro formas: todo dia, nos dias uteis e uma vez por semana (as tres com uma hora), ou
// uma expressao cron de 5 campos, para quem quiser a hora exata. O fuso e o do computador, sempre.
//
// Nada roda atrasado: se o computador estava desligado (ou dormindo) na hora marcada, a execucao entra no
// historico como "perdida" e a automacao espera a proxima hora. Assim, ligar o computador de manha nao
// dispara de uma vez tudo o que estava marcado para a noite.
import crypto from 'node:crypto';
import { readJson, writeJson } from '../lib/config.mjs';

const MINUTO = 60_000;
const MAX_HISTORICO = 30;
const MAX_AUTOMACOES = 40;
export const TIPOS = ['diario', 'dias-uteis', 'semanal', 'cron'];
export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const novoId = () => `au${crypto.randomBytes(4).toString('hex')}`;
const limpar = (t, n) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---------------------------------------------------------------- cron

// Os 5 campos do cron, na ordem, com o nome que a mensagem de erro usa e o que cada um aceita.
const CAMPOS = [
  { nome: 'minuto', ordem: '1º', min: 0, max: 59 },
  { nome: 'hora', ordem: '2º', min: 0, max: 23 },
  { nome: 'dia do mês', ordem: '3º', min: 1, max: 31 },
  { nome: 'mês', ordem: '4º', min: 1, max: 12 },
  { nome: 'dia da semana', ordem: '5º', min: 0, max: 7 },
];

// Um pedaco de campo: "*", "5", "1-5", "*/15", "1-11/2".
function lerPedaco(pedaco, campo) {
  const [faixa, passo] = pedaco.split('/');
  if (pedaco.split('/').length > 2) return { erro: `tem duas barras ("${pedaco}")` };
  let salto = 1;
  if (passo !== undefined) {
    if (!/^\d+$/.test(passo) || Number(passo) < 1) return { erro: `o passo depois da barra precisa ser um número de 1 para cima ("${pedaco}")` };
    salto = Number(passo);
  }
  let de = campo.min;
  let ate = campo.max;
  if (faixa !== '*') {
    const partes = faixa.split('-');
    if (partes.length > 2 || partes.some((p) => !/^\d+$/.test(p))) return { erro: `não é um número nem um intervalo ("${pedaco}")` };
    de = Number(partes[0]);
    ate = partes.length === 2 ? Number(partes[1]) : de;
    if (de < campo.min || ate > campo.max) return { erro: `o número está fora da faixa ("${pedaco}")` };
    if (de > ate) return { erro: `o intervalo começa depois de terminar ("${pedaco}")` };
  }
  const valores = [];
  for (let v = de; v <= ate; v += salto) valores.push(v);
  return { valores };
}

/**
 * Le uma expressao cron de 5 campos. Devolve `{ campos: [Set, ...] }` ou `{ erro }` dizendo qual campo
 * esta errado e o que ele aceita.
 */
export function lerCron(texto) {
  const partes = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return { erro: 'Escreva a expressão cron, com 5 campos: minuto hora dia mês dia-da-semana.' };
  if (partes.length !== 5) {
    return {
      erro: `A expressão cron tem 5 campos (minuto hora dia mês dia-da-semana), e esta tem ${partes.length}. Por exemplo: "30 8 * * 1-5" é às 8:30 de segunda a sexta.`,
    };
  }
  const campos = [];
  for (const [i, parte] of partes.entries()) {
    const campo = CAMPOS[i];
    const valores = new Set();
    for (const pedaco of parte.split(',')) {
      const r = lerPedaco(pedaco, campo);
      if (r.erro) return { erro: `No ${campo.ordem} campo (${campo.nome}), ${r.erro}. Ele aceita ${campo.min} a ${campo.max}, uma lista (${campo.min},${campo.max}), um intervalo (${campo.min}-${campo.max}), um passo (*/2) ou *.` };
      for (const v of r.valores) valores.add(campo.nome === 'dia da semana' && v === 7 ? 0 : v);
    }
    campos.push(valores);
  }
  return { campos, texto: partes.join(' ') };
}

// ---------------------------------------------------------------- proxima execucao

const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** O "quando" em forma de cron, para um so caminho de calculo. */
function cronDoQuando(q) {
  if (q.tipo === 'cron') return lerCron(q.cron);
  const m = HORA.exec(String(q.hora || ''));
  if (!m) return { erro: 'A hora precisa ser como 08:30 (hora de 0 a 23 e minutos de 0 a 59).' };
  const [, h, min] = m;
  const semana = q.tipo === 'dias-uteis' ? '1-5' : q.tipo === 'semanal' ? String(q.dia ?? 1) : '*';
  if (q.tipo === 'semanal' && !(Number.isInteger(q.dia) && q.dia >= 0 && q.dia <= 6)) return { erro: 'Escolha o dia da semana.' };
  return lerCron(`${Number(min)} ${Number(h)} * * ${semana}`);
}

/**
 * A primeira hora marcada depois de `de` (exclusivo). Devolve o timestamp, ou null quando a combinacao
 * nunca acontece (por exemplo, 31 de fevereiro). Hora local do computador, incluindo horario de verao.
 */
export function proximaExecucao(quando, de = Date.now()) {
  const c = cronDoQuando(quando || {});
  if (c.erro) return null;
  const [minutos, horas, dias, meses, semanas] = c.campos;
  // comeca no minuto seguinte, sem segundos
  const d = new Date(Math.floor(de / MINUTO) * MINUTO + MINUTO);
  // dia por dia (no maximo 5 anos: o 29 de fevereiro de um ano bissexto ainda e achado)
  for (let voltas = 0; voltas < 366 * 5; voltas++) {
    const mes = d.getMonth() + 1;
    const dia = d.getDate();
    const semana = d.getDay();
    // no cron, dia do mes e dia da semana se somam quando os dois sao restritos
    const diaRestrito = dias.size < 31;
    const semanaRestrita = semanas.size < 7;
    const diaServe =
      meses.has(mes) &&
      (diaRestrito && semanaRestrita ? dias.has(dia) || semanas.has(semana) : (!diaRestrito || dias.has(dia)) && (!semanaRestrita || semanas.has(semana)));
    if (diaServe) {
      for (let h = d.getHours(); h < 24; h++) {
        if (!horas.has(h)) continue;
        for (let m = h === d.getHours() ? d.getMinutes() : 0; m < 60; m++) {
          if (!minutos.has(m)) continue;
          const alvo = new Date(d.getFullYear(), d.getMonth(), dia, h, m, 0, 0);
          if (alvo.getTime() > de) return alvo.getTime();
        }
      }
    }
    // vai para a meia-noite do dia seguinte
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
  return null;
}

/** O "quando" em uma frase para a tela: "Todo dia às 8:30", "Dias úteis às 9:00", "30 8 * * 1-5". */
export function quandoEmTexto(q) {
  if (!q) return '';
  if (q.tipo === 'cron') return `No cron ${q.cron}`;
  const hora = String(q.hora || '');
  if (q.tipo === 'diario') return `Todo dia às ${hora}`;
  if (q.tipo === 'dias-uteis') return `De segunda a sexta às ${hora}`;
  return `Toda ${DIAS[q.dia ?? 1]} às ${hora}`;
}

// ---------------------------------------------------------------- validacao

function validarQuando(bruto) {
  const tipo = String(bruto?.tipo || 'diario');
  if (!TIPOS.includes(tipo)) return { err: 'Escolha quando a automação roda: todo dia, nos dias úteis, uma vez por semana ou por uma expressão cron.' };
  if (tipo === 'cron') {
    const c = lerCron(bruto.cron);
    if (c.erro) return { err: c.erro };
    return { quando: { tipo, cron: c.texto } };
  }
  const q = { tipo, hora: String(bruto?.hora || '').trim() };
  if (tipo === 'semanal') q.dia = Number(bruto?.dia ?? 1);
  const c = cronDoQuando(q);
  if (c.erro) return { err: c.erro };
  return { quando: q };
}

// ---------------------------------------------------------------- o modulo

/**
 * `abrir({ conta, cwd, texto, nome })` abre a sessao (o `start` do servidor) e devolve `{ id }` ou `{ err }`.
 * `pastaOk(p)` devolve a pasta conferida pelo `folderAllowed` ou null; `contas()` lista os ids que existem.
 * `intervalo` e de quanto em quanto tempo o relogio confere, e `atrasoMaximo` e o quanto uma execucao pode
 * atrasar antes de virar "perdida" (o computador estava desligado).
 */
export function criarAutomacoes({
  arquivo,
  abrir,
  pastaOk = (p) => p,
  contas = () => [],
  aoMudar = () => {},
  agora = () => Date.now(),
  intervalo = 30_000,
  atrasoMaximo = 2 * MINUTO,
  automatico = true,
} = {}) {
  let lista = (readJson(arquivo, []) || []).filter((a) => a && typeof a.id === 'string').map(arrumar);
  let relogio = null;

  function arrumar(a) {
    const quando = validarQuando(a.quando).quando || { tipo: 'diario', hora: '09:00' };
    return {
      id: a.id,
      nome: limpar(a.nome, 60) || 'Automação',
      quando,
      conta: a.conta || null,
      pasta: String(a.pasta || ''),
      texto: String(a.texto || '').slice(0, 8000),
      ativa: a.ativa !== false,
      criada: Number(a.criada) || agora(),
      proxima: Number(a.proxima) || null,
      historico: Array.isArray(a.historico) ? a.historico.slice(-MAX_HISTORICO) : [],
    };
  }

  const gravar = () => {
    try {
      writeJson(arquivo, lista);
    } catch (e) {
      console.error('Nao consegui salvar as automacoes:', e.message);
    }
  };
  const achar = (id) => lista.find((a) => a.id === String(id || '')) || null;

  function anotar(a, item) {
    a.historico = [...a.historico, { em: agora(), ...item }].slice(-MAX_HISTORICO);
    return a.historico.at(-1);
  }

  /** Marca a proxima hora depois de `de`; sem hora possivel, a automacao fica sem proxima. */
  function remarcar(a, de = agora()) {
    a.proxima = a.ativa ? proximaExecucao(a.quando, de) : null;
    return a.proxima;
  }

  /** Abre a sessao desta automacao agora e anota o resultado no historico. */
  function rodar(a, { manual = false } = {}) {
    const dir = pastaOk(a.pasta);
    if (!dir) {
      const item = anotar(a, { erro: 'A pasta não existe mais ou saiu das pastas permitidas.', manual: manual || undefined });
      gravar();
      aoMudar();
      return item;
    }
    const r = abrir({ conta: a.conta, cwd: dir, texto: a.texto, nome: a.nome }) || {};
    const item = anotar(a, r.err ? { erro: r.err, manual: manual || undefined } : { instancia: r.id, conta: r.conta || a.conta || undefined, manual: manual || undefined });
    gravar();
    aoMudar();
    return item;
  }

  /** O relogio: roda o que chegou a hora e remarca. Nada atrasado roda. */
  function conferir() {
    const t = agora();
    let mudou = false;
    for (const a of lista) {
      if (!a.ativa) {
        if (a.proxima) {
          a.proxima = null;
          mudou = true;
        }
        continue;
      }
      if (!a.proxima) {
        remarcar(a, t);
        mudou = true;
        continue;
      }
      if (a.proxima > t) continue;
      // passou da hora: dentro da tolerancia roda, fora dela o computador estava desligado
      if (t - a.proxima <= atrasoMaximo) {
        const quando = a.proxima;
        remarcar(a, t);
        mudou = true;
        const item = rodar(a);
        item.marcada = quando;
      } else {
        anotar(a, { perdida: true, marcada: a.proxima });
        remarcar(a, t);
        mudou = true;
      }
    }
    if (mudou) {
      gravar();
      aoMudar();
    }
  }

  // Ao ligar, as horas que passaram enquanto o computador estava desligado entram como "perdida".
  conferir();
  if (automatico) {
    relogio = setInterval(conferir, intervalo);
    relogio.unref?.();
  }

  const publicoDe = (a) => ({
    id: a.id,
    nome: a.nome,
    quando: a.quando,
    quandoTexto: quandoEmTexto(a.quando),
    conta: a.conta,
    pasta: a.pasta,
    texto: a.texto,
    ativa: a.ativa,
    proxima: a.ativa ? a.proxima : null,
    ultima: a.historico.at(-1) || null,
    execucoes: a.historico.length,
  });

  return {
    /** Todas as automacoes, da proxima a rodar para a mais distante. */
    listar() {
      return [...lista]
        .sort((x, y) => (x.ativa === y.ativa ? (x.proxima || Infinity) - (y.proxima || Infinity) : x.ativa ? -1 : 1))
        .map(publicoDe);
    },
    criar(dados) {
      if (lista.length >= MAX_AUTOMACOES) return { err: `O limite é de ${MAX_AUTOMACOES} automações.` };
      const r = conferirDados(dados, { pastaOk, contas });
      if (r.err) return r;
      const a = arrumar({ ...r.dados, id: novoId(), criada: agora(), historico: [] });
      remarcar(a);
      lista = [...lista, a];
      gravar();
      aoMudar();
      return { automacao: publicoDe(a) };
    },
    editar(id, dados) {
      const a = achar(id);
      if (!a) return { err: 'Essa automação não existe mais.' };
      const r = conferirDados({ ...publicoDe(a), ...dados }, { pastaOk, contas });
      if (r.err) return r;
      Object.assign(a, r.dados);
      remarcar(a);
      gravar();
      aoMudar();
      return { automacao: publicoDe(a) };
    },
    apagar(id) {
      const a = achar(id);
      if (!a) return { err: 'Essa automação não existe mais.' };
      lista = lista.filter((x) => x !== a);
      gravar();
      aoMudar();
      return { apagada: a.id };
    },
    /** Pausa ou volta a contar. `ativa` ausente alterna. */
    pausar(id, ativa) {
      const a = achar(id);
      if (!a) return { err: 'Essa automação não existe mais.' };
      a.ativa = ativa === undefined ? !a.ativa : !!ativa;
      remarcar(a);
      gravar();
      aoMudar();
      return { automacao: publicoDe(a) };
    },
    /** "Rodar agora": abre a sessao na hora, sem mexer na proxima execucao. */
    rodarAgora(id) {
      const a = achar(id);
      if (!a) return { err: 'Essa automação não existe mais.' };
      const item = rodar(a, { manual: true });
      if (item.erro) return { err: item.erro };
      return { automacao: publicoDe(a), instancia: item.instancia };
    },
    /** O historico de uma automacao, do mais novo para o mais antigo. */
    historico(id) {
      const a = achar(id);
      if (!a) return { err: 'Essa automação não existe mais.' };
      return { automacao: publicoDe(a), historico: [...a.historico].reverse() };
    },
    /** O que vai no estado do app: a lista, sem o histórico inteiro. */
    publico() {
      return this.listar();
    },
    /** Para os testes e para o encerramento: confere agora e para o relógio. */
    conferir,
    parar() {
      if (relogio) clearInterval(relogio);
      relogio = null;
    },
  };
}

/** Confere o que veio do app e devolve os campos arrumados, ou o erro que a tela mostra. */
function conferirDados(bruto, { pastaOk, contas }) {
  const nome = limpar(bruto?.nome, 60);
  if (!nome) return { err: 'Dê um nome à automação.', campo: 'nome' };
  const texto = String(bruto?.texto ?? '').trim();
  if (texto.length < 3) return { err: 'Escreva a primeira mensagem da sessão (pelo menos 3 caracteres).', campo: 'texto' };
  if (texto.length > 8000) return { err: 'Mensagem longa demais (máximo de 8000 caracteres).', campo: 'texto' };
  const q = validarQuando(bruto?.quando);
  if (q.err) return { ...q, campo: 'quando' };
  const pasta = pastaOk(String(bruto?.pasta || ''));
  if (!pasta) {
    return {
      err: 'Pasta não encontrada ou fora das pastas permitidas. Abra uma sessão nela pelo computador uma vez, ou inclua a pasta em "pastasPermitidas" no arquivo data/config.json.',
      campo: 'pasta',
    };
  }
  const conta = bruto?.conta ? String(bruto.conta) : null;
  if (conta && !contas().includes(conta)) return { err: 'Conta não encontrada.', campo: 'conta' };
  return { dados: { nome, texto, quando: q.quando, pasta, conta, ativa: bruto?.ativa !== false } };
}
