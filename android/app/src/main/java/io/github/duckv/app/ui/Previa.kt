package io.github.duckv.app.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.duckv.app.Hub
import io.github.duckv.app.Sessao

/** Endereco falso das paginas da pasta do projeto: nunca sai do celular, toda busca vai pelo duckV. */
private const val PASTA = "duckv-pasta.localhost"

/** O que abrir: uma previa (porta) ou um arquivo da pasta do projeto. */
private data class Alvo(val titulo: String, val url: String)

/** Lista do que da para ver desta sessao: previas, arquivos criados e artefatos. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun ListaPrevias(s: Sessao, aoFechar: () -> Unit) {
    val c = cores
    val ctx = LocalContext.current
    var aberto by remember { mutableStateOf<Alvo?>(null) }
    aberto?.let { a -> TelaPrevia(s.id, a.titulo, a.url) { aberto = null } }
    androidx.compose.material3.ModalBottomSheet(aoFechar, containerColor = c.fundo) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 24.dp).navigationBarsPadding()) {
            Text("Visualizar", style = Texto.titulo, color = c.texto)
            Text("Abre aqui no celular, buscando pelo duckV.", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(bottom = 12.dp))
            val p = s.previas
            if (p.portas.isNotEmpty()) Grupo("Prévias rodando no computador") {
                for (porta in p.portas) Item(Icons.Rounded.Language, "localhost:$porta", "Servidor de desenvolvimento") { aberto = Alvo("localhost:$porta", "http://localhost:$porta/") }
            }
            if (p.arquivos.isNotEmpty()) Grupo("Arquivos criados nesta sessão") {
                for (f in p.arquivos) Item(Icons.Rounded.Description, f.substringAfterLast('/'), f.substringBeforeLast('/', "").ifEmpty { null }) {
                    aberto = Alvo(f.substringAfterLast('/'), "http://$PASTA/" + f.split('/').joinToString("/") { Uri.encode(it) })
                }
            }
            if (p.artefatos.isNotEmpty()) Grupo("Artefatos do Claude") {
                for (u in p.artefatos) Item(Icons.AutoMirrored.Rounded.OpenInNew, "Artefato " + u.substringAfterLast('/').take(10), "Abre no navegador (claude.ai)") {
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) }
                }
            }
            if (p.vazio) Text("Nada para visualizar ainda. Quando o agente subir um servidor (localhost) ou criar uma página, imagem ou PDF no projeto, aparece aqui.", style = Texto.apoio, color = c.apoio)
        }
    }
}

@Composable
private fun Grupo(titulo: String, conteudo: @Composable () -> Unit) {
    val c = cores
    Text(titulo, style = Texto.secao, color = c.apoio, modifier = Modifier.padding(top = 8.dp, bottom = 6.dp))
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao)) { conteudo() }
}

@Composable
private fun Item(icone: androidx.compose.ui.graphics.vector.ImageVector, titulo: String, apoio: String?, aoTocar: () -> Unit) {
    val c = cores
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = aoTocar).heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(c.fundo), contentAlignment = Alignment.Center) { Icon(icone, null, tint = c.realce, modifier = Modifier.size(20.dp)) }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(titulo, style = Texto.corpo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (apoio != null) Text(apoio, style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * A pagina em tela cheia. O WebView acha que esta em localhost:porta (ou no endereco falso da pasta),
 * entao os caminhos da pagina funcionam como no computador; cada pedido e trocado por uma busca ao duckV
 * com a chave deste celular, que a pagina nunca ve.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun TelaPrevia(sessao: String, titulo: String, inicio: String, aoFechar: () -> Unit) {
    val c = cores
    var carregando by remember { mutableStateOf(true) }
    var web by remember { mutableStateOf<WebView?>(null) }
    Dialog(aoFechar, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Column(Modifier.fillMaxSize().background(c.fundo)) {
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(aoFechar) { Icon(Icons.Rounded.Close, "Fechar", tint = c.texto) }
                Text(titulo, style = Texto.conta, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconButton({ web?.reload() }) { Icon(Icons.Rounded.Refresh, "Recarregar", tint = c.texto) }
            }
            if (carregando) LinearProgressIndicator(Modifier.fillMaxWidth(), color = c.primario, trackColor = c.cartao) else Box(Modifier.fillMaxWidth().heightIn(min = 4.dp))
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.loadWithOverviewMode = true
                        settings.useWideViewPort = true
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = interceptar(sessao, req)
                            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) { carregando = true }
                            override fun onPageFinished(view: WebView, url: String?) { carregando = false }
                        }
                        loadUrl(inicio)
                        web = this
                    }
                },
                modifier = Modifier.fillMaxSize().navigationBarsPadding(),
                onRelease = { it.destroy() },
            )
        }
    }
}

/** Troca um pedido da pagina por uma busca ao duckV. Pedidos para outros sites seguem normais. */
private fun interceptar(sessao: String, req: WebResourceRequest): WebResourceResponse? {
    val u = req.url
    val host = u.host ?: return null
    if (req.method != "GET") return null
    val inst = Uri.encode(sessao)
    val resto = (u.encodedPath ?: "/") + (u.encodedQuery?.let { "?$it" } ?: "")
    val caminho = when {
        host == PASTA -> "/api/pasta/$inst$resto"
        (host == "localhost" || host == "127.0.0.1") && u.port > 0 -> "/api/previa/$inst/${u.port}$resto"
        else -> return null
    }
    val r = Hub.buscar(caminho) ?: return WebResourceResponse("text/plain", "utf-8", 502, "Sem conexao", null, "Sem conexão com o computador.".byteInputStream())
    val corpo = r.body ?: return null
    val tipo = r.header("Content-Type") ?: "application/octet-stream"
    val mime = tipo.substringBefore(';').trim()
    val charset = Regex("charset=([\\w-]+)", RegexOption.IGNORE_CASE).find(tipo)?.groupValues?.get(1)
    val codigo = r.code.takeIf { it in 100..299 || it in 400..599 } ?: 200
    return WebResourceResponse(mime, charset, codigo, r.message.ifBlank { "OK" }, mapOf("Cache-Control" to "no-store"), corpo.byteStream())
}
