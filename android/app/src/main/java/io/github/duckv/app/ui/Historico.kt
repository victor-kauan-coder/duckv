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

private data class Conversa(val sid: String, val titulo: String, val cwd: String?, val quando: Long, val desktop: Boolean)

/** Todas as conversas guardadas de uma conta, das mais novas para as mais antigas. */
@Composable
fun TelaHistorico(e: Estado?, contaId: String, aoVoltar: () -> Unit, aoAbrir: (String) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val conta = e?.contas?.find { it.id == contaId }
    var itens by remember { mutableStateOf<List<Conversa>?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var busca by rememberSaveable { mutableStateOf("") }
    var abrindo by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(contaId) {
        Hub.mandar(JSONObject().put("t", "historico").put("account", contaId)) { er, r ->
            if (er != null || r == null) erro = er ?: "Não consegui buscar as conversas."
            else {
                val a = r.optJSONArray("itens")
                itens = List(a?.length() ?: 0) { i ->
                    val o = a!!.getJSONObject(i)
                    Conversa(o.optString("sid"), o.optString("titulo"), o.optString("cwd").ifBlank { null }, o.optLong("mtime"), o.optString("origem") == "desktop")
                }
            }
        }
    }
    Column(Modifier.fillMaxSize().background(c.fundo)) {
        Topo("Todas as conversas", conta?.let { "${it.nome}${it.email?.let { m -> " · $m" } ?: ""}" }, aoVoltar)
        val lista = itens
        when {
            erro != null -> Vazio(NUVEM, erro!!)
            lista == null -> Vazio(NUVEM, "Buscando as conversas no computador.")
            lista.isEmpty() -> Vazio(NUVEM, "Esta conta ainda não tem conversas guardadas neste computador.")
            else -> {
                OutlinedTextField(
                    busca, { busca = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    placeholder = { Text("Buscar por título ou pasta", color = c.apoio) }, singleLine = true,
                    leadingIcon = { Icon(Icons.Rounded.Search, null, tint = c.apoio) },
                    shape = RoundedCornerShape(16.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                )
                val q = busca.trim().lowercase()
                val vistos = lista.filter { q.isEmpty() || it.titulo.lowercase().contains(q) || it.cwd.orEmpty().lowercase().contains(q) }
                LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 32.dp), modifier = Modifier.navigationBarsPadding()) {
                    var dia = ""
                    for (cv in vistos) {
                        val d = quandoDia(cv.quando)
                        if (d != dia) {
                            dia = d
                            item(key = "dia:$d") { Text(d, style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 14.dp, bottom = 6.dp)) }
                        }
                        item(key = cv.sid) {
                            LinhaConversa(cv, Color(conta?.cor ?: 0xFFFF7A1A), abrindo == cv.sid) {
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

@Composable
private fun LinhaConversa(cv: Conversa, cor: Color, abrindo: Boolean, aoTocar: () -> Unit) {
    val c = cores
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClick = aoTocar).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(if (cv.desktop) c.texto else cor))
        EspacoLargo(12.dp)
        Column(Modifier.weight(1f)) {
            Text(cv.titulo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(pasta(cv.cwd).ifEmpty { null }, hora(cv.quando), if (cv.desktop) "Claude desktop" else null).joinToString(" · "),
                style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (abrindo) Text("Abrindo", style = Texto.pequeno, color = c.apoio)
        else Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = c.apoio)
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
