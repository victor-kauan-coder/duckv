package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.draw.alpha
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.pasta
import org.json.JSONObject

private data class Conversa(
    val sid: String, val titulo: String, val cwd: String?, val quando: Long, val origem: String,
    val estado: String? = null, val repo: String? = null, val ramo: String? = null,
) {
    val grupo get() = when (origem) {
        "desktop" -> "app"
        "nuvem", "cowork" -> origem
        else -> "computador"
    }
}

// Filtro por origem: so aparecem as origens que tem alguma conversa.
private val GRUPOS = listOf("todas" to "Todas", "computador" to "Computador", "app" to "App Claude", "nuvem" to "Nuvem", "cowork" to "Cowork")

/** Todas as conversas de uma conta, das mais novas para as mais antigas: do computador, do app Claude, da nuvem e do Cowork. */
@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun TelaHistorico(e: Estado?, contaId: String, aoVoltar: () -> Unit, aoAbrir: (String) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val conta = e?.contas?.find { it.id == contaId }
    var itens by remember { mutableStateOf<List<Conversa>?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var erroNuvem by remember { mutableStateOf<String?>(null) }
    var busca by rememberSaveable { mutableStateOf("") }
    var grupo by rememberSaveable { mutableStateOf("todas") }
    var abrindo by remember { mutableStateOf<String?>(null) }
    var buscando by remember { mutableStateOf(0) }
    LaunchedEffect(contaId, buscando) {
        Hub.mandar(JSONObject().put("t", "historico").put("account", contaId).put("atualizar", buscando > 0)) { er, r ->
            if (er != null || r == null) erro = er ?: "Não consegui buscar as conversas."
            else {
                val a = r.optJSONArray("itens")
                itens = List(a?.length() ?: 0) { i ->
                    val o = a!!.getJSONObject(i)
                    fun txt(k: String) = o.optString(k).ifBlank { null }?.takeIf { !o.isNull(k) }
                    Conversa(o.optString("sid"), o.optString("titulo"), txt("cwd"), o.optLong("mtime"), o.optString("origem"), txt("estado"), txt("repo"), txt("ramo"))
                }
                erroNuvem = r.optJSONObject("nuvem")?.let { n -> if (n.isNull("erro")) null else n.optString("erro").ifBlank { null } }
            }
        }
    }
    Column(Modifier.fillMaxSize().background(c.fundo)) {
        Topo("Todas as conversas", conta?.let { "${it.nome}${it.email?.let { m -> " · $m" } ?: ""}" }, aoVoltar)
        val lista = itens
        when {
            erro != null -> Vazio(NUVEM, erro!!)
            lista == null -> Esqueleto()
            lista.isEmpty() -> Vazio(NUVEM, erroNuvem ?: "Esta conta ainda não tem conversas guardadas.")
            else -> {
                OutlinedTextField(
                    busca, { busca = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    placeholder = { Text("Buscar por título, pasta ou repositório", color = c.apoio) }, singleLine = true,
                    leadingIcon = { Icon(Icons.Rounded.Search, null, tint = c.apoio) },
                    shape = RoundedCornerShape(16.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                )
                val presentes = GRUPOS.filter { (id, _) -> id == "todas" || lista.any { it.grupo == id } }
                if (presentes.size > 2) {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(presentes, key = { it.first }) { (id, rotulo) ->
                            val n = if (id == "todas") lista.size else lista.count { it.grupo == id }
                            Escolha("$rotulo $n", grupo == id, { grupo = id })
                        }
                    }
                }
                if (erroNuvem != null) {
                    Row(
                        Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.superficie).padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(iconeOrigem("nuvem"), null, Modifier.size(18.dp), tint = c.apoio)
                        Text(erroNuvem!!, style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 10.dp))
                    }
                }
                val q = busca.trim().lowercase()
                val vistos = lista.filter { (grupo == "todas" || it.grupo == grupo) && (q.isEmpty() || "${it.titulo} ${it.cwd.orEmpty()} ${it.repo.orEmpty()}".lowercase().contains(q)) }
                androidx.compose.material3.pulltorefresh.PullToRefreshBox(
                    isRefreshing = false, onRefresh = { buscando++ }, modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 32.dp), modifier = Modifier.fillMaxSize().navigationBarsPadding()) {
                        if (vistos.isEmpty()) item { Text("Nada com esse filtro.", style = Texto.apoio, color = c.apoio, modifier = Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center) }
                        var dia = ""
                        for (cv in vistos) {
                            val d = quandoDia(cv.quando)
                            if (d != dia) {
                                dia = d
                                item(key = "dia:$d") { Text(d, style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 14.dp, bottom = 6.dp)) }
                            }
                            item(key = cv.sid) {
                                LinhaConversa(cv, abrindo == cv.sid) {
                                    abrindo = cv.sid
                                    Hub.mandar(JSONObject().put("t", "abrirHistorico").put("account", contaId).put("sid", cv.sid)) { er, r ->
                                        abrindo = null
                                        if (er != null) aviso(er) else r?.optString("instance")?.let(aoAbrir)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Enquanto a lista chega: cinco linhas cinzas no lugar das conversas. */
@Composable
private fun Esqueleto() {
    val c = cores
    val pulso = androidx.compose.animation.core.rememberInfiniteTransition(label = "esqueleto")
    val a by pulso.animateFloat(1f, 0.5f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(700), androidx.compose.animation.core.RepeatMode.Reverse), label = "a")
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp).alpha(a), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        repeat(5) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(c.elevada))
                Column(Modifier.padding(start = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.fillMaxWidth(0.62f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(c.elevada))
                    Box(Modifier.fillMaxWidth(0.36f).height(10.dp).clip(RoundedCornerShape(5.dp)).background(c.elevada))
                }
            }
        }
    }
}

@Composable
private fun LinhaConversa(cv: Conversa, abrindo: Boolean, aoTocar: () -> Unit) {
    val c = cores
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClick = aoTocar).heightIn(min = 60.dp).padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val remota = cv.origem == "nuvem" || cv.origem == "cowork"
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(if (remota) c.cartaoAlto else c.elevada), contentAlignment = Alignment.Center) {
            Icon(iconeOrigem(cv.origem), nomeOrigem(cv.origem), Modifier.size(20.dp), tint = if (remota) c.texto else c.apoio)
        }
        EspacoLargo(14.dp)
        Column(Modifier.weight(1f)) {
            Text(cv.titulo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(cv.repo ?: pasta(cv.cwd).ifEmpty { null }, cv.ramo, hora(cv.quando)).joinToString(" · "),
                style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        when {
            abrindo -> Text("Abrindo", style = Texto.pequeno, color = c.apoio)
            cv.estado == "working" -> Text("Trabalhando", style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.texto)
            cv.estado == "waiting" -> Text("Esperando você", style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.realce)
            else -> Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = c.apoio)
        }
    }
}

/** Tela vazia com uma ilustracao em pixels e uma frase. */
@Composable
fun Vazio(desenho: List<String>, texto: String) {
    val c = cores
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        PixelArte(desenho, Modifier.size(96.dp), mapOf('#' to c.texto, 'o' to c.elevada, 'b' to c.apoio, 'm' to Laranja))
        Text(texto, style = Texto.apoio, color = c.apoio, textAlign = TextAlign.Center)
    }
}

private fun quandoDia(ms: Long): String {
    val hoje = java.util.Calendar.getInstance()
    val d = java.util.Calendar.getInstance().apply { timeInMillis = ms }
    val dias = ((hoje.timeInMillis / 86_400_000) - (ms / 86_400_000)).toInt()
    return when {
        dias == 0 && hoje.get(java.util.Calendar.DAY_OF_YEAR) == d.get(java.util.Calendar.DAY_OF_YEAR) -> "Hoje"
        dias <= 1 -> "Ontem"
        dias < 7 -> diaDaSemana(ms).replaceFirstChar { it.uppercase() }
        else -> java.text.SimpleDateFormat("d 'de' MMMM", java.util.Locale("pt", "BR")).format(java.util.Date(ms))
    }
}
