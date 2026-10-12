package io.github.duckv.app.ui

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.AudioFile
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import io.github.duckv.app.Arquivo
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.io.File

/** Como esta cada arquivo neste celular. */
sealed interface Baixa {
    data class Baixando(val feito: Long, val total: Long) : Baixa
    data class Pronto(val uri: String) : Baixa
    data class Falhou(val motivo: String) : Baixa
}

/**
 * Downloads dos arquivos do computador. Ficam em Downloads/duckV (no Android 9 e anteriores, na pasta do app),
 * e o celular lembra onde salvou cada um para abrir de novo depois.
 */
object Baixados {
    val estado = MutableStateFlow<Map<String, Baixa>>(emptyMap())
    private val cancelar = mutableSetOf<String>()
    private val principal = Handler(Looper.getMainLooper())
    private var carregou = false

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("baixados", Context.MODE_PRIVATE)

    fun carregar(ctx: Context) {
        if (carregou) return
        carregou = true
        val salvos = prefs(ctx).all.mapNotNull { (k, v) -> (v as? String)?.let { k to Baixa.Pronto(it) } }.toMap()
        estado.value = salvos + estado.value
    }

    private fun mudar(id: String, b: Baixa?) = principal.post {
        estado.value = if (b == null) estado.value - id else estado.value + (id to b)
    }

    fun baixar(ctx: Context, a: Arquivo) {
        val app = ctx.applicationContext
        if (estado.value[a.id] is Baixa.Baixando) return
        cancelar.remove(a.id)
        mudar(a.id, Baixa.Baixando(0, a.tamanho))
        kotlin.concurrent.thread(name = "baixar-${a.id}") {
            var ultimo = 0L
            val r = runCatching {
                val (uri, saida) = destino(app, a)
                val ok = saida.use { out ->
                    Hub.baixarArquivo(a.id, 0, out, { a.id in cancelar }) { feito, total ->
                        val agora = System.currentTimeMillis()
                        if (agora - ultimo > 150 || feito == total) {
                            ultimo = agora
                            mudar(a.id, Baixa.Baixando(feito, if (total > 0) total else a.tamanho))
                        }
                    }
                }
                if (ok.isFailure) {
                    apagar(app, uri)
                    throw ok.exceptionOrNull()!!
                }
                publicar(app, uri)
                uri
            }
            r.onSuccess { uri ->
                prefs(app).edit().putString(a.id, uri.toString()).apply()
                mudar(a.id, Baixa.Pronto(uri.toString()))
            }.onFailure { e ->
                if (a.id in cancelar) mudar(a.id, null)
                else mudar(a.id, Baixa.Falhou(e.message ?: "O download falhou."))
            }
        }
    }

    fun parar(id: String) {
        cancelar.add(id)
    }

    /** Esquece o arquivo neste celular (ele continua no computador e em Downloads). */
    fun esquecer(ctx: Context, id: String) {
        prefs(ctx).edit().remove(id).apply()
        mudar(id, null)
    }

