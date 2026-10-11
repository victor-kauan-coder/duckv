package io.github.duckv.app

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

typealias Retorno = (erro: String?, r: JSONObject?) -> Unit

// Ligacao unica com o claudeV do computador. A tela e o servico de avisos
// leem os mesmos fluxos daqui.
object Hub {
    val estado = MutableStateFlow<Estado?>(null)
    val ligado = MutableStateFlow<Boolean?>(null)
    val pareado = MutableStateFlow(false)
    val conversa = MutableStateFlow<List<Msg>>(emptyList())
    val tela = MutableStateFlow<Tela?>(null)
    val opcoes = MutableStateFlow(OpcoesLocais())

    var aberta: String? = null
        private set
    var aoMudarEstado: ((Estado) -> Unit)? = null

    private lateinit var prefs: SharedPreferences
    private val principal = Handler(Looper.getMainLooper())
    private val cliente = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private var ws: WebSocket? = null
    private var espera = 800L
    private var ref = 0
    private val pendentes = HashMap<Int, Retorno>()
    private var visivel = true
    private var querLigado = false

    val base get() = prefs.getString("base", null)
    private val token get() = prefs.getString("token", null)

    fun iniciar(ctx: Context) {
        prefs = ctx.getSharedPreferences("claudev", Context.MODE_PRIVATE)
        opcoes.value = OpcoesLocais.ler(prefs)
        pareado.value = base != null && token != null
    }

    fun guardar(o: OpcoesLocais) {
        opcoes.value = o
        o.gravar(prefs)
    }

    // ------------------------------------------------------------ pareamento

    // Aceita o link do QR da janela do claudeV: https://pc.rede.ts.net/parear?k=...
    fun lerLink(texto: String): Pair<String, String>? {
        val uri = runCatching { Uri.parse(texto.trim()) }.getOrNull() ?: return null
        val k = uri.getQueryParameter("k")?.takeIf { it.length >= 16 } ?: return null
        if (uri.scheme != "http" && uri.scheme != "https" || uri.host.isNullOrEmpty()) return null
        val porta = if (uri.port > 0) ":${uri.port}" else ""
        return "${uri.scheme}://${uri.host}$porta" to k
    }

    fun parear(link: String, pronto: (String?) -> Unit) {
        val (b, k) = lerLink(link) ?: return pronto("Esse não é o link do claudeV. Use o código da janela do claudeV no computador.")
        thread {
            var chave: String? = null
            val erro = try {
                // Troca o codigo do QR pela chave propria deste celular; o codigo muda a cada vez que o claudeV liga.
                val corpo = JSONObject().put("k", k).put("nome", android.os.Build.MODEL).toString().toRequestBody("application/json".toMediaType())
                cliente.newCall(Request.Builder().url("$b/api/parear").post(corpo).build()).execute().use {
                    when (it.code) {
                        200 -> {
                            chave = it.body?.string()?.let { t -> JSONObject(t).optString("chave") }?.takeIf { c -> c.length >= 16 }
                            if (chave == null) "O computador respondeu de um jeito estranho. Atualize o claudeV no computador." else null
                        }
                        403 -> "Esse código não vale mais: ele muda cada vez que o claudeV liga. Escaneie o código da janela aberta agora."
                        404 -> "O claudeV do computador está desatualizado. Atualize a pasta e rode instalar.cmd de novo."
                        else -> "O computador respondeu com erro ${it.code}."
                    }
                }
            } catch (e: Exception) {
                "Não consegui falar com o computador. Confira se o claudeV está aberto e se o Tailscale está ligado neste celular."
            }
            principal.post {
                if (erro == null) {
                    prefs.edit().putString("base", b).putString("token", chave).apply()
                    pareado.value = true
                    ligar()
                }
                pronto(erro)
            }
        }
    }

    fun desparear() {
        val b = base
        val k = token
        if (b != null && k != null) {
            thread {
                runCatching {
                    cliente.newCall(
                        Request.Builder().url("$b/api/desparear").header("Cookie", "painel=$k")
                            .post(ByteArray(0).toRequestBody(null)).build(),
                    ).execute().close()
                }
            }
        }
        prefs.edit().remove("base").remove("token").apply()
        desligar()
        estado.value = null
        pareado.value = false
    }

    // ------------------------------------------------------------ ligacao

    fun ligar() {
        querLigado = true
        if (ws != null || !pareado.value) return
        val b = base ?: return
        val url = b.replaceFirst("http", "ws") + "/ws"
        val req = Request.Builder().url(url).header("Cookie", "painel=$token").build()
        ws = cliente.newWebSocket(req, Ouvinte())
    }

