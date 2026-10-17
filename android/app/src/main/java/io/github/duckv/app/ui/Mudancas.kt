package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Difference
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.FolderOff
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Hub
import io.github.duckv.app.Sessao
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

// ------------------------------------------------------------ mudancas (o diff da pasta da sessao)
// A tela "Mudancas" da sessao: a lista de arquivos com as linhas somadas e tiradas e, abaixo, o diff de
// cada um. Tocar numa linha abre um campo de comentario; os comentarios juntados vao para a sessao numa
// mensagem so, pela mesma rota das mensagens (que passa pelo filtro do computador).

private data class LinhaDiff(val t: Char, val x: String, val a: Int?, val n: Int?) {
    val num get() = if (t == '-') a else n
}
private data class TrechoDiff(val cab: String, val linhas: List<LinhaDiff>)
private data class ArquivoDiff(val caminho: String, val somadas: Int, val tiradas: Int, val estado: String, val grande: Boolean, val binario: Boolean, val trechos: List<TrechoDiff>)
private data class Diff(val git: Boolean, val msg: String, val ramo: String, val erro: String?, val grande: Boolean, val arquivos: List<ArquivoDiff>, val somadas: Int, val tiradas: Int)
private data class Comentario(val caminho: String, val t: Char, val num: Int, val x: String, val texto: String)

private fun <T> JSONArray?.lista(f: (JSONObject) -> T): List<T> = if (this == null) emptyList() else List(length()) { f(getJSONObject(it)) }
private fun JSONObject.intOuNull(k: String): Int? = if (has(k) && !isNull(k)) optInt(k) else null

private fun lerDiff(m: JSONObject) = Diff(
    git = m.optBoolean("git"),
    msg = m.optString("msg"),
    ramo = m.optString("ramo"),
    erro = m.optString("erro").ifBlank { null },
    grande = m.optBoolean("grande"),
    arquivos = m.optJSONArray("arquivos").lista { f ->
        ArquivoDiff(
            f.optString("caminho"), f.optInt("somadas"), f.optInt("tiradas"), f.optString("estado"), f.optBoolean("grande"), f.optBoolean("binario"),
            f.optJSONArray("trechos").lista { h -> TrechoDiff(h.optString("cab"), h.optJSONArray("linhas").lista { l -> LinhaDiff(l.optString("t", " ").firstOrNull() ?: ' ', l.optString("x"), l.intOuNull("a"), l.intOuNull("n")) }) },
        )
    },
    somadas = m.optInt("somadas"),
    tiradas = m.optInt("tiradas"),
)

private val ESTADO_ARQUIVO = mapOf("novo" to "Novo", "apagado" to "Apagado", "renomeado" to "Renomeado")
private val CAB = Regex("""^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$""")

/** "@@ -12,7 +12,9 @@ fun x" vira "Linhas 12 a 20 · fun x" (as de depois; num arquivo apagado, as de antes). */
private fun tituloDoTrecho(cab: String): String {
    val m = CAB.find(cab) ?: return cab
    val g = m.groupValues
    val depois = g[4].ifEmpty { "1" }.toInt()
    val (ini, qtd) = if (depois > 0) g[3].toInt() to depois else g[1].toInt() to g[2].ifEmpty { "1" }.toInt()
    val faixa = if (qtd > 1) "Linhas $ini a ${ini + qtd - 1}" else "Linha $ini"
    return if (g[5].isNotBlank()) "$faixa · ${g[5].trim()}" else faixa
}

private fun linhaDoComentario(c: Comentario) =
    "No arquivo ${c.caminho}, linha ${c.num} (${if (c.t == ' ') "" else "${c.t} "}\"${c.x.trim().take(200)}\"): ${c.texto}"

@Composable
private fun Numeros(somadas: Int, tiradas: Int) {
    val c = cores
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("+$somadas", style = Texto.codigo.copy(fontWeight = FontWeight.Medium), color = if (somadas > 0) c.ok else c.apoio)
        Text("−$tiradas", style = Texto.codigo.copy(fontWeight = FontWeight.Medium), color = if (tiradas > 0) c.perigo else c.apoio)
    }
}

