package io.github.duckv.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardReturn
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.CloseFullscreen
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.PanTool
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.Msg
import io.github.duckv.app.Sessao
import io.github.duckv.app.pasta
import org.json.JSONObject

@Composable
fun TelaSessao(e: Estado?, id: String, pato: String, ferramentas: Boolean, aoVoltar: () -> Unit, aoIrPara: (String) -> Unit = {}, aoNova: (String) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    var aba by rememberSaveable(id) { mutableStateOf("conversa") }
    DisposableEffect(id) {
        Hub.abrir(id)
        onDispose { Hub.fechar(id) }
    }
    BackHandler(aba == "terminal") { aba = "controles" }
    val s = e?.sessoes?.find { it.id == id }
    val conta = s?.let { e.conta(it.conta) }
    val cor = conta?.let { Color(it.cor) } ?: Laranja
    LaunchedEffect(s?.hospedada, aba) { if (aba == "terminal" && s != null && !s.hospedada) aba = "controles" }

    Column(Modifier.fillMaxSize().background(c.fundo).imePadding()) {
        // topo
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 12.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(aoVoltar, Modifier.size(52.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Voltar", tint = c.texto) }
            Column(Modifier.weight(1f)) {
                Text(s?.titulo ?: if (e == null) "Carregando" else "Sessão encerrada", style = Texto.titulo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (s != null && conta != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Marca(cor, tamanho = 8.dp)
                        EspacoLargo(6.dp)
                        Text(listOfNotNull(conta.nome, s.model, pasta(s.cwd).ifEmpty { null }).joinToString(" · "), style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            Pato(s?.let { bichoDaSessao(it) } ?: "dorme", pato, cor, Modifier.width(64.dp).height(50.dp), andar = false)
        }
        if (s == null) {
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(if (e == null) "Buscando a sessão no computador." else "Essa sessão não está mais aberta no computador.", style = Texto.corpo, color = c.apoio, textAlign = TextAlign.Center)
            }
            return@Column
        }
        if (aba != "terminal") Abas(aba, cor) { aba = it }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (aba) {
                "conversa" -> Conversa(s, cor, ferramentas)
                "controles" -> Controles(e, s, cor, { aba = "terminal" }, { aoNova(s.conta) })
                else -> Terminal(s) { aba = "controles" }
            }
        }
        // parte de baixo: pedidos, mensagens rapidas e a caixa de mensagem
        if (aba != "terminal") {
            if (temPedidos(listOf(s))) {
                Box(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp)) {
                    Pedidos(e, listOf(s)) { aba = "terminal" }
                }
            }
            if (aba == "conversa") Escrever(e, s, cor, aoIrPara)
            else Box(Modifier.navigationBarsPadding())
        }
    }
}

@Composable
private fun Abas(aba: String, cor: Color, aoTrocar: (String) -> Unit) {
    val c = cores
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        for ((chave, rotulo, ic) in listOf(Triple("conversa", "Conversa", Icons.Rounded.ChatBubbleOutline), Triple("controles", "Controles", Icons.Rounded.Tune))) {
            val marcada = aba == chave
            Column(
                Modifier.weight(1f).clickable(role = Role.Tab, onClick = { aoTrocar(chave) }),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(Modifier.height(46.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(ic, null, tint = if (marcada) c.texto else c.apoio, modifier = Modifier.size(18.dp))
                    EspacoLargo(8.dp)
                    Text(rotulo, style = Texto.rotulo.copy(fontWeight = if (marcada) FontWeight.SemiBold else FontWeight.Medium), color = if (marcada) c.texto else c.apoio)
                }
                Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).background(if (marcada) cor else Color.Transparent))
            }
        }
    }
    Divisoria()
}

// ------------------------------------------------------------ conversa