    fun desligar() {
        querLigado = false
        ws?.close(1000, null)
        ws = null
    }

    private class Ouvinte : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            principal.post {
                if (webSocket != ws) return@post
                espera = 800
                ligado.value = true
                mandar(JSONObject().put("t", "vis").put("visible", visivel))
                aberta?.let { mandar(JSONObject().put("t", "open").put("instance", it)) }
            }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val m = runCatching { JSONObject(text) }.getOrNull() ?: return
            principal.post { if (webSocket == ws) receber(m) }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            caiu(webSocket, null)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            caiu(webSocket, response?.code)
        }
    }

    private fun caiu(socket: WebSocket, codigo: Int?) {
        principal.post { caiuAqui(socket, codigo) }
    }

    private fun caiuAqui(socket: WebSocket, codigo: Int?) {
        if (socket != ws) return
        ws = null
        ligado.value = false
        for (f in pendentes.values) f("Sem conexão com o computador.", null)
        pendentes.clear()
        if (codigo == 401) {
            pareado.value = false
            prefs.edit().remove("token").apply()
            return
        }
        if (querLigado) principal.postDelayed({ if (querLigado) ligar() }, espera)
        espera = (espera * 1.7).toLong().coerceAtMost(10_000)
    }

    private fun receber(m: JSONObject) {
        when (m.optString("t")) {
            "state" -> {
                val e = lerEstado(m)
                estado.value = e
                aoMudarEstado?.invoke(e)
            }
            "history" -> if (m.optString("instance") == aberta) conversa.value = lerMsgs(m.optJSONArray("items"))
            "msgs" -> if (m.optString("instance") == aberta) conversa.value = conversa.value + lerMsgs(m.optJSONArray("items"))
            "screen" -> if (m.optString("instance") == aberta) tela.value = lerTela(m)
            "ack", "err" -> pendentes.remove(m.optInt("ref"))?.invoke(if (m.optString("t") == "err") m.optString("msg") else null, m)
        }
    }

    fun mandar(obj: JSONObject, resposta: Retorno? = null) {
        val s = ws
        if (s == null || ligado.value != true) {
            resposta?.invoke("Sem conexão com o computador.", null)
            return
        }
        if (resposta != null) {
            obj.put("ref", ++ref)
            pendentes[ref] = resposta
        }
        s.send(obj.toString())
    }

    fun visibilidade(v: Boolean) {
        visivel = v
        mandar(JSONObject().put("t", "vis").put("visible", v))
        if (v && pareado.value) ligar()
    }

    // ------------------------------------------------------------ sessao aberta na tela

    fun abrir(id: String) {
        if (aberta == id) return
        aberta = id
        conversa.value = emptyList()
        tela.value = null
        mandar(JSONObject().put("t", "open").put("instance", id))
    }

    fun fechar(id: String) {
        if (aberta != id) return
        aberta = null
        conversa.value = emptyList()
        tela.value = null
        mandar(JSONObject().put("t", "close"))
    }

    // Atalhos para os pedidos mais comuns.
    fun enviar(sessao: String, texto: String, r: Retorno) =
        mandar(JSONObject().put("t", "send").put("instance", sessao).put("text", texto), r)

    fun tecla(sessao: String, k: String, r: Retorno) =
        mandar(JSONObject().put("t", "key").put("instance", sessao).put("key", k), r)

    fun veredito(sessao: String, pedido: String, aceitar: Boolean, recado: String? = null, r: Retorno) =
        mandar(
            JSONObject().put("t", "verdict").put("instance", sessao).put("request_id", pedido)
                .put("behavior", if (aceitar) "allow" else "deny").apply { if (!recado.isNullOrBlank()) put("note", recado) },
            r,
        )

    fun prefs(obj: JSONObject, r: Retorno) = mandar(obj.put("t", "prefs"), r)
}

// Opcoes que valem so neste celular.
data class OpcoesLocais(
    val tema: String = "sistema",
    val pato: String = "animado",
    val ferramentas: Boolean = true,
    val segundoPlano: Boolean = true,
) {
    fun gravar(p: SharedPreferences) = p.edit()
        .putString("tema", tema).putString("pato", pato)
        .putBoolean("ferramentas", ferramentas).putBoolean("segundoPlano", segundoPlano).apply()

    companion object {
        fun ler(p: SharedPreferences) = OpcoesLocais(
            p.getString("tema", "sistema")!!,
            p.getString("pato", "animado")!!,
            p.getBoolean("ferramentas", true),
            p.getBoolean("segundoPlano", true),
        )
    }
}
