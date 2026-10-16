package io.github.duckv.app

import org.json.JSONArray
import org.json.JSONObject

// Espelho do que o servidor do computador manda em { t: 'state' }.

data class Uso(val pct: Double?, val resetsAt: Long?, val fresh: Boolean)
data class Tokens(val entrada: Long, val saida: Long, val cw: Long, val cr: Long) {
    val novos get() = entrada + cw + saida
}
data class Reinicio(val janela: String, val em: Long, val era: Double)
data class Padroes(val model: String?, val effort: String?, val mode: String?, val cwd: String?)

data class Conta(
    val id: String,
    val nome: String,
    val cor: Long,
    val padroes: Padroes,
    val cinco: Uso?,
    val semana: Uso?,
    val lidoEm: Long?,
    val tokens: Tokens?,
    val reinicio: Reinicio?,
    val email: String? = null,
    val pato: String = "classico",
    val plano: String? = null,
    val agente: String = "claude",
    val instalado: Boolean = true,
    /** O login da conta saiu ou foi recusado: o limite nao tem como ser lido. */
    val semLogin: Boolean = false,
)

/** Um agente de codigo que o duckV sabe abrir (Claude Code, Codex, Gemini CLI, OpenCode, Cline). */
data class Escolha(val id: String, val rotulo: String)
data class Agente(
    val id: String,
    val nome: String,
    val curto: String,
    val empresa: String,
    val cor: Long,
    val modelos: List<Escolha>,
    val esforcos: List<Escolha>,
    val modos: List<Escolha>,
    val loginNoTerminal: Boolean,
)
val CLAUDE_PADRAO = Agente("claude", "Claude Code", "Claude", "Anthropic", 0xFFD97757, emptyList(), emptyList(), emptyList(), false)

data class Perm(val id: String, val tool: String, val desc: String, val preview: String, val em: Long)
data class Opcao(val tecla: String, val rotulo: String, val confirmar: Boolean = false, val detalhe: String? = null, val livre: Boolean = false)
data class Pergunta(val titulo: String, val opcoes: List<Opcao>, val contexto: String = "")
data class Tarefa(val assunto: String, val status: String)
data class Contexto(val pct: Double?, val entrada: Long, val tamanho: Long)
data class PedidoLocal(val tool: String?, val texto: String)

data class Sessao(
    val id: String,
    val conta: String,
    val nome: String?,
    val cwd: String?,
    val model: String?,
    val status: String,
    val atividade: String,
    val inicio: Long,
    val ctx: Contexto?,
    val tokens: Tokens,
    val ultima: Tokens?,
    val respostas: Int,
    val linhasMais: Int,
    val linhasMenos: Int,
    val tarefas: List<Tarefa>,
    val perms: List<Perm>,
    val pedidoLocal: PedidoLocal?,
    val hospedada: Boolean,
    val pergunta: Pergunta?,
    val rodape: String,
    val effort: String?,
    val modo: String?,
    val podeEnviar: Boolean,
    val ultimoTexto: String,
    val desktop: Boolean = false,
    val sessaoId: String? = null,
    val agente: String = "claude",
    val links: List<String> = emptyList(),
    val previas: Previas = Previas(),
    val login: Boolean = false,
    // de onde a sessao vem: duckv, terminal, app (Claude desktop), historico, nuvem ou cowork
    val origem: String = "terminal",
    val link: String? = null,
    val arquivada: Boolean = false,
) {
    val viva get() = status != "ended"
    val precisa get() = status == "waiting" || perms.isNotEmpty()
    val titulo get() = nome?.takeIf { it.isNotBlank() } ?: pasta(cwd).ifEmpty { "Sessão" }
    /** Roda fora deste computador: na nuvem da Anthropic ou no Cowork do app Claude. */
    val remota get() = origem == "nuvem" || origem == "cowork"
}

data class Host(
    val disponivel: Boolean,
    val modelos: List<String>,
    val esforcos: List<String>,
    val modos: List<String>,
    val pastas: List<String>,
    val home: String,
    val sep: String,
    val agentes: List<Agente> = emptyList(),
)

data class AvisosPrefs(val perm: Boolean, val fim: Boolean, val reset: Boolean, val limiar: Int)
data class Prefs(val avisos: AvisosPrefs, val rapidas: List<String>)

data class Estado(
    val contas: List<Conta>,
    val sessoes: List<Sessao>,
    val host: Host,
    val prefs: Prefs,
    val demo: Boolean,
    val desvio: Long,
    /** Arquivos que o computador mandou para o celular, do mais novo ao mais antigo. */
    val arquivos: List<Arquivo> = emptyList(),
    /** Ultima versao do app publicada no GitHub, ja baixada no computador (null se ainda nao olhou ou deu erro). */
    val app: VersaoApp? = null,
) {
    fun conta(id: String) = contas.find { it.id == id }
        ?: Conta(id, id, 0xFFFF7A1A, Padroes(null, null, null, null), null, null, null, null, null)
    fun vivas(conta: String) = sessoes.filter { it.conta == conta && it.viva }
    fun agente(id: String?) = host.agentes.find { it.id == id } ?: host.agentes.find { it.id == "claude" } ?: CLAUDE_PADRAO
    fun agenteDa(conta: String) = agente(conta(conta).agente)
}