@Composable
private fun Conversa(s: Sessao, cor: Color, ferramentas: Boolean) {
    val c = cores
    val todas by Hub.conversa.collectAsState()
    val msgs = remember(todas, ferramentas) { agrupar(if (ferramentas) todas else todas.filter { it.papel != "tool" }) }
    val lista = rememberLazyListState()
    val noFim by remember { derivedStateOf { lista.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= lista.layoutInfo.totalItemsCount - 3 } ?: true } }
    var primeira by remember { mutableStateOf(true) }
    LaunchedEffect(msgs.size) {
        if (msgs.isEmpty()) return@LaunchedEffect
        if (primeira) {
            lista.scrollToItem(msgs.size)
            primeira = false
        } else if (noFim) lista.animateScrollToItem(msgs.size)
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        state = lista,
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { InfoSessao(s, cor) }
        if (msgs.isEmpty()) item {
            Text(
                if (s.hospedada) "A conversa aparece aqui depois da sua primeira mensagem. Se o Claude Code perguntar algo ao abrir, a pergunta surge logo abaixo, com botões."
                else "A conversa aparece aqui assim que a sessão trocar mensagens.",
                style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(vertical = 24.dp),
            )
        }
        items(msgs, key = { it.first().id }) { if (it.size > 1) GrupoFerramentas(it, cor) else Mensagem(it.first(), cor) }
    }
}

@Composable
private fun InfoSessao(s: Sessao, cor: Color) {
    val c = cores
    var abrirTarefas by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.superficie).border(1.dp, c.linha, RoundedCornerShape(14.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PontoStatus(s.status, cor)
            EspacoLargo(10.dp)
            Text(if (s.status == "idle") "Esperando sua mensagem" else oQueFaz(s), style = Texto.rotulo, color = c.texto, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        ContextoDetalhado(s, cor)
        if (s.linhasMais > 0 || s.linhasMenos > 0) Text("Linhas +${s.linhasMais} −${s.linhasMenos}", style = Texto.apoio, color = c.apoio)
        if (s.tarefas.isNotEmpty()) {
            val feitas = s.tarefas.count { it.status == "completed" }
            val emCurso = s.tarefas.any { it.status == "in_progress" }
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { abrirTarefas = !abrirTarefas }.padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Tarefas: $feitas de ${s.tarefas.size}", style = Texto.rotulo, color = c.texto)
                EspacoLargo(12.dp)
                Box(Modifier.weight(1f)) { Celulas(s.tarefas.size, feitas, cor, quenteDe = null, agora = if (emCurso) feitas else -1, altura = 8.dp) }
                Icon(if (abrirTarefas) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, if (abrirTarefas) "Esconder tarefas" else "Mostrar tarefas", tint = c.apoio)
            }
            AnimatedVisibility(abrirTarefas) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (t in s.tarefas) {
                        Row(verticalAlignment = Alignment.Top) {
                            Icon(
                                if (t.status == "completed") Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null,
                                tint = if (t.status == "completed") c.ok else if (t.status == "in_progress") cor else c.vazio,
                                modifier = Modifier.size(18.dp).offset(y = 1.dp),
                            )
                            EspacoLargo(8.dp)
                            Text(
                                t.assunto + if (t.status == "in_progress") " (em andamento)" else "",
                                style = Texto.apoio, color = if (t.status == "completed") c.apoio else c.texto,
                            )
                        }
                    }
                }
            }
        }
    }
}

