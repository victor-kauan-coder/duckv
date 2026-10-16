package io.github.duckv.app.ui

import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.BrokenImage
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.duckv.app.Hub
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Anexos de uma mensagem, no mesmo formato do app do computador e da pagina web: o arquivo sobe para
// a pasta data/anexos do duckV e o caminho vai no fim da mensagem, um por linha. Na conversa, o caminho
// sai do texto e vira miniatura (imagem) ou cartao (outro arquivo).

/** Um anexo pronto para sair com a proxima mensagem. [uri] e o arquivo no celular, para a miniatura. */
data class AnexoPronto(val nome: String, val caminho: String, val uri: Uri?, val imagem: Boolean)

/** Um anexo citado numa mensagem ja enviada: [url] e a rota do duckV que devolve o arquivo. */
data class AnexoNaMsg(val nome: String, val url: String, val imagem: Boolean)

private val RE_LINHA = Regex("""^[ \t]*"?((?:[A-Za-z]:)?[^\n"]*?[\\/]anexos[\\/](\d{4}-\d{2}-\d{2}-[0-9a-f]{8})[\\/]([\p{L}\p{N}._-]{1,80}))"?[ \t]*$""", RegexOption.MULTILINE)
private val RE_SOLTO = Regex("""(?:[A-Za-z]:)?[^\s"'`]*[\\/]anexos[\\/](\d{4}-\d{2}-\d{2}-[0-9a-f]{8})[\\/]([\p{L}\p{N}._-]{1,80})""")
private val RE_IMAGEM = Regex("""\.(png|jpe?g|gif|webp|bmp)$""", RegexOption.IGNORE_CASE)

fun ehImagem(nome: String) = RE_IMAGEM.containsMatchIn(nome)

/** Separa o texto de uma mensagem dos anexos citados nela. */
fun anexosDoTexto(texto: String): Pair<String, List<AnexoNaMsg>> {
    val itens = mutableListOf<AnexoNaMsg>()
    val add = { pasta: String, nome: String -> itens += AnexoNaMsg(nome, "/api/anexo/$pasta/${Uri.encode(nome)}", ehImagem(nome)) }
    var t = RE_LINHA.replace(texto) { add(it.groupValues[2], it.groupValues[3]); "" }
    t = RE_SOLTO.replace(t) { add(it.groupValues[1], it.groupValues[2]); "" }
    return t.replace(Regex("""[ \t]+\n"""), "\n").replace(Regex("""\n{3,}"""), "\n\n").trim() to itens
}

/** Texto e caminhos numa mensagem so: os caminhos no fim, um por linha. */
fun mensagemComAnexos(texto: String, anexos: List<AnexoPronto>): String =
    listOf(texto.trim(), anexos.joinToString("\n") { it.caminho }).filter { it.isNotBlank() }.joinToString("\n\n")

// ------------------------------------------------------------ area de transferencia

/** Ha uma imagem copiada (um print, por exemplo)? So olha o tipo, sem ler o conteudo. */
fun temImagemCopiada(ctx: Context): Boolean {
    val cm = ctx.getSystemService(ClipboardManager::class.java) ?: return false
    return runCatching { cm.primaryClipDescription?.hasMimeType("image/*") == true }.getOrDefault(false)
}

/** A imagem copiada, para subir como anexo. */
fun imagemCopiada(ctx: Context): Uri? {
    val cm = ctx.getSystemService(ClipboardManager::class.java) ?: return null
    return runCatching { cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri }.getOrNull()
}

// ------------------------------------------------------------ miniaturas

/** Miniatura de um arquivo do proprio celular, reduzida para nao pesar na memoria. */
fun miniaturaLocal(ctx: Context, uri: Uri, lado: Int = 256): Bitmap? = runCatching {
    val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    ctx.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, o) }
    var amostra = 1
    while (maxOf(o.outWidth, o.outHeight) / (amostra * 2) >= lado) amostra *= 2
    ctx.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = amostra }) }
}.getOrNull()