@Composable
private fun SeloEstado(estado: String) {
    val rotulo = ESTADO_ARQUIVO[estado] ?: return
    val c = cores
    Text(rotulo, style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.apoio, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(c.cartaoAlto).padding(horizontal = 8.dp, vertical = 2.dp))
}

@Composable
fun Mudancas(s: Sessao, cor: Color) {
    val c = cores
    val aviso = LocalAviso.current
    var diff by remember(s.id) { mutableStateOf<Diff?>(null) }
    var carregando by remember(s.id) { mutableStateOf(false) }
    var erro by remember(s.id) { mutableStateOf<String?>(null) }
    val comentarios = remember(s.id) { mutableStateMapOf<String, Comentario>() }
    val fechados = remember(s.id) { mutableStateMapOf<String, Boolean>() }
    var editando by remember(s.id) { mutableStateOf<String?>(null) }
    var rascunho by remember(s.id) { mutableStateOf("") }
    var enviando by remember { mutableStateOf(false) }
    val carregar = {
        if (!carregando) {
            carregando = true
            erro = null
            Hub.mandar(JSONObject().put("t", "diff").put("instance", s.id)) { e, r ->
                carregando = false
                if (e != null) erro = e else if (r != null) diff = lerDiff(r)
            }
        }
    }
    // le ao abrir e de novo quando o agente termina um turno
    var statusAntes by remember(s.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(s.id) { carregar() }
    LaunchedEffect(s.status) {
        val antes = statusAntes
        statusAntes = s.status
        if ((antes == "working" || antes == "waiting") && s.status != "working" && s.status != "waiting") carregar()
    }
    val lista = rememberLazyListState()
    val escopo = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp).heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
            val d = diff
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                when {
                    d == null -> Text(if (carregando) "Lendo as mudanças" else "", style = Texto.apoio, color = c.apoio)
                    !d.git -> Text("Sem repositório git", style = Texto.apoio, color = c.apoio)
                    else -> {
                        Text(if (d.arquivos.isEmpty()) "Nada mudou" else if (d.arquivos.size == 1) "1 arquivo mudou" else "${d.arquivos.size} arquivos mudaram", style = Texto.rotulo, color = c.texto)
                        if (d.arquivos.isNotEmpty()) Numeros(d.somadas, d.tiradas)
                    }
                }
            }
            IconButton(carregar, enabled = !carregando) { Icon(Icons.Rounded.Refresh, "Ler as mudanças de novo", tint = if (carregando) c.vazio else c.apoio) }
        }
        Divisoria()
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val d = diff
            when {
                d == null && erro != null -> Vazio(Icons.Rounded.WarningAmber, if (erro!!.startsWith("Sem conexão")) "Sem conexão com o computador" else "Não deu para ler as mudanças", if (erro!!.startsWith("Sem conexão")) "Assim que o celular reconectar, tente de novo." else erro!!) {
                    Botao("Tentar de novo", carregar, icone = Icons.Rounded.Refresh, peso = Peso.Quieto)
                }
                d == null -> Vazio(Icons.Rounded.Difference, "Lendo as mudanças", "Comparando a pasta da sessão com o último commit.")
                !d.git -> Vazio(Icons.Rounded.FolderOff, "Esta pasta não usa git", d.msg.ifBlank { "Sem git não dá para saber o que o agente mudou." })
                d.erro != null -> Vazio(Icons.Rounded.WarningAmber, "O git não respondeu", d.erro)
                d.arquivos.isEmpty() -> Vazio(Icons.Rounded.CheckCircle, "Nada mudou desde o último commit", "Quando o agente mexer em algum arquivo desta pasta, a mudança aparece aqui.")
                else -> LazyColumn(Modifier.fillMaxSize(), state = lista, contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 24.dp)) {
                    item(key = "lista") {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao).padding(vertical = 4.dp)) {
                            d.arquivos.forEachIndexed { i, f ->
                                Row(
                                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button, onClickLabel = "Ir para o arquivo") {
                                        fechados.remove(f.caminho)
                                        // a posicao do arquivo: depois da lista, cada um ocupa o cabecalho e as linhas
                                        var pos = 1
                                        for (o in d.arquivos.take(i)) pos += 1 + if (fechados[o.caminho] == true || o.grande || o.trechos.isEmpty()) 1 else o.trechos.sumOf { 1 + it.linhas.size }
                                        escopo.launch { lista.animateScrollToItem(pos) }
                                    }.padding(horizontal = 16.dp),
                                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Text(f.caminho, style = Texto.codigo, color = c.texto, maxLines = 1, overflow = TextOverflow.StartEllipsis, modifier = Modifier.weight(1f))
                                    SeloEstado(f.estado)
                                    Numeros(f.somadas, f.tiradas)
                                }
                            }
                        }
                        if (d.grande) Text("O diff inteiro é grande demais: alguns arquivos aparecem só com os números.", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 8.dp))
                    }
                    for (f in d.arquivos) {
                        val fechado = fechados[f.caminho] == true
                        item(key = "cab:" + f.caminho) {
                            Row(
                                Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp, bottomStart = if (fechado) 12.dp else 0.dp, bottomEnd = if (fechado) 12.dp else 0.dp))
                                    .background(c.superficie).border(1.dp, c.linha, RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp, bottomStart = if (fechado) 12.dp else 0.dp, bottomEnd = if (fechado) 12.dp else 0.dp))
                                    .clickable(role = Role.Button, onClickLabel = if (fechado) "Abrir" else "Recolher") { fechados[f.caminho] = !fechado }
                                    .heightIn(min = 48.dp).padding(horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(if (fechado) Icons.Rounded.KeyboardArrowRight else Icons.Rounded.KeyboardArrowDown, null, tint = c.apoio, modifier = Modifier.size(20.dp))
                                Text(f.caminho, style = Texto.codigo, color = c.texto, maxLines = 2, overflow = TextOverflow.StartEllipsis, modifier = Modifier.weight(1f))
                                SeloEstado(f.estado)
                                Numeros(f.somadas, f.tiradas)
                            }
                        }
                        if (fechado) continue
                        if (f.grande || f.trechos.isEmpty()) {
                            item(key = "grande:" + f.caminho) {
                                Text(
                                    when {
                                        f.binario -> "Arquivo binário: mudou, mas não dá para mostrar as linhas."
                                        f.grande -> "Mudou, grande demais para mostrar aqui."
                                        f.estado == "novo" -> "Arquivo novo, vazio."
                                        else -> "Só mudou a permissão ou o nome do arquivo."
                                    },
                                    style = Texto.apoio, color = c.apoio,
                                    modifier = Modifier.fillMaxWidth().background(c.superficie).padding(12.dp),
                                )
                            }
                            continue
                        }
                        f.trechos.forEachIndexed { ti, h ->
                            item(key = "h:${f.caminho}:$ti") {
                                Text(tituloDoTrecho(h.cab), style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.apoio, modifier = Modifier.fillMaxWidth().background(c.cartao).padding(horizontal = 12.dp, vertical = 6.dp))
                            }
                            items(h.linhas, key = { l -> "l:${f.caminho}:$ti:${l.t}:${l.a}:${l.n}" }) { l ->
                                val num = l.num ?: 0
                                val chave = "${f.caminho}|${l.t}|$num"
                                val feito = comentarios[chave]
                                LinhaDoDiff(l) {
                                    editando = chave
                                    rascunho = feito?.texto ?: ""
                                }
                                if (feito != null && editando != chave) {
                                    Row(Modifier.fillMaxWidth().background(c.invFundo).padding(start = 14.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(feito.texto, style = Texto.apoio, color = c.invTexto, modifier = Modifier.weight(1f).padding(vertical = 10.dp))
                                        IconButton({ editando = chave; rascunho = feito.texto }) { Icon(Icons.Rounded.Edit, "Editar este comentário", tint = c.invTexto) }
                                        IconButton({ comentarios.remove(chave) }) { Icon(Icons.Rounded.Close, "Tirar este comentário", tint = c.invTexto) }
                                    }
                                }
                                if (editando == chave) {
                                    val foco = remember { FocusRequester() }
                                    // com o teclado aberto, o campo e os botoes sobem para ficar a vista
                                    val aVista = remember { androidx.compose.foundation.relocation.BringIntoViewRequester() }
                                    @OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
                                    val teclado = WindowInsets.isImeVisible
                                    LaunchedEffect(Unit) { runCatching { foco.requestFocus() } }
                                    LaunchedEffect(teclado) {
                                        kotlinx.coroutines.delay(200)
                                        aVista.bringIntoView()
                                    }
                                    Column(Modifier.fillMaxWidth().bringIntoViewRequester(aVista).background(c.elevada).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("Comentário sobre a linha $num", style = Texto.rotulo, color = c.apoio)
                                        OutlinedTextField(
                                            rascunho, { rascunho = it }, Modifier.fillMaxWidth().focusRequester(foco), minLines = 2, maxLines = 6,
                                            textStyle = Texto.corpo.copy(color = c.texto), shape = RoundedCornerShape(12.dp),
                                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = c.texto, unfocusedBorderColor = c.linha, cursorColor = c.primario, focusedContainerColor = c.superficie, unfocusedContainerColor = c.superficie),
                                        )
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                                            Botao("Cancelar", { editando = null }, peso = Peso.Quieto)
                                            Botao(if (feito != null) "Salvar" else "Adicionar", {
                                                val t = rascunho.trim()
                                                if (t.isEmpty()) comentarios.remove(chave) else comentarios[chave] = Comentario(f.caminho, l.t, num, l.x, t)
                                                editando = null
                                            }, peso = Peso.Principal)
                                        }
                                    }
                                }
                            }
                        }
                        item(key = "fim:" + f.caminho) { Box(Modifier.fillMaxWidth().heightIn(min = 1.dp).background(c.linha)) }
                    }
                }
            }
        }
        if (comentarios.isNotEmpty()) {
            Divisoria()
            Column(Modifier.fillMaxWidth().background(c.fundo).navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val n = comentarios.size
                Text(if (!s.podeEnviar) "Esta sessão não recebe mensagens agora." else if (n == 1) "1 comentário pronto" else "$n comentários prontos", style = Texto.apoio, color = c.apoio)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Botao("Descartar", { comentarios.clear() }, peso = Peso.Quieto)
                    Botao(if (n == 1) "Enviar 1 comentário" else "Enviar $n comentários", {
                        enviando = true
                        Hub.enviar(s.id, comentarios.values.toList().joinToString("\n\n", transform = ::linhaDoComentario)) { e, _ ->
                            enviando = false
                            aviso(e ?: "Comentários enviados para a sessão")
                            if (e == null) comentarios.clear()
                        }
                    }, Modifier.weight(1f), peso = Peso.Principal, habilitado = s.podeEnviar && !enviando, linhas = 1)
                }
            }
        }
    }
}