data class Msg(val id: String, val papel: String, val texto: String, val tool: String?, val doCelular: Boolean, val img: String? = null, val via: String? = null, val arq: String? = null, val ts: Long = 0)

/** Um arquivo do computador para baixar no celular. */
data class Arquivo(val id: String, val nome: String, val tamanho: Long, val tipo: String, val em: Long, val nota: String, val conta: String?)
/** O que da para ver de uma sessao no celular: previas em localhost, arquivos criados e artefatos do claude.ai. */
data class Previas(val portas: List<Int> = emptyList(), val arquivos: List<String> = emptyList(), val artefatos: List<String> = emptyList()) {
    val vazio get() = portas.isEmpty() && arquivos.isEmpty() && artefatos.isEmpty()
}

data class Tela(val linhas: List<String>, val cx: Int, val cy: Int, val links: List<String> = emptyList())

fun pasta(p: String?) = p.orEmpty().split('\\', '/').lastOrNull { it.isNotEmpty() }.orEmpty()

// ------------------------------------------------------------ leitura do JSON

private fun JSONObject.s(k: String): String? = if (isNull(k)) null else optString(k).takeIf { has(k) }
private fun JSONObject.l(k: String): Long? = if (has(k) && !isNull(k)) optLong(k) else null
private fun JSONObject.d(k: String): Double? = if (has(k) && !isNull(k)) optDouble(k).takeIf { !it.isNaN() } else null
private fun JSONArray?.strings() = if (this == null) emptyList() else List(length()) { optString(it) }
private inline fun <T> JSONArray?.mapa(f: (JSONObject) -> T): List<T> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it)?.let(f) }

fun corDe(hex: String?): Long = try {
    0xFF000000 or hex!!.removePrefix("#").toLong(16)
} catch (_: Exception) {
    0xFFFF7A1A
}

private fun uso(o: JSONObject?) = o?.let { Uso(it.d("pct"), it.l("resetsAt"), it.optBoolean("fresh")) }
private fun tokens(o: JSONObject?) = o?.let { Tokens(it.optLong("in"), it.optLong("out"), it.optLong("cw"), it.optLong("cr")) }