// Quanto do contexto esta ocupado, do que ele e feito agora e quanto a sessao ja gastou.
@Composable
private fun ContextoDetalhado(s: Sessao, cor: Color) {
    val c = cores
    val ctx = s.ctx
    val u = s.ultima
    if (ctx == null && u == null && s.respostas == 0) return
    var aberto by rememberSaveable(s.id) { mutableStateOf(true) }
    val tamanho = ctx?.tamanho ?: 0L
    // O percentual do Claude Code manda; sem ele, a ultima resposta diz o que esta no contexto.
    val ocupado = when {
        ctx?.pct != null && tamanho > 0 -> (ctx.pct / 100.0 * tamanho).toLong()
        u != null -> u.entrada + u.cw + u.cr + u.saida
        else -> 0L
    }
    val pct = ctx?.pct ?: if (tamanho > 0) ocupado * 100.0 / tamanho else null
    Divisoria()
    Row(Modifier.fillMaxWidth().clickable(onClickLabel = if (aberto) "Esconder detalhes do contexto" else "Mostrar detalhes do contexto") { aberto = !aberto }, verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            Text("Contexto", style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
            Text(
                if (tamanho > 0) "${compacto(ocupado)} de ${compacto(tamanho)} tokens · cabem mais ${compacto(maxOf(0, tamanho - ocupado))}"
                else "${compacto(ocupado)} tokens na última resposta",
                style = Texto.apoio, color = c.apoio,
            )
        }
        if (pct != null) Text("${pct.toInt()}%", style = Texto.numero, color = c.texto)
        Icon(if (aberto) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, null, tint = c.apoio)
    }
    if (pct != null) Celulas(20, minOf(20, kotlin.math.ceil(pct / 5).toInt()), cor, altura = 10.dp)
    if (pct != null && pct >= 80) Text("Quase cheio. Compactar a conversa, em Controles, libera espaço.", style = Texto.apoio.copy(fontWeight = FontWeight.Medium), color = c.realce)
    AnimatedVisibility(aberto) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 6.dp)) {
            if (u != null) {
                val partes = listOf(
                    Triple("Lido do cache", u.cr, cor),
                    Triple("Gravado no cache", u.cw, cor.copy(alpha = 0.5f)),
                    Triple("Sem cache", u.entrada, c.apoio),
                    Triple("Resposta do Claude", u.saida, c.texto),
                )
                val soma = partes.sumOf { it.second }.coerceAtLeast(1)
                Text("Do que é feita a última resposta", style = Texto.pequeno, color = c.apoio)
                Row(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(3.dp)).background(c.linha)) {
                    for ((_, v, corParte) in partes) if (v > 0) Box(Modifier.weight(v.toFloat() / soma).fillMaxSize().background(corParte))
                }
                for ((nome, v, corParte) in partes) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Marca(corParte, tamanho = 10.dp)
                        EspacoLargo(8.dp)
                        Text(nome, style = Texto.apoio, color = c.texto, modifier = Modifier.weight(1f))
                        Text(compacto(v), style = Texto.apoio.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
                        Text("  ${(v * 100 / soma)}%", style = Texto.apoio, color = c.apoio, modifier = Modifier.widthIn(min = 44.dp), textAlign = TextAlign.End)
                    }
                }
            }
            if (s.respostas > 0) {
                val t = s.tokens
                Divisoria()
                Text("Nesta sessão", style = Texto.pequeno, color = c.apoio)
                Text(
                    "${plural(s.respostas, "resposta", "respostas")} · ${compacto(t.novos + t.cr)} tokens processados",
                    style = Texto.rotulo, color = c.texto,
                )
                Text(
                    "Sem cache ${compacto(t.entrada)} · gravado no cache ${compacto(t.cw)} · lido do cache ${compacto(t.cr)} · respostas ${compacto(t.saida)}",
                    style = Texto.apoio, color = c.apoio,
                )
            }
        }
    }
}

// Texto da conversa: separa blocos de codigo e marca negrito e `codigo` no meio do texto.
private val INLINE = Regex("""\*\*([^*]+)\*\*|`([^`]+)`""")

@Composable
private fun textoRico(t: String, c: Cores): AnnotatedString = buildAnnotatedString {
    t.lines().forEachIndexed { i, linhaCrua ->
        if (i > 0) append('\n')
        var linha = linhaCrua
        val titulo = linha.startsWith("#")
        if (titulo) linha = linha.trimStart('#').trim()
        if (linha.trimStart().startsWith("- ") || linha.trimStart().startsWith("* ")) {
            val recuo = linha.length - linha.trimStart().length
            linha = " ".repeat(recuo) + "•  " + linha.trimStart().drop(2)
        }
        if (titulo) pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
        var fim = 0
        for (m in INLINE.findAll(linha)) {
            append(linha.substring(fim, m.range.first))
            if (m.groupValues[1].isNotEmpty()) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(m.groupValues[1]) }
            else withStyle(SpanStyle(fontFamily = Mono, fontSize = 14.sp, background = c.elevada, color = c.realce)) { append(m.groupValues[2]) }
            fim = m.range.last + 1
        }
        append(linha.substring(fim))
        if (titulo) pop()
    }
}

@Composable
private fun Blocos(texto: String, cor: Color) {
    val c = cores
    val partes = remember(texto) { texto.split(Regex("```[^\\n]*\\n?")) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        partes.forEachIndexed { i, parte ->
            if (parte.isBlank()) return@forEachIndexed
            if (i % 2 == 1) {
                Text(
                    parte.trimEnd('\n'), style = Texto.codigo, color = c.texto, softWrap = false,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.elevada)
                        .border(1.dp, c.linha, RoundedCornerShape(10.dp)).horizontalScroll(rememberScrollState()).padding(12.dp),
                )
            } else Text(textoRico(parte.trim(), c), style = Texto.corpo, color = c.texto)
        }
    }
}

