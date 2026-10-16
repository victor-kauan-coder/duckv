package io.github.duckv.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONArray
import org.json.JSONObject

/**
 * As sessoes da nuvem (Claude Code na nuvem e Cowork) continuam rodando com o computador desligado,
 * mas so o computador sabe quais sao. Por isso o celular guarda a ultima lista que viu: com o
 * computador fora de alcance, o inicio mostra essa lista (com a hora da leitura) e cada uma abre no
 * app Claude ou no claude.ai. Nada de login fica guardado aqui: so titulo, estado e endereco.
 */
object NuvemGuardada {
    data class Item(
        val sid: String,
        val titulo: String,
        val origem: String,
        val estado: String,
        val frase: String,
        val link: String?,
        val repo: String?,
        val conta: String,
        val cor: Long,
    )
    data class Lista(val itens: List<Item>, val vistaEm: Long)

    val lista = MutableStateFlow<Lista?>(null)
    private var marca = ""

    fun carregar(ctx: Context) {
        if (lista.value != null) return
        val t = prefs(ctx).getString("lista", null) ?: return
        runCatching {
            val o = JSONObject(t)
            val a = o.optJSONArray("itens") ?: JSONArray()
            lista.value = Lista(
                List(a.length()) { i ->
                    val x = a.getJSONObject(i)
                    Item(x.optString("sid"), x.optString("titulo"), x.optString("origem"), x.optString("estado"), x.optString("frase"), x.optString("link").takeIf { it.startsWith("https://claude.ai/") }, x.optString("repo").ifBlank { null }, x.optString("conta"), x.optLong("cor"))
                },
                o.optLong("vistaEm"),
            )
        }
    }

    /** Chamado a cada estado novo do computador: guarda as sessoes da nuvem que ele mostra agora. */
    fun guardar(ctx: Context, e: Estado) {
        val itens = e.sessoes.filter { it.remota && it.sessaoId != null }.map { s ->
            val conta = e.conta(s.conta)
            Item(
                s.sessaoId!!, s.titulo, s.origem,
                when { s.arquivada -> "arquivada"; s.precisa -> "pede"; s.status == "working" -> "trabalha"; else -> "parada" },
                when { s.precisa || s.status == "working" -> s.atividade; else -> s.ultimoTexto }.take(140),
                s.link, s.cwd, conta.nome, conta.cor,
            )
        }
        val nova = itens.joinToString("|") { "${it.sid}:${it.estado}:${it.frase}" }
        val agora = System.currentTimeMillis()
        // a lista muda pouco: grava quando muda, ou a cada minuto para a hora da leitura acompanhar
        if (nova == marca && agora - (lista.value?.vistaEm ?: 0) < 60_000) return
        marca = nova
        val l = Lista(itens, agora)
        lista.value = l
        val a = JSONArray()
        for (i in itens) a.put(JSONObject().put("sid", i.sid).put("titulo", i.titulo).put("origem", i.origem).put("estado", i.estado).put("frase", i.frase).put("link", i.link ?: "").put("repo", i.repo ?: "").put("conta", i.conta).put("cor", i.cor))
        prefs(ctx).edit().putString("lista", JSONObject().put("itens", a).put("vistaEm", agora).toString()).apply()
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("nuvem_guardada", Context.MODE_PRIVATE)

    // ------------------------------------------------------------ app Claude
    private const val PACOTE_CLAUDE = "com.anthropic.claude"

    /** Abre um endereco do claude.ai: o app Claude cuida dele quando esta instalado; senao, o navegador. */
    fun abrir(ctx: Context, url: String) {
        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }

    /** Abre o app Claude; sem ele instalado, o Claude Code no navegador. */
    fun abrirAppClaude(ctx: Context) {
        val app = ctx.packageManager.getLaunchIntentForPackage(PACOTE_CLAUDE)
        if (app != null) runCatching { ctx.startActivity(app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        else abrir(ctx, "https://claude.ai/code")
    }

    fun temAppClaude(ctx: Context) = ctx.packageManager.getLaunchIntentForPackage(PACOTE_CLAUDE) != null
}