fun lerEstado(m: JSONObject): Estado {
    val contas = m.optJSONArray("accounts").mapa { a ->
        val u = a.optJSONObject("usage")
        val p = a.optJSONObject("padroes") ?: JSONObject()
        Conta(
            id = a.optString("id"),
            nome = a.optString("nome"),
            email = a.s("email"),
            pato = a.optString("pato", "classico"),
            plano = a.s("plano"),
            cor = corDe(a.s("cor")),
            padroes = Padroes(p.s("model"), p.s("effort"), p.s("mode"), p.s("cwd")),
            cinco = uso(u?.optJSONObject("five_hour")),
            semana = uso(u?.optJSONObject("seven_day")),
            lidoEm = u?.l("at"),
            tokens = tokens(a.optJSONObject("tokens")),
            reinicio = a.optJSONObject("lastReset")?.let { Reinicio(it.optString("win"), it.optLong("at"), it.optDouble("was", 0.0)) },
            agente = a.optString("agente", "claude"),
            instalado = a.optBoolean("instalado", true),
            semLogin = u?.optString("erro") == "login",
        )
    }
    val sessoes = m.optJSONArray("instances").mapa { i ->
        val ctx = i.optJSONObject("ctx")
        val linhas = i.optJSONObject("lines")
        val perg = i.optJSONObject("pergunta")
        val local = i.optJSONObject("localAsk")
        Sessao(
            id = i.optString("id"),
            conta = i.optString("account"),
            nome = i.s("name"),
            cwd = i.s("cwd"),
            model = i.s("model"),
            status = i.optString("status", "idle"),
            atividade = i.optString("activity"),
            inicio = i.optLong("startedAt"),
            ctx = ctx?.takeIf { it.optLong("size") > 0 }?.let { Contexto(it.d("pct"), it.optLong("in"), it.optLong("size")) },
            tokens = tokens(i.optJSONObject("tokens")) ?: Tokens(0, 0, 0, 0),
            ultima = tokens(i.optJSONObject("last")),
            respostas = i.optInt("turns"),
            linhasMais = linhas?.optInt("add") ?: 0,
            linhasMenos = linhas?.optInt("rem") ?: 0,
            tarefas = i.optJSONArray("tasks").mapa { Tarefa(it.optString("subject"), it.optString("status")) },
            perms = i.optJSONArray("perms").mapa { Perm(it.optString("id"), it.optString("tool"), it.optString("desc"), it.optString("preview"), it.optLong("at")) },
            pedidoLocal = local?.let { PedidoLocal(it.s("tool"), it.optString("text")) },
            hospedada = i.optBoolean("hosted"),
            pergunta = perg?.let { p -> Pergunta(p.optString("titulo"), p.optJSONArray("opcoes").mapa { Opcao(it.optString("tecla"), it.optString("rotulo"), it.optBoolean("confirmar"), it.s("detalhe"), it.optBoolean("livre")) }, p.optString("contexto")) },
            rodape = i.optString("rodape"),
            effort = i.s("effort"),
            modo = i.s("permMode"),
            podeEnviar = i.optBoolean("canSend"),
            desktop = i.optBoolean("desktop"),
            sessaoId = i.s("sessionId"),
            origem = i.s("origem") ?: "terminal",
            link = i.s("link")?.takeIf { it.startsWith("https://claude.ai/") },
            arquivada = i.optBoolean("arquivada"),
            ultimoTexto = i.optString("lastText"),
            agente = i.optString("agente", "claude"),
            links = i.optJSONArray("links").strings(),
            previas = i.optJSONObject("previas")?.let { pv -> Previas(pv.optJSONArray("portas").let { a -> List(a?.length() ?: 0) { a!!.optInt(it) } }, pv.optJSONArray("arquivos").strings(), pv.optJSONArray("artefatos").strings()) } ?: Previas(),
            login = i.optBoolean("login"),
        )
    }
    val h = m.optJSONObject("host") ?: JSONObject()
    val pr = m.optJSONObject("prefs") ?: JSONObject()
    val av = pr.optJSONObject("avisos") ?: JSONObject()
    return Estado(
        contas = contas,
        sessoes = sessoes,
        host = Host(
            disponivel = h.optBoolean("available"),
            modelos = h.optJSONArray("models").strings(),
            esforcos = h.optJSONArray("efforts").strings(),
            modos = h.optJSONArray("modes").strings(),
            pastas = h.optJSONArray("folders").strings(),
            home = h.optString("home"),
            sep = h.optString("sep", "/"),
            agentes = h.optJSONArray("agentes").mapa { g ->
                val es = { k: String -> g.optJSONArray(k).mapa { Escolha(it.optString("id"), it.optString("rotulo")) } }
                Agente(g.optString("id"), g.optString("nome"), g.optString("curto"), g.optString("empresa"), corDe(g.s("cor")), es("modelos"), es("esforcos"), es("modos"), g.optBoolean("loginNoTerminal"))
            },
        ),
        prefs = Prefs(
            AvisosPrefs(av.optBoolean("perm", true), av.optBoolean("fim", true), av.optBoolean("reset", true), av.optInt("limiar", 80)),
            pr.optJSONArray("rapidas").strings(),
        ),
        demo = m.optBoolean("demo"),
        desvio = System.currentTimeMillis() - m.optLong("now", System.currentTimeMillis()),
        arquivos = m.optJSONArray("arquivos").mapa {
            Arquivo(it.optString("id"), it.optString("nome"), it.optLong("tamanho"), it.optString("tipo"), it.optLong("em"), it.optString("nota"), it.s("conta"))
        },
        app = lerVersaoApp(m.optJSONObject("app")),
    )
}

fun lerMsgs(a: JSONArray?): List<Msg> = a.mapa {
    Msg(it.optString("id"), it.optString("role"), it.optString("text"), it.s("tool"), it.optString("via") == "celular", it.s("img"), it.s("via"), it.s("arq"), it.optLong("ts"))
}

fun lerTela(m: JSONObject) = Tela(m.optJSONArray("lines").strings(), m.optInt("cx"), m.optInt("cy"), m.optJSONArray("links").strings())

/** Item da lista que abre ao digitar "/": comando do agente, skill ou comando personalizado do computador. */
data class Comando(val nome: String, val desc: String, val tipo: String, val origem: String, val bloqueado: String?)

fun lerComandos(a: JSONArray?): List<Comando> = a.mapa {
    Comando(it.optString("nome"), it.optString("desc"), it.optString("tipo"), it.optString("origem"), it.s("bloqueado"))
}

/** Versao do app publicada nas Releases do GitHub, que o computador baixou e confere pelo SHA-256. */
data class VersaoApp(val versao: String, val titulo: String, val notas: String, val publicada: Long, val tamanho: Long, val sha256: String)

fun lerVersaoApp(o: JSONObject?): VersaoApp? {
    val v = o?.optString("versao")?.takeIf { it.isNotEmpty() } ?: return null
    return VersaoApp(v, o.optString("titulo"), o.optString("notas"), o.optLong("publicada"), o.optLong("tamanho"), o.optString("sha256"))
}