@Composable
private fun Mensagem(m: Msg, cor: Color) {
    val c = cores
    when (m.papel) {
        "tool" -> Row(Modifier.padding(start = 4.dp), verticalAlignment = Alignment.Top) {
            Text("›", style = Texto.codigo, color = cor)
            EspacoLargo(8.dp)
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = c.texto)) { append(m.tool ?: "") }
                    if (m.texto.isNotBlank()) { append("  "); append(m.texto) }
                },
                style = Texto.apoio, color = c.apoio, maxLines = 3, overflow = TextOverflow.Ellipsis,
            )
        }
        "image" -> m.img?.let { ImagemDaConversa(it, m.via == "user") }
        "sys" -> Text(m.texto, style = Texto.pequeno, color = c.apoio, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp))
        "user" -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            val forma = RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp)
            Column(
                Modifier.widthIn(max = 520.dp).fillMaxWidth(0.86f, ).wrapIfShort().clip(forma).background(cor.copy(alpha = if (c.escuro) 0.22f else 0.16f)).padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalAlignment = Alignment.End,
            ) {
                SelectionContainer { Blocos(m.texto, cor) }
                if (m.doCelular) Text("Enviada do celular", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 4.dp))
            }
        }
        else -> SelectionContainer { Blocos(m.texto, cor) }
    }
}

// Imagem que apareceu na conversa. Um toque abre em tela cheia.
@Composable
private fun ImagemDaConversa(id: String, doUsuario: Boolean) {
    val c = cores
    val bmp by androidx.compose.runtime.produceState<android.graphics.Bitmap?>(null, id) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { Hub.imagem(id) }
    }
    var cheia by remember { mutableStateOf(false) }
    val forma = RoundedCornerShape(12.dp)
    Box(Modifier.fillMaxWidth(), contentAlignment = if (doUsuario) Alignment.CenterEnd else Alignment.CenterStart) {
        val b = bmp
        if (b == null) {
            Box(Modifier.fillMaxWidth(0.7f).height(160.dp).clip(forma).background(c.elevada).border(1.dp, c.linha, forma), contentAlignment = Alignment.Center) {
                Text("Carregando imagem", style = Texto.pequeno, color = c.apoio)
            }
        } else {
            androidx.compose.foundation.Image(
                b.asImageBitmap(), "Imagem da conversa. Toque para ampliar.",
                Modifier.heightIn(max = 420.dp).fillMaxWidth(0.86f).aspectRatio(b.width.toFloat() / b.height.coerceAtLeast(1)).clip(forma).border(1.dp, c.linha, forma).clickable { cheia = true },
                contentScale = androidx.compose.ui.layout.ContentScale.Fit,
            )
            if (cheia) {
                androidx.compose.ui.window.Dialog({ cheia = false }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
                    Box(Modifier.fillMaxSize().background(Color.Black).clickable { cheia = false }, contentAlignment = Alignment.Center) {
                        androidx.compose.foundation.Image(b.asImageBitmap(), "Imagem ampliada. Toque para fechar.", Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Fit)
                    }
                }
            }
        }
    }
}

// Ferramentas seguidas viram uma linha so, que abre com um toque.
private fun agrupar(msgs: List<Msg>): List<List<Msg>> {
    val out = mutableListOf<MutableList<Msg>>()
    for (m in msgs) {
        val ultimo = out.lastOrNull()
        if (m.papel == "tool" && ultimo != null && ultimo.first().papel == "tool") ultimo.add(m) else out.add(mutableListOf(m))
    }
    return out
}