/** Uma linha do diff: numero, + ou - escrito e o texto, que quebra para caber na largura do celular. */
@Composable
private fun LinhaDoDiff(l: LinhaDiff, aoTocar: () -> Unit) {
    val c = cores
    val fundo = when (l.t) {
        '+' -> c.ok.copy(alpha = if (c.escuro) 0.16f else 0.12f)
        '-' -> c.perigo.copy(alpha = if (c.escuro) 0.16f else 0.10f)
        else -> c.superficie
    }
    val tipo = when (l.t) { '+' -> "Somada"; '-' -> "Tirada"; else -> "Linha" }
    Row(
        Modifier.fillMaxWidth().background(fundo).heightIn(min = 28.dp)
            .clickable(role = Role.Button, onClickLabel = "Comentar", onClick = aoTocar)
            .semantics { contentDescription = "$tipo ${l.num ?: ""}: ${l.x.trim().ifEmpty { "vazia" }}" },
        verticalAlignment = Alignment.Top,
    ) {
        Text((l.num ?: "").toString(), style = Texto.codigo, color = c.apoio, textAlign = TextAlign.End, modifier = Modifier.width(40.dp).padding(top = 4.dp, end = 6.dp))
        Text(when (l.t) { '+' -> "+"; '-' -> "−"; else -> "" }, style = Texto.codigo.copy(fontWeight = FontWeight.Bold), color = if (l.t == '+') c.ok else c.perigo, textAlign = TextAlign.Center, modifier = Modifier.width(16.dp).padding(top = 4.dp))
        // sem ligaduras: ">=" tem de aparecer como foi escrito
        Text(l.x.ifEmpty { " " }, style = Texto.codigo.copy(fontFeatureSettings = "liga 0, calt 0"), color = c.texto, modifier = Modifier.weight(1f).padding(top = 4.dp, bottom = 4.dp, end = 10.dp))
    }
}