    private fun destino(ctx: Context, a: Arquivo): Pair<Uri, java.io.OutputStream> {
        val nome = a.nome.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        return if (Build.VERSION.SDK_INT >= 29) {
            val v = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, nome)
                put(MediaStore.Downloads.MIME_TYPE, a.tipo)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/duckV")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: error("O celular não deixou criar o arquivo em Downloads.")
            uri to (ctx.contentResolver.openOutputStream(uri) ?: error("O celular não deixou gravar em Downloads."))
        } else {
            val pasta = File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "duckV").apply { mkdirs() }
            val f = File(pasta, nome)
            FileProvider.getUriForFile(ctx, "${ctx.packageName}.arquivos", f) to f.outputStream()
        }
    }

    private fun publicar(ctx: Context, uri: Uri) {
        if (Build.VERSION.SDK_INT >= 29) ctx.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
    }

    private fun apagar(ctx: Context, uri: Uri) {
        runCatching { ctx.contentResolver.delete(uri, null, null) }
    }

    /** Abre o arquivo no app que o celular usa para esse tipo. Devolve o erro, se houver. */
    fun abrir(ctx: Context, a: Arquivo, uri: String): String? {
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), a.tipo)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            ctx.startActivity(i)
            null
        } catch (_: android.content.ActivityNotFoundException) {
            "Nenhum app deste celular abre ${a.nome}. Ele está em Downloads/duckV."
        } catch (_: SecurityException) {
            esquecer(ctx, a.id)
            "Não achei ${a.nome} em Downloads. Baixe de novo."
        }
    }

    fun compartilhar(ctx: Context, a: Arquivo, uri: String) {
        val i = Intent(Intent.ACTION_SEND).setType(a.tipo).putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        ctx.startActivity(Intent.createChooser(i, a.nome).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

fun tamanhoLegivel(n: Long): String = when {
    n >= 1_000_000_000 -> "%.1f GB".format(n / 1e9)
    n >= 1_000_000 -> "%.1f MB".format(n / 1e6)
    else -> "${maxOf(1, n / 1000)} KB"
}.replace('.', ',')

private fun iconeDo(a: Arquivo): ImageVector = when {
    a.tipo.startsWith("video/") -> Icons.Rounded.Movie
    a.tipo.startsWith("audio/") -> Icons.Rounded.AudioFile
    a.tipo.startsWith("image/") -> Icons.Rounded.Image
    a.tipo == "application/pdf" -> Icons.Rounded.PictureAsPdf
    a.tipo == "application/zip" -> Icons.Rounded.FolderZip
    a.tipo == "application/vnd.android.package-archive" -> Icons.Rounded.Android
    else -> Icons.AutoMirrored.Rounded.InsertDriveFile
}

private fun extensao(nome: String) = nome.substringAfterLast('.', "").uppercase().take(5)

/**
 * Um arquivo do computador: icone do tipo, nome, tamanho e quando chegou, a nota de quem mandou,
 * e a acao do momento: Baixar, o progresso com Parar, ou Abrir e Compartilhar.
 */
@Composable
fun CartaoArquivo(e: Estado?, a: Arquivo, modifier: Modifier = Modifier) {
    val c = cores
    val ctx = LocalContext.current
    val aviso = LocalAviso.current
    Baixados.carregar(ctx)
    val todos by Baixados.estado.collectAsState()
    val b = todos[a.id]
    val agora = System.currentTimeMillis() - (e?.desvio ?: 0)
    Column(modifier.widthIn(max = 520.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(c.invFundo), contentAlignment = Alignment.Center) {
                Icon(iconeDo(a), null, tint = c.invTexto, modifier = Modifier.size(24.dp))
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(a.nome, style = Texto.corpo.copy(fontWeight = FontWeight.Medium), color = c.texto, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    listOf(tamanhoLegivel(a.tamanho), extensao(a.nome).ifBlank { null }, "há ${falta((agora - a.em).coerceAtLeast(0))}").filterNotNull().joinToString(" · "),
                    style = Texto.pequeno, color = c.apoio,
                )
            }
        }
        if (a.nota.isNotBlank()) Text(a.nota, style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(top = 10.dp))
        when (b) {
            is Baixa.Baixando -> Column(Modifier.padding(top = 12.dp)) {
                val f = if (b.total > 0) (b.feito.toFloat() / b.total).coerceIn(0f, 1f) else 0f
                LinearProgressIndicator({ f }, Modifier.fillMaxWidth().heightIn(min = 6.dp).clip(RoundedCornerShape(3.dp)), color = c.primario, trackColor = c.primario.copy(alpha = 0.2f), drawStopIndicator = {})
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Baixando · ${(f * 100).toInt()}% de ${tamanhoLegivel(b.total)}", style = Texto.pequeno.copy(fontFeatureSettings = "tnum"), color = c.apoio, modifier = Modifier.weight(1f))
                    Botao("Parar", { Baixados.parar(a.id) }, peso = Peso.Quieto, altura = 36.dp)
                }
            }
            is Baixa.Pronto -> Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Botao("Abrir", { Baixados.abrir(ctx, a, b.uri)?.let(aviso) }, Modifier.weight(1f), Icons.Rounded.OpenInNew, Peso.Principal, altura = 44.dp)
                Botao("Compartilhar", { Baixados.compartilhar(ctx, a, b.uri) }, Modifier.weight(1f), Icons.Rounded.Share, Peso.Comum, altura = 44.dp)
            }
            is Baixa.Falhou -> Column(Modifier.padding(top = 10.dp)) {
                Text(b.motivo, style = Texto.apoio, color = c.perigo)
                Botao("Tentar de novo", { Baixados.baixar(ctx, a) }, Modifier.padding(top = 8.dp), Icons.Rounded.Refresh, Peso.Comum, altura = 40.dp)
            }
            null -> Botao("Baixar · ${tamanhoLegivel(a.tamanho)}", { Baixados.baixar(ctx, a) }, Modifier.fillMaxWidth().padding(top = 12.dp), Icons.Rounded.Download, Peso.Principal, altura = 44.dp)
        }
    }
}

/** A folha com todos os arquivos que o computador mandou. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolhaArquivos(e: Estado, aoFechar: () -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    ModalBottomSheet(aoFechar, containerColor = c.fundo) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Arquivos do computador", style = Texto.titulo, color = c.texto)
                Text("Salvos em Downloads/duckV", style = Texto.pequeno, color = c.apoio)
            }
            IconButton(aoFechar) { Icon(Icons.Rounded.Close, "Fechar", tint = c.apoio) }
        }
        if (e.arquivos.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Rounded.Download, null, tint = c.apoio, modifier = Modifier.size(36.dp))
                Text("Nenhum arquivo ainda", style = Texto.rotulo, color = c.texto, modifier = Modifier.padding(top = 10.dp))
                Text(
                    "Peça na conversa: \"manda esse arquivo para o meu celular\". O agente envia, e o arquivo aparece aqui para baixar. No computador também dá: node tools\\enviar.mjs arquivo",
                    style = Texto.apoio, color = c.apoio, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
                )
            }
        } else LazyColumn(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(e.arquivos, key = { it.id }) { a ->
                Column {
                    CartaoArquivo(e, a)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        androidx.compose.material3.TextButton({
                            Hub.mandar(JSONObject().put("t", "arquivoTirar").put("id", a.id)) { erro, _ -> aviso(erro ?: "Tirado da lista. O arquivo continua no computador.") }
                        }) { Text("Tirar da lista", style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.apoio) }
                    }
                }
            }
        }
    }
}