@Composable
private fun GrupoFerramentas(grupo: List<Msg>, cor: Color) {
    val c = cores
    var aberto by rememberSaveable(grupo.first().id) { mutableStateOf(false) }
    val forma = RoundedCornerShape(12.dp)
    Column(Modifier.fillMaxWidth().clip(forma).border(1.dp, c.linha, forma)) {
        Row(
            Modifier.fillMaxWidth().clickable { aberto = !aberto }.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("${grupo.size} ações", style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
            EspacoLargo(8.dp)
            val ultima = grupo.last()
            Text("· ${ultima.tool} ${ultima.texto}".trim(), style = Texto.apoio, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Icon(if (aberto) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, if (aberto) "Esconder ações" else "Mostrar ações", tint = c.apoio)
        }
        AnimatedVisibility(aberto) {
            Column(Modifier.padding(start = 8.dp, end = 12.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (m in grupo) Mensagem(m, cor)
            }
        }
    }
}

// A bolha do usuario encolhe para o tamanho do texto.
private fun Modifier.wrapIfShort() = this.then(Modifier.width(androidx.compose.foundation.layout.IntrinsicSize.Max))

// ------------------------------------------------------------ escrever

@Composable
private fun Escrever(e: Estado, s: Sessao, cor: Color, aoIrPara: (String) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    var texto by rememberSaveable(s.id) { mutableStateOf("") }
    var enviando by remember { mutableStateOf(false) }
    val enviar = { t: String, ok: String? ->
        Hub.enviar(s.id, t) { erro, _ -> aviso(erro ?: ok ?: return@enviar) }
    }
    Column(Modifier.fillMaxWidth().background(c.fundo).navigationBarsPadding()) {
        Divisoria()
        if (s.desktop) {
            ContinuarDoDesktop(s, aoIrPara)
            return@Column
        }
        if (!s.viva || !s.podeEnviar) {
            Text(
                if (!s.viva) "Sessão encerrada." else "Esta sessão não recebe mensagens do celular. Abra-a pelo atalho da conta, com o claudeV ligado.",
                style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(16.dp),
            )
            return@Column
        }
        val trabalhando = s.hospedada && s.status == "working"
        if (e.prefs.rapidas.isNotEmpty() || trabalhando) {
            LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (trabalhando) item { Botao("Interromper", { Hub.tecla(s.id, "esc") { erro, _ -> aviso(erro ?: "Interrompido") } }, icone = Icons.Rounded.PanTool, altura = 38.dp) }
                items(e.prefs.rapidas) { r -> Botao(r, { enviar(r, "Enviada") }, Modifier.widthIn(max = 240.dp), peso = Peso.Quieto, altura = 38.dp, linhas = 1) }
            }
        }
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(
                texto, { texto = it }, Modifier.weight(1f),
                placeholder = { Text(if (s.hospedada) "Mensagem ou /comando" else "Escreva para o Claude", color = c.apoio) },
                textStyle = Texto.corpo.copy(color = c.texto), maxLines = 6,
                shape = RoundedCornerShape(22.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = c.texto, unfocusedBorderColor = c.linha, cursorColor = Laranja,
                    focusedContainerColor = c.superficie, unfocusedContainerColor = c.superficie,
                ),
            )
            EspacoLargo(8.dp)
            val pode = texto.isNotBlank() && !enviando
            Box(
                Modifier.padding(bottom = 4.dp).size(48.dp).clip(CircleShape).background(if (pode) Laranja else c.linha)
                    .clickable(enabled = pode, role = Role.Button) {
                        enviando = true
                        Hub.enviar(s.id, texto.trim()) { erro, _ ->
                            enviando = false
                            if (erro != null) aviso(erro) else texto = ""
                        }
                    },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Rounded.Send, "Enviar", tint = if (pode) Tinta else c.apoio, modifier = Modifier.size(22.dp)) }
        }
    }
}

/** Sessao do Claude desktop: o celular acompanha; para conversar, retoma a mesma conversa por aqui. */
@Composable
fun ContinuarDoDesktop(s: Sessao, aoAbriu: (String) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    var abrindo by remember { mutableStateOf(false) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            if (s.status == "working") "Esta sessão está trabalhando no Claude desktop. Espere ela terminar para continuar por aqui."
            else "Sessão do Claude desktop. Para mandar mensagens, continue a mesma conversa pelo celular. Feche-a no desktop antes, para as duas não escreverem juntas.",
            style = Texto.apoio, color = c.apoio,
        )
        Botao(
            if (abrindo) "Abrindo" else "Continuar pelo celular",
            {
                abrindo = true
                Hub.mandar(JSONObject().put("t", "start").put("resume", s.sessaoId).put("cols", 60).put("rows", 32)) { erro, r ->
                    abrindo = false
                    if (erro != null) aviso(erro) else r?.optString("instance")?.let(aoAbriu)
                }
            },
            Modifier.fillMaxWidth(), Icons.Rounded.Add, Peso.Principal, habilitado = !abrindo && s.status != "working" && s.sessaoId != null,
        )
    }
}