@Composable
private fun Vazio(icone: androidx.compose.ui.graphics.vector.ImageVector, titulo: String, texto: String, acao: (@Composable () -> Unit)? = null) {
    val c = cores
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically)) {
        Icon(icone, null, tint = c.apoio, modifier = Modifier.size(32.dp))
        Text(titulo, style = Texto.rotulo, color = c.texto, textAlign = TextAlign.Center)
        Text(texto, style = Texto.apoio, color = c.apoio, textAlign = TextAlign.Center)
        if (acao != null) Box(Modifier.padding(top = 8.dp)) { acao() }
    }
}

// ------------------------------------------------------------ mensagens na fila
// Enquanto o agente trabalha, o que voce manda espera no computador: cada mensagem vira um cartao "Na fila"
// acima da caixa, com editar e tirar. Elas saem sozinhas quando o turno acaba.
@Composable
fun CartoesNaFila(s: Sessao) {
    if (s.fila.isEmpty()) return
    val c = cores
    val aviso = LocalAviso.current
    var editando by remember(s.id) { mutableStateOf<String?>(null) }
    var texto by remember(s.id) { mutableStateOf(androidx.compose.ui.text.input.TextFieldValue("")) }
    LaunchedEffect(s.fila) { if (editando != null && s.fila.none { it.id == editando }) editando = null }
    // varias na fila: a lista rola, para a conversa nao sumir
    Column(Modifier.fillMaxWidth().heightIn(max = 240.dp).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (item in s.fila) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao).padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 12.dp)) {
                if (editando == item.id) {
                    val foco = remember { FocusRequester() }
                    LaunchedEffect(Unit) { runCatching { foco.requestFocus() } }
                    Text("Editar a mensagem na fila", style = Texto.rotulo, color = c.apoio, modifier = Modifier.padding(top = 8.dp, bottom = 8.dp))
                    OutlinedTextField(
                        texto, { texto = it }, Modifier.fillMaxWidth().padding(end = 12.dp).focusRequester(foco), maxLines = 6,
                        textStyle = Texto.corpo.copy(color = c.texto), shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = c.texto, unfocusedBorderColor = c.linha, cursorColor = c.primario, focusedContainerColor = c.superficie, unfocusedContainerColor = c.superficie),
                    )
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp, end = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                        Botao("Cancelar", { editando = null }, peso = Peso.Quieto)
                        Botao("Salvar", {
                            val t = texto.text.trim()
                            if (t.isEmpty()) aviso("A mensagem ficou vazia. Para desistir dela, toque em Tirar da fila.")
                            else Hub.filaEditar(s.id, item.id, t) { e, _ -> if (e != null) aviso(e) else editando = null }
                        }, peso = Peso.Principal)
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.HourglassTop, null, tint = c.apoio, modifier = Modifier.size(16.dp))
                        Text("Na fila", style = Texto.rotulo, color = c.apoio, modifier = Modifier.padding(start = 6.dp).weight(1f))
                        IconButton({ editando = item.id; texto = androidx.compose.ui.text.input.TextFieldValue(item.texto, androidx.compose.ui.text.TextRange(item.texto.length)) }) { Icon(Icons.Rounded.Edit, "Editar a mensagem na fila", tint = c.apoio) }
                        IconButton({ Hub.filaTirar(s.id, item.id) { e, _ -> aviso(e ?: "Tirada da fila") } }) { Icon(Icons.Rounded.Close, "Tirar da fila", tint = c.apoio) }
                    }
                    Text(item.texto, style = Texto.corpo, color = c.texto, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(end = 12.dp))
                }
            }
        }
    }
}

