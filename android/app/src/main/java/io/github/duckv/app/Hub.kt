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

// Ligacao unica com o duckV do computador. A tela e o servico de avisos
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

    /** Ultima conta vista no inicio: voltar de uma conversa (ou reabrir o app) cai nela. */
    var contaVista: String?
        get() = prefs.getString("contaVista", null)
        set(v) = prefs.edit().putString("contaVista", v).apply()
    /** Pular para a conta que pede atencao so na primeira vez que o app abre. */
    var pulouPede = false

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

    // Aceita o link do QR da janela do duckV: https://pc.rede.ts.net/parear?k=...
    fun lerLink(texto: String): Pair<String, String>? {
        val uri = runCatching { Uri.parse(texto.trim()) }.getOrNull() ?: return null
        // texto que nao e link (ex.: "abc:def") faz o Android lancar excecao aqui; vira so "link invalido"
        val k = runCatching { uri.getQueryParameter("k") }.getOrNull()?.takeIf { it.length >= 16 } ?: return null
        if (uri.scheme != "http" && uri.scheme != "https" || uri.host.isNullOrEmpty()) return null
        val porta = if (uri.port > 0) ":${uri.port}" else ""
        return "${uri.scheme}://${uri.host}$porta" to k
    }

    /**
     * Troca o codigo do QR pela chave propria deste celular. O computador pede confirmacao:
     * [aoConferir] recebe os 4 numeros que devem aparecer iguais na janela do duckV.
     */
    fun parear(link: String, aoConferir: (String) -> Unit, pronto: (String?) -> Unit) {
        val (b, k) = lerLink(link) ?: return pronto("Esse não é o link do duckV. Use o código da janela do duckV no computador.")
        val json = "application/json".toMediaType()
        thread {
            var chave: String? = null
            val erro = try {
                val corpo = JSONObject().put("k", k).put("nome", android.os.Build.MODEL).toString().toRequestBody(json)
                val (codigo, resposta) = cliente.newCall(Request.Builder().url("$b/api/parear").post(corpo).build()).execute().use { it.code to (it.body?.string() ?: "") }
                when (codigo) {
                    200 -> chave = runCatching { JSONObject(resposta).optString("chave") }.getOrNull()?.takeIf { it.length >= 16 }
                    202 -> {
                        val r = JSONObject(resposta)
                        val sas = r.optString("sas")
                        principal.post { aoConferir(sas) }
                        // espera a sua confirmacao no computador (cada consulta segura ate 25 s)
                        var estado = "pendente"
                        while (estado == "pendente") {
                            val pedido = JSONObject().put("espera", r.optString("espera")).toString().toRequestBody(json)
                            val e = cliente.newCall(Request.Builder().url("$b/api/parear/espera").post(pedido).build()).execute().use { JSONObject(it.body?.string() ?: "{}") }
                            estado = e.optString("estado", "expirado")
                            if (estado == "ok") chave = e.optString("chave").takeIf { it.length >= 16 }
                        }
                        if (estado == "negado") throw IllegalStateException("O computador recusou este celular.")
                        if (estado == "expirado") throw IllegalStateException("O pedido expirou. Escaneie o código de novo e confirme no computador.")
                    }
                }
                when {
                    chave != null -> null
                    codigo == 403 -> "Esse código não vale mais: ele muda cada vez que o duckV liga ou pareia um aparelho. Escaneie o código da janela aberta agora."
                    codigo == 404 -> "O duckV do computador está desatualizado. Atualize a pasta e rode instalar.cmd de novo."
                    codigo == 429 -> "Há pedidos demais esperando. Responda os da janela do duckV."
                    else -> "O computador respondeu de um jeito estranho (erro $codigo)."
                }
            } catch (e: IllegalStateException) {
                e.message
            } catch (e: Exception) {
                "Não consegui falar com o computador. Confira se o duckV está aberto e se o Tailscale está ligado neste celular."
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

    // ------------------------------------------------------------ imagens da conversa

    private val imagens = android.util.LruCache<String, android.graphics.Bitmap>(24)

    /** Baixa uma imagem da conversa (so celulares pareados conseguem). Chame fora da thread principal. */
    fun imagem(id: String): android.graphics.Bitmap? {
        imagens.get(id)?.let { return it }
        val b = base ?: return null
        val req = Request.Builder().url("$b/api/img/$id").header("Cookie", "painel=$token").build()
        val bmp = runCatching {
            cliente.newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.bytes()?.let(::decodificar) else null }
        }.getOrNull() ?: return null
        imagens.put(id, bmp)
        return bmp
    }

    // Prints de tela grandes estourariam a memoria: reduz para no maximo ~1600 px no lado maior.
    private fun decodificar(b: ByteArray): android.graphics.Bitmap? {
        val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(b, 0, b.size, o)
        var amostra = 1
        while (maxOf(o.outWidth, o.outHeight) / (amostra * 2) >= 1600) amostra *= 2
        return android.graphics.BitmapFactory.decodeByteArray(b, 0, b.size, android.graphics.BitmapFactory.Options().apply { inSampleSize = amostra })
    }

    // ------------------------------------------------------------ arquivos do computador

    /**
     * Baixa um arquivo que o computador mandou, em pedacos, avisando o progresso (0..1).
     * Escreve em [destino]; se ja houver [jaTem] bytes la, continua de onde parou. Fora da thread principal.
     */
    fun baixarArquivo(id: String, jaTem: Long, destino: java.io.OutputStream, cancelado: () -> Boolean, progresso: (Long, Long) -> Unit): Result<Unit> =
        baixar("/api/arquivo/$id", jaTem, destino, cancelado, progresso)

    /** O APK da versao nova que o computador trouxe do GitHub. Mesmas regras de [baixarArquivo]. */
    fun baixarAtualizacao(jaTem: Long, destino: java.io.OutputStream, cancelado: () -> Boolean, progresso: (Long, Long) -> Unit): Result<Unit> =
        baixar("/api/atualizacao/apk", jaTem, destino, cancelado, progresso)

    private fun baixar(caminho: String, jaTem: Long, destino: java.io.OutputStream, cancelado: () -> Boolean, progresso: (Long, Long) -> Unit): Result<Unit> = runCatching {
        val b = base ?: error("Sem conexão com o computador.")
        val req = Request.Builder().url("$b$caminho").header("Cookie", "painel=$token")
            .apply { if (jaTem > 0) header("Range", "bytes=$jaTem-") }.build()
        cliente.newCall(req).execute().use { r ->
            if (!r.isSuccessful) error(runCatching { JSONObject(r.body?.string() ?: "{}").optString("erro") }.getOrNull()?.ifBlank { null } ?: "O computador recusou o download (${r.code}).")
            val corpo = r.body ?: error("O computador não mandou o arquivo.")
            val inicio = if (r.code == 206) jaTem else 0L
            val total = inicio + corpo.contentLength().coerceAtLeast(0)
            var feito = inicio
            val buf = ByteArray(64 * 1024)
            corpo.byteStream().use { ent ->
                while (true) {
                    if (cancelado()) error("cancelado")
                    val n = ent.read(buf)
                    if (n < 0) break
                    destino.write(buf, 0, n)
                    feito += n
                    progresso(feito, total)
                }
            }
            destino.flush()
        }
    }

    // ------------------------------------------------------------ anexos

    /** Manda um arquivo do celular para o computador; devolve (nome, caminho no computador) ou o erro. Fora da thread principal. */
    fun anexar(ctx: Context, uri: Uri): Result<Pair<String, String>> = runCatching {
        val b = base ?: error("Sem conexão com o computador.")
        val nome = ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: "arquivo"
        val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Não consegui ler $nome.")
        if (bytes.size > 25 * 1024 * 1024) error("$nome passa de 25 MB.")
        val req = Request.Builder().url("$b/api/anexo?nome=${Uri.encode(nome)}").header("Cookie", "painel=$token")
            .post(bytes.toRequestBody("application/octet-stream".toMediaType())).build()
        cliente.newCall(req).execute().use { r ->
            val j = JSONObject(r.body?.string() ?: "{}")
            if (!r.isSuccessful) error(j.optString("erro").ifBlank { "O computador recusou $nome." })
            nome to j.getString("caminho")
        }
    }

    // ------------------------------------------------------------ mensagens a caminho

    /** Mensagens ja aceitas pelo computador que ainda nao apareceram na conversa: (sessao, texto). */
    val aCaminho = MutableStateFlow<List<Pair<String, String>>>(emptyList())

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

    /** Comandos e skills para a lista do "/" da caixa de mensagem (lidos de novo no computador a cada pedido). */
    fun comandos(sessao: String, r: (List<Comando>) -> Unit) =
        mandar(JSONObject().put("t", "comandos").put("instance", sessao)) { erro, m -> if (erro == null) r(lerComandos(m?.optJSONArray("itens"))) }

    /**
     * Mensagem mandada por HTTP, sem depender da ligacao aberta: a resposta escrita na notificacao
     * chega com o app fechado. Devolve o erro, ou null. Fora da thread principal.
     */
    fun enviarDireto(sessao: String, texto: String): String? {
        val b = base ?: return "Celular não pareado."
        val corpo = JSONObject().put("instance", sessao).put("text", texto).toString().toRequestBody("application/json".toMediaType())
        return try {
            cliente.newCall(Request.Builder().url("$b/api/send").header("Cookie", "painel=$token").post(corpo).build()).execute().use { r ->
                if (r.isSuccessful) null
                else if (r.code == 404) "O duckV do computador está desatualizado. Atualize a pasta e abra de novo."
                else runCatching { JSONObject(r.body!!.string()).optString("erro") }.getOrNull()?.ifBlank { null } ?: "Erro ${r.code}"
            }
        } catch (_: Exception) {
            "Sem conexão com o computador."
        }
    }

    fun tecla(sessao: String, k: String, r: Retorno) =
        mandar(JSONObject().put("t", "key").put("instance", sessao).put("key", k), r)

    /** Modo de permissao escolhido direto: o computador aperta Shift+Tab ate o Claude Code mostrar o modo pedido. */
    fun modo(sessao: String, m: String, r: Retorno) =
        mandar(JSONObject().put("t", "modo").put("instance", sessao).put("mode", m), r)

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