// ------------------------------------------------------------ controles

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Controles(e: Estado, s: Sessao, cor: Color, aoTerminal: () -> Unit, aoNova: () -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val enviar = { t: String, ok: String -> Hub.enviar(s.id, t) { erro, _ -> aviso(erro ?: ok) } }
    val tecla = { k: String, ok: String -> Hub.tecla(s.id, k) { erro, _ -> aviso(erro ?: ok) } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(26.dp)) {
        if (!s.hospedada) {
            // Sessao do computador: o celular so le os ajustes, entao eles aparecem como leitura.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Leitura(Icons.Rounded.Memory, "Modelo", s.model ?: "não informado", Modifier.weight(1f))
                Leitura(Icons.Rounded.Psychology, "Esforço", ESFORCOS[s.effort] ?: s.effort ?: "padrão", Modifier.weight(1f))
                Leitura(Icons.Rounded.Shield, "Permissões", nomeDoModo(s.modo), Modifier.weight(1f))
            }
            Column {
                if (s.desktop) {
                    TituloSecao("Sessão do Claude desktop")
                    Text("Daqui você acompanha a conversa. Para comandar, toque em Continuar pelo celular, na aba Conversa: a mesma conversa passa a rodar por aqui.", style = Texto.apoio, color = c.apoio)
                    return@Column
                }
                TituloSecao("Sessão aberta no computador")
                Text("Daqui você conversa, usa as mensagens rápidas e responde pedidos de permissão. Para trocar modelo, esforço e modo, interromper ou encerrar pelo celular, abra a sessão por aqui.", style = Texto.apoio, color = c.apoio)
                if (e.host.disponivel) {
                    Espaco(12.dp)
                    Botao("Abrir sessão nesta conta", aoNova, Modifier.fillMaxWidth(), Icons.Rounded.Add, Peso.Principal)
                }
            }
            return@Column
        }
        Column {
            TituloSecao("Ações")
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Botao("Interromper", { tecla("esc", "Interrompido") }, Modifier.weight(1f), Icons.Rounded.PanTool, vertical = true)
                    Botao("Compactar conversa", { enviar("/compact", "Compactação pedida") }, Modifier.weight(1f), Icons.Rounded.CloseFullscreen, vertical = true)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BotaoConfirma("Limpar conversa", Icons.Rounded.CleaningServices, { enviar("/clear", "Conversa limpa") }, Modifier.weight(1f), vertical = true)
                    BotaoConfirma("Encerrar sessão", Icons.Rounded.PowerSettingsNew, {
                        Hub.mandar(JSONObject().put("t", "stop").put("instance", s.id)) { erro, _ -> aviso(erro ?: "Sessão encerrada") }
                    }, Modifier.weight(1f), Peso.Perigo, vertical = true)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(22.dp)) {
            TituloSecao("Ajustes desta sessão", Modifier.padding(bottom = 0.dp))
            val atual = s.model.orEmpty().lowercase()
            // O Claude Code so confirma a troca na proxima leitura; ate la vale o que voce tocou.
            var modeloTocado by remember(s.id, s.model) { mutableStateOf<String?>(null) }
            var esforcoTocado by remember(s.id, s.effort) { mutableStateOf<String?>(null) }
            Column {
                CabecalhoAjuste("Modelo", s.model)
                ListaEscolha(
                    opcoesModelo(e.host.modelos.filter { it != "default" }),
                    modeloTocado ?: e.host.modelos.firstOrNull { it != "opusplan" && it != "default" && atual.contains(it) },
                    { m -> modeloTocado = m; enviar("/model $m", "Modelo trocado para ${MODELOS[m] ?: m}") }, cor = cor,
                )
            }
            Column {
                CabecalhoAjuste("Esforço de raciocínio", null)
                EscalaEsforco(e.host.esforcos, esforcoTocado ?: s.effort.orEmpty(), { ef -> esforcoTocado = ef; enviar("/effort $ef", "Esforço trocado para ${ESFORCOS[ef] ?: ef}") }, comPadrao = false, cor = cor)
            }
            Column {
                CabecalhoAjuste("Permissões", null)
                Cartao {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(nomeDoModo(s.modo), style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
                        Text(
                            if (s.rodape.isNotBlank()) "O Claude Code mostra agora: ${s.rodape}" else MODOS[if (s.modo == "default") "manual" else s.modo]?.second ?: "Cada toque passa para o modo seguinte.",
                            style = Texto.apoio, color = c.apoio,
                        )
                    }
                    Divisoria()
                    Box(Modifier.padding(12.dp)) {
                        Botao("Passar para o próximo modo", { tecla("shift-tab", "Modo trocado") }, Modifier.fillMaxWidth(), Icons.Rounded.Shield)
                    }
                }
                Text("O Claude Code não deixa escolher o modo direto: cada toque passa para o seguinte, como o Shift+Tab.", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 8.dp))
            }
        }
        Column {
            TituloSecao("Avançado")
            Text("A tela crua do Claude Code, com teclas. Serve para as raras perguntas que não viram botão.", style = Texto.apoio, color = c.apoio)
            Espaco(10.dp)
            Botao("Ver a tela do terminal", aoTerminal, Modifier.fillMaxWidth(), Icons.Rounded.Terminal, Peso.Quieto)
        }
    }
}