// ------------------------------------------------------------ busca na conversa

/** O texto buscado na conversa: o texto das mensagens o marca (vazio: sem busca). */
val LocalBusca = androidx.compose.runtime.compositionLocalOf { "" }

/** A barra da busca: campo, contador e anterior/proximo. Os achados ficam marcados no texto da conversa. */
@Composable
fun BarraBusca(texto: String, aoMudar: (String) -> Unit, atual: Int, total: Int, aoAnterior: () -> Unit, aoProximo: () -> Unit, aoFechar: () -> Unit) {
    val c = cores
    val foco = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { foco.requestFocus() } }
    Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            texto, aoMudar, Modifier.weight(1f).focusRequester(foco), singleLine = true,
            placeholder = { Text("Buscar na conversa", color = c.apoio) },
            leadingIcon = { Icon(Icons.Rounded.Search, null, tint = c.apoio) },
            textStyle = Texto.corpo.copy(color = c.texto), shape = RoundedCornerShape(12.dp),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
            keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { aoProximo() }),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = c.texto, unfocusedBorderColor = c.linha, cursorColor = c.primario, focusedContainerColor = c.superficie, unfocusedContainerColor = c.superficie),
        )
        Text(
            if (texto.isBlank()) "" else if (total == 0) "Nenhum" else "${atual + 1} de $total",
            style = Texto.pequeno, color = if (texto.isNotBlank() && total == 0) c.perigo else c.apoio,
            modifier = Modifier.padding(horizontal = 6.dp).semantics { contentDescription = if (total == 0) "Nenhum achado" else "Achado ${atual + 1} de $total" },
        )
        IconButton(aoAnterior, enabled = total > 0) { Icon(Icons.Rounded.KeyboardArrowUp, "Achado anterior", tint = if (total > 0) c.texto else c.vazio) }
        IconButton(aoProximo, enabled = total > 0) { Icon(Icons.Rounded.KeyboardArrowDown, "Próximo achado", tint = if (total > 0) c.texto else c.vazio) }
        IconButton(aoFechar) { Icon(Icons.Rounded.Close, "Fechar a busca", tint = c.texto) }
    }
}

