package io.github.duckv.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.RemoteViews
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import io.github.duckv.app.ui.Destino
import io.github.duckv.app.ui.FolhaRapida
import io.github.duckv.app.ui.TemaClaudeV

// Os tres caminhos ate a folha rapida: o bloco das configuracoes rapidas, o atalho do icone
// (toque longo) e o widget da tela inicial. Todos abrem a RapidoActivity, que e so a folha.
object Atalhos {
    private var pedidosVistos = -1

    /**
     * Senha desta execucao do app: so a folha rapida a conhece, e a MainActivity (que outros apps podem abrir)
     * so aceita pasta e texto vindos com ela.
     */
    val chave: String = java.util.UUID.randomUUID().toString()
    const val MAX_PASTA = 1000
    const val MAX_TEXTO = 8000

    fun intent(ctx: Context): Intent = Intent(ctx, RapidoActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)

    fun pendente(ctx: Context): PendingIntent =
        PendingIntent.getActivity(ctx, 40, intent(ctx), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** Sessoes que pedem voce agora (pedido de permissao ou pergunta). */
    fun pedidos(e: Estado?) = e?.sessoes?.count { it.viva && it.precisa } ?: 0

    fun subtitulo(n: Int) = when (n) {
        0 -> "Nova sessão"
        1 -> "1 pede você"
        else -> "$n pedem você"
    }

    /** O bloco e o widget so mudam quando muda a contagem de pedidos. */
    fun estadoMudou(ctx: Context, e: Estado) {
        val n = pedidos(e)
        if (n == pedidosVistos) return
        pedidosVistos = n
        runCatching { TileService.requestListeningState(ctx, ComponentName(ctx, BlocoRapido::class.java)) }
        WidgetRapido.atualizarTodos(ctx, n)
    }
}

/** A folha rapida por cima do que estiver na tela: fundo transparente, fora dos recentes. */
class RapidoActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.auto(0, 0), SystemBarStyle.auto(0, 0))
        super.onCreate(savedInstanceState)
        // o app pode ter sido aberto agora so por causa da folha: liga ja
        Hub.ligar()
        setContent {
            val opcoes by Hub.opcoes.collectAsState()
            TemaClaudeV(opcoes.tema) {
                FolhaRapida(aoFechar = { finish() }, aoIr = ::ir)
            }
        }
    }

    private fun ir(d: Destino) {
        val i = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        when (d) {
            is Destino.Sessao -> i.putExtra("sessao", d.id)
            is Destino.Equipe -> i.putExtra("equipe", d.id).putExtra("falhas", d.falhas.toTypedArray())
            is Destino.Nova -> i.putExtra("nova", d.conta ?: "").putExtra("nova_pasta", d.cwd.take(Atalhos.MAX_PASTA))
                .putExtra("nova_texto", d.texto.take(Atalhos.MAX_TEXTO)).putExtra("nova_chave", Atalhos.chave)
            Destino.Inicio -> Unit
        }
        startActivity(i)
        finish()
    }

    override fun finish() {
        super.finish()
        // a folha ja desceu: nada de animacao de janela por cima
        if (Build.VERSION.SDK_INT >= 34) overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
        else @Suppress("DEPRECATION") overridePendingTransition(0, 0)
    }
}

/** Bloco "duckV" nas configuracoes rapidas: abre a folha; o subtitulo conta os pedidos. */
class BlocoRapido : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        val t = qsTile ?: return
        val n = Atalhos.pedidos(Hub.estado.value)
        t.label = "duckV"
        if (Build.VERSION.SDK_INT >= 29) t.subtitle = Atalhos.subtitulo(n)
        t.contentDescription = "duckV, ${Atalhos.subtitulo(n)}"
        t.state = if (n > 0) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        t.updateTile()
    }

    // Antes do Android 14 so existe a versao com Intent; do 14 em diante, a com PendingIntent.
    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(Atalhos.pendente(this))
        else @Suppress("DEPRECATION") startActivityAndCollapse(Atalhos.intent(this))
    }
}

/** Widget da tela inicial: o pato e "Nova sessao"; tocar abre a folha. */
class WidgetRapido : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, gerenciador: AppWidgetManager, ids: IntArray) {
        gerenciador.updateAppWidget(ids, vista(ctx, Atalhos.pedidos(Hub.estado.value)))
    }

    companion object {
        fun vista(ctx: Context, pedidos: Int) = RemoteViews(ctx.packageName, R.layout.widget_rapido).apply {
            setTextViewText(R.id.widget_apoio, if (pedidos > 0) Atalhos.subtitulo(pedidos) else "Toque para abrir")
            setOnClickPendingIntent(R.id.widget_raiz, Atalhos.pendente(ctx))
        }

        fun atualizarTodos(ctx: Context, pedidos: Int) {
            val g = AppWidgetManager.getInstance(ctx) ?: return
            val ids = g.getAppWidgetIds(ComponentName(ctx, WidgetRapido::class.java))
            if (ids.isNotEmpty()) g.updateAppWidget(ids, vista(ctx, pedidos))
        }
    }
}