@Composable
private fun Leitura(icone: ImageVector, rotulo: String, valor: String, modifier: Modifier) {
    val c = cores
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).border(1.dp, c.linha, RoundedCornerShape(12.dp)).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(icone, null, tint = c.apoio, modifier = Modifier.size(18.dp))
        Text(rotulo, style = Texto.pequeno, color = c.apoio)
        Text(valor, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp), color = c.texto, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

// ------------------------------------------------------------ terminal

private val TECLAS: List<Triple<String, String?, ImageVector?>> = listOf(
    Triple("esc", "Esc", null),
    Triple("up", null, Icons.Rounded.KeyboardArrowUp),
    Triple("down", null, Icons.Rounded.KeyboardArrowDown),
    Triple("left", null, Icons.Rounded.KeyboardArrowLeft),
    Triple("right", null, Icons.Rounded.KeyboardArrowRight),
    Triple("tab", "Tab", null),
    Triple("shift-tab", "Shift+Tab", null),
    Triple("enter", null, Icons.AutoMirrored.Rounded.KeyboardReturn),
    Triple("ctrl-c", "Ctrl+C", null),
)

@Composable
private fun Terminal(s: Sessao, aoSair: () -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val tela by Hub.tela.collectAsState()
    val ligado by Hub.ligado.collectAsState()
    val estilo = TextStyle(fontFamily = Mono, fontSize = 12.sp, lineHeight = 15.6.sp, color = Color(0xFFF7EFE8))
    val medidor = rememberTextMeasurer()
    val densidade = LocalDensity.current
    val letra = remember { medidor.measure("MMMMMMMMMM", estilo) }
    val cw = letra.size.width / 10f
    val lh = with(densidade) { 15.6.sp.toPx() }
    var tamanho by remember { mutableStateOf(0 to 0) }
    val pad = with(densidade) { 10.dp.toPx() }
    val cols = ((tamanho.first - 2 * pad) / cw).toInt()
    val rows = ((tamanho.second - 2 * pad) / lh).toInt()
    LaunchedEffect(cols, rows, ligado) {
        if (cols >= 20 && rows > 4 && ligado == true) {
            Hub.mandar(JSONObject().put("t", "term").put("instance", s.id).put("on", true).put("cols", cols).put("rows", rows))
        }
    }
    DisposableEffect(s.id) { onDispose { Hub.mandar(JSONObject().put("t", "term").put("instance", s.id).put("on", false)) } }

    Column(Modifier.fillMaxSize().navigationBarsPadding()) {
        LazyRow(contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Botao("Controles", aoSair, icone = Icons.AutoMirrored.Rounded.ArrowBack, peso = Peso.Quieto, altura = 42.dp) }
            items(TECLAS) { (k, rotulo, ic) ->
                Botao(rotulo, { Hub.tecla(s.id, k) { erro, _ -> if (erro != null) aviso(erro) } }, icone = ic, altura = 42.dp, descricao = rotulo ?: k)
            }
        }
        Box(
            Modifier.fillMaxSize().padding(start = 12.dp, end = 12.dp, bottom = 12.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF120D0A))
                .onSizeChanged { tamanho = it.width to it.height },
        ) {
            val t = tela
            if (t == null) {
                Text("Carregando a tela…", style = estilo, modifier = Modifier.padding(10.dp))
            } else {
                Text(t.linhas.joinToString("\n"), style = estilo, softWrap = false, maxLines = Int.MAX_VALUE, modifier = Modifier.padding(10.dp))
                with(densidade) {
                    Box(
                        Modifier.offset(x = (pad + t.cx * cw).toDp(), y = (pad + t.cy * lh).toDp())
                            .size(cw.toDp(), lh.toDp()).background(Laranja.copy(alpha = 0.7f)),
                    )
                }
            }
        }
    }
}