/** Quantas vezes o texto buscado aparece (sem diferenca de maiusculas). */
fun ocorrencias(texto: String, q: String): Int {
    if (q.isBlank()) return 0
    var n = 0
    var i = texto.indexOf(q, ignoreCase = true)
    while (i >= 0) {
        n++
        i = texto.indexOf(q, i + q.length, ignoreCase = true)
    }
    return n
}

// ------------------------------------------------------------ historico e "@"

/** O que voce ja mandou nesta sessao, do mais novo ao mais velho: um toque devolve o texto ao campo. */
@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun FolhaHistorico(itens: List<String>, aoEscolher: (String) -> Unit, aoFechar: () -> Unit) {
    val c = cores
    androidx.compose.material3.ModalBottomSheet(aoFechar, containerColor = c.fundo) {
        Column(Modifier.padding(bottom = 24.dp)) {
            TituloSecao("Mensagens que você mandou", Modifier.padding(horizontal = 20.dp))
            LazyColumn(Modifier.heightIn(max = 480.dp)) {
                items(itens) { t ->
                    Text(
                        t, style = Texto.corpo, color = c.texto, maxLines = 3, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Usar de novo") { aoEscolher(t) }.heightIn(min = 56.dp).padding(horizontal = 20.dp, vertical = 12.dp),
                    )
                }
            }
        }
    }
}

/** A lista do "@": arquivos da pasta da sessao, com o nome em cima e a pasta embaixo. */
@Composable
fun ListaArquivos(itens: List<String>, aoEscolher: (String) -> Unit) {
    val c = cores
    Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.cartao)) {
        Text("Arquivos da pasta", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 2.dp))
        LazyColumn(Modifier.heightIn(max = 264.dp)) {
            items(itens, key = { it }) { caminho ->
                val corte = caminho.lastIndexOf('/')
                Column(Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Citar $caminho") { aoEscolher(caminho) }.heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Text(if (corte >= 0) caminho.substring(corte + 1) else caminho, style = Texto.codigo, color = c.realce, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(if (corte >= 0) caminho.substring(0, corte) else "na raiz da pasta", style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.StartEllipsis)
                }
            }
        }
    }
}

/** O "@palavra" sendo digitado logo antes do cursor: (inicio do @, texto depois dele). */
fun citacaoNoCursor(texto: String, cursor: Int): Pair<Int, String>? {
    val antes = texto.substring(0, cursor.coerceIn(0, texto.length))
    val m = Regex("""(^|\s)@([^\s@]*)$""").find(antes) ?: return null
    return (antes.length - m.groupValues[2].length - 1) to m.groupValues[2]
}