/** Fileira de anexos acima do campo de mensagem: foto vira miniatura, arquivo vira etiqueta; o X tira. */
@Composable
fun AnexosAntesDeEnviar(anexos: List<AnexoPronto>, subindo: Int, cor: Color, aoTirar: (AnexoPronto) -> Unit) {
    val c = cores
    val ctx = LocalContext.current
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (a in anexos) {
            val forma = RoundedCornerShape(14.dp)
            if (a.imagem && a.uri != null) {
                val bmp by produceState<Bitmap?>(null, a.uri) { value = withContext(Dispatchers.IO) { miniaturaLocal(ctx, a.uri) } }
                Box(Modifier.size(72.dp).clip(forma).background(c.elevada).border(1.dp, c.linha, forma)) {
                    bmp?.let { Image(it.asImageBitmap(), a.nome, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                    BotaoTirar(a.nome, Modifier.align(Alignment.TopEnd).padding(4.dp)) { aoTirar(a) }
                }
            } else {
                Row(
                    Modifier.heightIn(min = 56.dp).widthIn(max = 220.dp).clip(forma).background(c.elevada).border(1.dp, c.linha, forma).padding(start = 12.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.AttachFile, null, tint = cor, modifier = Modifier.size(18.dp))
                    Text(a.nome, style = Texto.apoio, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp).weight(1f, fill = false))
                    BotaoTirar(a.nome, Modifier.padding(start = 4.dp), escuro = false) { aoTirar(a) }
                }
            }
        }
        if (subindo > 0) {
            Box(Modifier.size(72.dp).clip(RoundedCornerShape(14.dp)).background(c.elevada), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(24.dp), color = cor, strokeWidth = 3.dp)
            }
        }
    }
}

@Composable
private fun BotaoTirar(nome: String, modifier: Modifier, escuro: Boolean = true, aoTocar: () -> Unit) {
    val c = cores
    Box(
        modifier.size(if (escuro) 28.dp else 40.dp).clip(CircleShape)
            .background(if (escuro) Color.Black.copy(alpha = 0.55f) else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = "Tirar $nome", onClick = aoTocar),
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Rounded.Close, "Tirar $nome", tint = if (escuro) Color.White else c.apoio, modifier = Modifier.size(16.dp)) }
}

/** Anexos de uma mensagem enviada: miniaturas (toque amplia) e cartoes de arquivo. */
@Composable
fun AnexosDaMensagem(itens: List<AnexoNaMsg>, cor: Color) {
    val c = cores
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (a in itens) {
            val forma = RoundedCornerShape(12.dp)
            if (a.imagem) {
                var tentativa by remember(a.url) { mutableStateOf(0) }
                val bmp by produceState<Bitmap?>(null, a.url, tentativa) { value = withContext(Dispatchers.IO) { Hub.imagemDoDuckv(a.url) } }
                var cheia by remember { mutableStateOf(false) }
                val b = bmp
                Box(
                    Modifier.size(width = 160.dp, height = 120.dp).clip(forma).background(c.elevada)
                        .clickable(onClickLabel = if (b != null) "Ampliar ${a.nome}" else "Tentar de novo") { if (b != null) cheia = true else tentativa++ },
                    contentAlignment = Alignment.Center,
                ) {
                    if (b != null) Image(b.asImageBitmap(), a.nome, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else Icon(Icons.Rounded.BrokenImage, "${a.nome} não carregou", tint = c.apoio)
                }
                if (cheia && b != null) {
                    Dialog({ cheia = false }, DialogProperties(usePlatformDefaultWidth = false)) {
                        Box(Modifier.fillMaxSize().background(Color.Black).clickable { cheia = false }, contentAlignment = Alignment.Center) {
                            Image(b.asImageBitmap(), "${a.nome}. Toque para fechar.", Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                        }
                    }
                }
            } else {
                Row(
                    Modifier.heightIn(min = 40.dp).clip(forma).background(Color.Black.copy(alpha = 0.08f)).padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.AttachFile, null, tint = cor, modifier = Modifier.size(16.dp))
                    Text(a.nome, style = Texto.apoio, color = c.invTexto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp).widthIn(max = 180.dp))
                }
            }
        }
    }
}
