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
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Replay
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
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Description
import androidx.compose.ui.focus.focusRequester
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
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
    // Entrar numa conta de outro agente acontece na tela do terminal.
    LaunchedEffect(s?.login) { if (s?.login == true) aba = "terminal" }
    val ag = e?.agente(s?.agente ?: conta?.agente)

    Column(Modifier.fillMaxSize().background(c.fundo).imePadding()) {
        // topo
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 12.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(aoVoltar, Modifier.size(52.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Voltar", tint = c.texto) }
            Column(Modifier.weight(1f)) {
                Text(s?.titulo ?: if (e == null) "Carregando" else "Sessão encerrada", style = Texto.titulo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (s != null && conta != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // o agente desta sessao, sempre a vista
                        if (ag != null) AgenteIcone(ag, 14.dp) else Marca(cor, tamanho = 8.dp)
                        EspacoLargo(6.dp)
                        Text(listOfNotNull(conta.nome, ag?.curto, s.model, pasta(s.cwd).takeIf { it.isNotEmpty() && it != s.titulo }).joinToString(" · "), style = Texto.pequeno, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            Pato(s?.let { bichoDaSessao(it) } ?: "dorme", pato, cor, Modifier.width(64.dp).height(50.dp), andar = false, tipo = conta?.pato)
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
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
private fun Abas(aba: String, cor: Color, aoTrocar: (String) -> Unit) {
    val c = cores
    val abas = listOf(Triple("conversa", "Conversa", Icons.Rounded.ChatBubbleOutline), Triple("controles", "Controles", Icons.Rounded.Tune))
    androidx.compose.material3.PrimaryTabRow(
        abas.indexOfFirst { it.first == aba }.coerceAtLeast(0), containerColor = c.fundo, contentColor = c.texto,
        indicator = {
            androidx.compose.material3.TabRowDefaults.PrimaryIndicator(
                Modifier.tabIndicatorOffset(abas.indexOfFirst { it.first == aba }.coerceAtLeast(0), matchContentSize = true),
                width = androidx.compose.ui.unit.Dp.Unspecified, color = c.primario,
            )
        },
        divider = { Divisoria() },
    ) {
        for ((chave, rotulo, ic) in abas) {
            androidx.compose.material3.Tab(
                aba == chave, { aoTrocar(chave) },
                text = { Text(rotulo, style = Texto.rotulo) },
                icon = { Icon(ic, null, Modifier.size(20.dp)) },
                selectedContentColor = c.texto, unselectedContentColor = c.apoio,
            )
        }
    }
}

// ------------------------------------------------------------ conversa

@Composable
private fun Conversa(s: Sessao, cor: Color, ferramentas: Boolean) {
    val c = cores
    val todas by Hub.conversa.collectAsState()
    val msgs = remember(todas, ferramentas) { agrupar(if (ferramentas) todas else todas.filter { it.papel != "tool" }) }
    val pend by Hub.aCaminho.collectAsState()
    val enviadas = remember(todas) { todas.filter { it.papel == "user" }.map { it.texto.trim() }.toSet() }
    val acaminho = pend.filter { it.first == s.id && it.second.trim() !in enviadas }.map { it.second }.distinct()
    // Quando a mensagem aparece de verdade, sai da lista de "a caminho".
    LaunchedEffect(enviadas) { Hub.aCaminho.value = Hub.aCaminho.value.filterNot { it.first == s.id && it.second.trim() in enviadas } }
    // copiar e reenviar: um toque em cada mensagem
    val area = androidx.compose.ui.platform.LocalClipboardManager.current
    val aviso = LocalAviso.current
    val copiar = { t: String ->
        area.setText(androidx.compose.ui.text.AnnotatedString(semMarcaVoz(t)))
        aviso("Copiada")
    }
    val podeReenviar = s.viva && s.podeEnviar && !s.desktop
    val reenviar = { t: String ->
        Hub.enviar(s.id, t) { erro, _ ->
            if (erro != null) aviso(erro) else Hub.aCaminho.value = Hub.aCaminho.value + (s.id to t)
        }
    }
    // editar: o texto volta para o campo, para mudar e mandar de novo
    val editar = { t: String -> Hub.rascunho.value = s.id to t }
    val tirarDaFila = { t: String ->
        Hub.aCaminho.value = Hub.aCaminho.value.filterNot { it.first == s.id && it.second == t }
        Hub.mandar(org.json.JSONObject().put("t", "desistir").put("instance", s.id)) { erro, _ -> aviso(erro ?: "Mensagem tirada da fila") }
    }
    val lista = rememberLazyListState()
    val noFim by remember { derivedStateOf { lista.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= lista.layoutInfo.totalItemsCount - 3 } ?: true } }
    var primeira by remember { mutableStateOf(true) }
    LaunchedEffect(msgs.size + acaminho.size) {
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
        if (msgs.isEmpty() && acaminho.isEmpty()) item {
            PixelArte(FAISCA, Modifier.fillMaxWidth().height(40.dp).padding(top = 20.dp), mapOf('o' to cor))
            Text(
                if (s.hospedada) "A conversa aparece aqui depois da sua primeira mensagem. Se o agente perguntar algo ao abrir, a pergunta surge logo abaixo, com botões."
                else "A conversa aparece aqui assim que a sessão trocar mensagens.",
                style = Texto.apoio, color = c.apoio, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
            )
        }
        itemsIndexed(msgs, key = { _, g -> g.first().id }) { i, g ->
            if (g.size > 1) GrupoFerramentas(g, cor)
            else {
                // a resposta ganha "Copiar" no fim de cada vez que o agente fala
                // o ultimo texto antes da proxima mensagem sua (as ferramentas no meio nao contam)
                val fimDaFala = msgs.drop(i + 1).firstOrNull { it.first().papel != "tool" }?.first()?.papel.let { it == null || it == "user" }
                Mensagem(g.first(), cor, aoCopiar = copiar, aoReenviar = if (podeReenviar) reenviar else null, aoEditar = if (podeReenviar) editar else null, fimDaFala = fimDaFala)
            }
        }
        // Mensagens aceitas pelo computador que o Claude Code ainda nao registrou: aparecem na hora, esmaecidas.
        items(acaminho, key = { "pend:" + it }) { t -> MensagemACaminho(t, cor, aoCopiar = copiar, aoTirar = if (s.hospedada) tirarDaFila else null) }
    }
}

@Composable
private fun InfoSessao(s: Sessao, cor: Color) {
    val c = cores
    var abrirTarefas by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao).padding(16.dp),
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
private fun ContextoDetalhado(s: Sessao, cor: Color, sempreAberto: Boolean = false) {
    val c = cores
    val ctx = s.ctx
    val u = s.ultima
    if (ctx == null && u == null && s.respostas == 0) {
        if (sempreAberto) Text("O contexto aparece depois da primeira resposta nesta sessão.", style = Texto.apoio, color = c.apoio)
        return
    }
    // fechado ao abrir a conversa: as mensagens vem primeiro; o detalhe abre num toque
    var aberto by rememberSaveable(s.id) { mutableStateOf(false) }
    if (sempreAberto) aberto = true
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
                    Triple("Resposta", u.saida, c.vazio),
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
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.cartaoAlto)
                        .horizontalScroll(rememberScrollState()).padding(12.dp),
                )
            } else {
                // Tabelas em markdown viram grade; o resto e texto corrido.
                for (t in remember(parte) { trechos(parte.trim()) }) when (t) {
                    is Trecho.Tabela -> TabelaMarkdown(t, cor)
                    is Trecho.Texto -> Text(textoRico(t.texto.trim(), c), style = Texto.corpo, color = c.texto)
                }
            }
        }
    }
}

@Composable
private fun Mensagem(m: Msg, cor: Color, aoCopiar: (String) -> Unit = {}, aoReenviar: ((String) -> Unit)? = null, aoEditar: ((String) -> Unit)? = null, fimDaFala: Boolean = false) {
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
        // arquivo que o computador mandou nesta conversa
        "file" -> {
            val e = Hub.estado.collectAsState().value
            val a = e?.arquivos?.find { it.id == m.arq }
            if (a != null) CartaoArquivo(e, a)
            else Text("Arquivo enviado ao celular (já saiu da lista de arquivos).", style = Texto.pequeno, color = c.apoio)
        }
        "sys" -> Text(m.texto, style = Texto.pequeno, color = c.apoio, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp))
        "user" -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
            val forma = RoundedCornerShape(20.dp, 20.dp, 4.dp, 20.dp)
            Column(
                Modifier.widthIn(max = 520.dp).fillMaxWidth(0.86f).wrapIfShort().clip(forma).background(c.invFundo).padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalAlignment = Alignment.End,
            ) {
                if (ehVoz(m.texto)) SeloVoz(c.invApoio)
                SelectionContainer { Blocos(semMarcaVoz(m.texto), cor) }
                if (m.doCelular) Text("Enviada do celular", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 4.dp))
            }
            AcoesMensagem(Alignment.End) {
                AcaoMensagem(Icons.Rounded.ContentCopy, "Copiar") { aoCopiar(m.texto) }
                if (aoEditar != null) AcaoMensagem(Icons.Rounded.Edit, "Editar") { aoEditar(m.texto) }
                if (aoReenviar != null) AcaoMensagem(Icons.Rounded.Replay, "Reenviar") { aoReenviar(m.texto) }
            }
        }
        else -> Column {
            SelectionContainer { Blocos(m.texto, cor) }
            if (fimDaFala && m.texto.isNotBlank()) AcoesMensagem(Alignment.Start) { AcaoMensagem(Icons.Rounded.ContentCopy, "Copiar") { aoCopiar(m.texto) } }
        }
    }
}

// Imagem que apareceu na conversa. Um toque abre em tela cheia.
@Composable
private fun ImagemDaConversa(id: String, doUsuario: Boolean) {
    val c = cores
    // null: carregando; falhou: nao veio (imagem antiga que o computador ja nao guarda, ou sem conexao)
    var tentativa by remember(id) { mutableStateOf(0) }
    var falhou by remember(id) { mutableStateOf(false) }
    val bmp by androidx.compose.runtime.produceState<android.graphics.Bitmap?>(null, id, tentativa) {
        falhou = false
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { Hub.imagem(id) }
        falhou = value == null
    }
    var cheia by remember { mutableStateOf(false) }
    val forma = RoundedCornerShape(12.dp)
    Box(Modifier.fillMaxWidth(), contentAlignment = if (doUsuario) Alignment.CenterEnd else Alignment.CenterStart) {
        val b = bmp
        if (b == null) {
            Box(
                Modifier.fillMaxWidth(0.7f).height(160.dp).clip(forma).background(c.elevada).border(1.dp, c.linha, forma)
                    .clickable(enabled = falhou, onClickLabel = "Tentar de novo") { tentativa++ },
                contentAlignment = Alignment.Center,
            ) {
                Text(if (falhou) "A imagem não carregou. Toque para tentar de novo." else "Carregando imagem", style = Texto.pequeno, color = c.apoio, textAlign = TextAlign.Center, modifier = Modifier.padding(12.dp))
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

@Composable
private fun MensagemACaminho(t: String, cor: Color, aoCopiar: (String) -> Unit = {}, aoTirar: ((String) -> Unit)? = null) {
    val c = cores
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
        Column(
            Modifier.widthIn(max = 520.dp).fillMaxWidth(0.86f).wrapIfShort().clip(RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp))
                .background(cor.copy(alpha = if (c.escuro) 0.12f else 0.08f)).border(1.dp, cor.copy(alpha = 0.35f), RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.End,
        ) {
            if (ehVoz(t)) SeloVoz(c.apoio)
            Text(semMarcaVoz(t), style = Texto.corpo, color = c.texto.copy(alpha = 0.75f))
            Text("Enviando", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 4.dp))
        }
        AcoesMensagem(Alignment.End) {
            AcaoMensagem(Icons.Rounded.ContentCopy, "Copiar") { aoCopiar(t) }
            if (aoTirar != null) AcaoMensagem(Icons.Rounded.Close, "Tirar da fila") { aoTirar(t) }
        }
    }
}

/** Fileira discreta de acoes embaixo de uma mensagem. */
@Composable
private fun AcoesMensagem(lado: Alignment.Horizontal, conteudo: @Composable () -> Unit) {
    Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(2.dp, lado)) { conteudo() }
}

/** Uma acao da mensagem: icone pequeno e rotulo curto, com alvo de toque de 40 dp. */
@Composable
private fun AcaoMensagem(icone: androidx.compose.ui.graphics.vector.ImageVector, rotulo: String, aoTocar: () -> Unit) {
    val c = cores
    Row(
        Modifier.clip(RoundedCornerShape(20.dp)).clickable(role = Role.Button, onClick = aoTocar).heightIn(min = 40.dp).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icone, null, tint = c.apoio, modifier = Modifier.size(16.dp))
        Text(rotulo, style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.apoio, modifier = Modifier.padding(start = 6.dp))
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
    Column(Modifier.fillMaxWidth().clip(forma).background(c.cartao)) {
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
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
private fun Escrever(e: Estado, s: Sessao, cor: Color, aoIrPara: (String) -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    // TextFieldValue para escolher um comando da lista e deixar o cursor no fim
    var campo by rememberSaveable(s.id, stateSaver = androidx.compose.ui.text.input.TextFieldValue.Saver) { mutableStateOf(androidx.compose.ui.text.input.TextFieldValue("")) }
    val texto = campo.text
    val mudarTexto = { t: String -> campo = androidx.compose.ui.text.input.TextFieldValue(t, androidx.compose.ui.text.TextRange(t.length)) }
    var enviando by remember { mutableStateOf(false) }
    val anexos = remember(s.id) { androidx.compose.runtime.mutableStateListOf<Pair<String, String>>() }
    var subindo by remember { mutableStateOf(0) }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val subir = { uris: List<android.net.Uri> ->
        for (u in uris.take(10)) {
            subindo++
            kotlin.concurrent.thread {
                val r = Hub.anexar(ctx, u)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    subindo--
                    r.onSuccess { anexos.add(it) }.onFailure { aviso(it.message ?: "Não consegui anexar o arquivo.") }
                }
            }
        }
    }
    // anexar, como no WhatsApp: camera, galeria ou qualquer arquivo
    val escolher = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.GetMultipleContents()) { subir(it) }
    val galeria = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia(10)) { subir(it) }
    var foto by rememberSaveable { mutableStateOf<String?>(null) }
    val camera = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.TakePicture()) { ok ->
        foto?.let { if (ok) subir(listOf(android.net.Uri.parse(it))) }
        foto = null
    }
    val tirarFoto = {
        // a foto fica no cache do app ate subir para o computador
        val pasta = java.io.File(ctx.cacheDir, "fotos").apply { mkdirs() }
        val nome = "foto-" + java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.US).format(java.util.Date()) + ".jpg"
        val u = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.packageName + ".arquivos", java.io.File(pasta, nome))
        foto = u.toString()
        runCatching { camera.launch(u) }.onFailure { foto = null; aviso("Este celular não tem app de câmera.") }
    }
    var verAnexar by remember { mutableStateOf(false) }
    if (verAnexar) {
        androidx.compose.material3.ModalBottomSheet({ verAnexar = false }, containerColor = c.fundo) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 32.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                OpcaoAnexo(Icons.Rounded.PhotoCamera, "Câmera", cor) { verAnexar = false; tirarFoto() }
                OpcaoAnexo(Icons.Rounded.PhotoLibrary, "Galeria", cor) {
                    verAnexar = false
                    galeria.launch(androidx.activity.result.PickVisualMediaRequest(androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                }
                OpcaoAnexo(Icons.Rounded.Description, "Arquivo", cor) { verAnexar = false; escolher.launch("*/*") }
            }
        }
    }
    val acaminho = { t: String -> Hub.aCaminho.value = Hub.aCaminho.value + (s.id to t) }
    // mensagem de voz: o celular transcreve enquanto voce fala
    val vibra = androidx.compose.ui.platform.LocalHapticFeedback.current
    val juntar = { t: String -> mudarTexto(listOf(campo.text.trim(), t).filter { it.isNotBlank() }.joinToString(" ")) }
    // O que voce falou vai para o campo, para conferir antes de enviar; a mensagem sai com o selo de voz.
    var ditou by remember(s.id) { mutableStateOf(false) }
    LaunchedEffect(texto.isBlank()) { if (texto.isBlank()) ditou = false }
    val juntarVoz = { t: String ->
        juntar(t)
        ditou = true
    }
    val ditado = remember(s.id) { Ditado(ctx, { aviso(it) }, { juntarVoz(it) }) }
    // "Editar" numa mensagem: o texto volta para o campo, com o teclado aberto
    val foco = remember { androidx.compose.ui.focus.FocusRequester() }
    val rascunho by Hub.rascunho.collectAsState()
    LaunchedEffect(rascunho) {
        val r = rascunho ?: return@LaunchedEffect
        if (r.first != s.id) return@LaunchedEffect
        Hub.rascunho.value = null
        ditado.cancelar()
        mudarTexto(semMarcaVoz(r.second))
        ditou = ehVoz(r.second)
        runCatching { foco.requestFocus() }
    }
    androidx.compose.runtime.DisposableEffect(s.id) { onDispose { ditado.cancelar() } }
    val comecar = {
        vibra.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
        ditado.iniciar()
    }
    val pedirMic = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { ok ->
        aviso(if (ok) "Pronto. Agora segure o microfone para gravar." else "Sem o microfone não dá para gravar. Libere em Configurações > Apps > duckV > Permissões.")
    }
    // como no WhatsApp: segurando o microfone, a gravacao fica no proprio compositor; ao travar, vira o modo maos livres
    var segurando by remember { mutableStateOf(false) }
    val apertarMic = {
        if (androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            segurando = true
            comecar()
        } else pedirMic.launch(android.Manifest.permission.RECORD_AUDIO)
    }
    // O texto do campo e os anexos numa mensagem so. Le o campo na hora, porque a voz acabou de entrar nele.
    val enviarTudo = enviarTudo@{
        val agora = campo.text
        if ((agora.isBlank() && anexos.isEmpty()) || enviando || subindo > 0) return@enviarTudo
        enviando = true
        // O caminho vai na mesma linha: o Claude le o arquivo direto do computador.
        val caminhos = anexos.joinToString(", ") { it.second }
        val base = when {
            anexos.isEmpty() -> agora.trim()
            agora.isBlank() -> "Veja os arquivos que anexei: $caminhos"
            else -> "${agora.trim()} (arquivos anexados: $caminhos)"
        }
        val t = if (ditou && agora.isNotBlank()) base + MARCA_VOZ else base
        Hub.enviar(s.id, t) { erro, _ ->
            enviando = false
            if (erro != null) aviso(erro) else {
                mudarTexto("")
                anexos.clear()
                acaminho(t)
            }
        }
    }
    val paraOCampo = { t: String ->
        if (t.isBlank()) aviso("Não entendi nada. Fale mais perto do celular e tente de novo.") else juntarVoz(t)
    }
    // No modo travado, o botao de enviar e a confirmacao: manda o que foi falado junto com os anexos.
    val enviarVoz = {
        ditado.parar { t ->
            paraOCampo(t)
            if (t.isNotBlank()) enviarTudo()
        }
    }
    val soltarMic = { g: Gesto ->
        val estava = segurando
        segurando = false
        if (estava && ditado.ativo) when (g) {
            // soltou: o texto vai para o campo, e voce confere antes de enviar
            Gesto.Soltou -> ditado.parar(paraOCampo)
            Gesto.Travou -> vibra.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
            Gesto.Cancelou -> {
                vibra.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                ditado.cancelar()
            }
            Gesto.Toque -> {
                ditado.cancelar()
                aviso("Segure o microfone para gravar. Ao soltar, o texto vai para o campo para você conferir.")
            }
        }
    }
    val enviar = { t: String, ok: String? ->
        Hub.enviar(s.id, t) { erro, _ ->
            if (erro == null) acaminho(t)
            aviso(erro ?: ok ?: return@enviar)
        }
    }
    var verContexto by remember { mutableStateOf(false) }
    var verModo by remember { mutableStateOf(false) }
    if (verContexto) {
        androidx.compose.material3.ModalBottomSheet({ verContexto = false }, containerColor = c.fundo) {
            Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ContextoDetalhado(s, cor, sempreAberto = true)
            }
        }
    }
    Column(Modifier.fillMaxWidth().background(c.fundo).navigationBarsPadding()) {
        Divisoria()
        if (s.desktop) {
            ContinuarDoDesktop(s, aoIrPara)
            return@Column
        }
        if (!s.viva || !s.podeEnviar) {
            Text(
                if (!s.viva) "Sessão encerrada." else "Esta sessão não recebe mensagens do celular. Abra-a pelo atalho da conta, com o duckV ligado.",
                style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(16.dp),
            )
            return@Column
        }
        val trabalhando = s.hospedada && s.status == "working"
        // o modo de permissao a mao, sem ir aos ajustes (como o rodape do Claude Code)
        val ag = e.agenteDa(s.conta)
        val trocaModo = s.hospedada && ag.id == "claude"
        if (verModo) {
            androidx.compose.material3.ModalBottomSheet({ verModo = false }, containerColor = c.fundo) {
                Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    TituloSecao("Permissões desta sessão")
                    EscolhaModo(s, ag, cor) { verModo = false }
                }
            }
        }
        if (e.prefs.rapidas.isNotEmpty() || trabalhando || trocaModo) {
            LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (trocaModo) item {
                    val m = if (s.modo == null || s.modo == "default") "manual" else s.modo
                    Botao(nomeDoModo(ag, m), { verModo = true }, icone = Icons.Rounded.Shield, peso = if (m == "manual") Peso.Quieto else Peso.Principal, altura = 38.dp, linhas = 1)
                }
                // com algo escrito, interrompe o que o agente esta fazendo e manda na hora
                if (trabalhando) item {
                    val comTexto = texto.isNotBlank() || anexos.isNotEmpty()
                    Botao(if (comTexto) "Interromper e enviar" else "Interromper", {
                        Hub.tecla(s.id, "esc") { erro, _ -> if (erro != null) aviso(erro) else if (comTexto) enviarTudo() else aviso("Interrompido") }
                    }, icone = Icons.Rounded.PanTool, altura = 38.dp)
                }
                items(e.prefs.rapidas) { r -> Botao(r, { enviar(r, "Enviada") }, Modifier.widthIn(max = 240.dp), peso = Peso.Quieto, altura = 38.dp, linhas = 1) }
            }
        }
        if (s.pergunta != null) {
            Text("Responda a pergunta acima. O que você escrever aqui espera ela fechar.", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp))
        }
        if (anexos.isNotEmpty() || subindo > 0) {
            LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(anexos.toList(), key = { it.second }) { a ->
                    androidx.compose.material3.InputChip(
                        selected = false, onClick = { anexos.remove(a) },
                        label = { Text(a.first, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 180.dp)) },
                        leadingIcon = { Icon(Icons.Rounded.AttachFile, null, Modifier.size(18.dp)) },
                        trailingIcon = { Icon(Icons.Rounded.Close, "Tirar ${a.first}", Modifier.size(18.dp)) },
                    )
                }
                if (subindo > 0) item { Text("Enviando $subindo ${if (subindo == 1) "arquivo" else "arquivos"}…", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 10.dp)) }
            }
        }
        // Digitou "/": abre a lista de comandos e skills, filtrando conforme digita (some no primeiro espaco).
        val buscando = texto.startsWith("/") && texto.none { it.isWhitespace() }
        var comandos by remember(s.id) { mutableStateOf<List<io.github.duckv.app.Comando>>(emptyList()) }
        LaunchedEffect(buscando) { if (buscando) Hub.comandos(s.id) { comandos = it } }
        val achados = if (buscando && !ditado.ativo) filtrarComandos(comandos, texto) else emptyList()
        if (achados.isNotEmpty()) {
            ListaComandos(achados, s.hospedada, e.agenteDa(s.conta).curto) { cmd ->
                if (cmd.bloqueado != null) aviso(cmd.bloqueado) else mudarTexto(cmd.nome + " ")
            }
        }
        // segurando, o microfone continua no mesmo lugar para nao perder o dedo; a transcricao aparece em cima
        val gravandoSegurando = segurando && ditado.ativo
        if (gravandoSegurando) Transcricao(ditado)
        else if (ditado.ativo) {
            Gravando(
                ditado,
                aoDescartar = { ditado.cancelar() },
                aoRevisar = { ditado.parar(paraOCampo) },
                aoEnviar = enviarVoz,
            )
            return@Column
        }
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.Bottom) {
            if (gravandoSegurando) FaixaSegurando(ditado, Modifier.weight(1f).padding(start = 4.dp, end = 8.dp))
            else {
                IconButton({ verAnexar = true }, Modifier.padding(bottom = 4.dp)) { Icon(Icons.Rounded.AttachFile, "Anexar: câmera, galeria ou arquivo", tint = c.apoio) }
                OutlinedTextField(
                    campo, { campo = it }, Modifier.weight(1f).focusRequester(foco),
                    placeholder = { Text(if (trabalhando) "Ele lê no meio da tarefa" else if (s.hospedada) "Mensagem ou /comando" else "Escreva para o ${e.agenteDa(s.conta).curto}", color = c.apoio) },
                    textStyle = Texto.corpo.copy(color = c.texto), maxLines = 6,
                    shape = RoundedCornerShape(28.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color.Transparent, unfocusedBorderColor = Color.Transparent, cursorColor = c.primario,
                        focusedContainerColor = c.elevada, unfocusedContainerColor = c.elevada,
                    ),
                )
            }
            // A bolinha do contexto, como no Claude: enche conforme a conversa ocupa a memoria.
            val pctCtx = s.ctx?.pct ?: s.ultima?.let { u -> s.ctx?.tamanho?.takeIf { it > 0 }?.let { (u.entrada + u.cw + u.cr + u.saida) * 100.0 / it } }
            if (pctCtx != null) AnelContexto(pctCtx, cor, { verContexto = true }, Modifier.padding(start = 4.dp, bottom = 8.dp))
            EspacoLargo(4.dp)
            val pode = (texto.isNotBlank() || anexos.isNotEmpty()) && !enviando && subindo == 0
            // campo vazio: o botao redondo grava uma mensagem de voz; com anexos, ele fica ao lado do enviar
            val gravarVoz = texto.isBlank() && subindo == 0 && !enviando
            if (gravarVoz) BotaoMicrofone(apertarMic, soltarMic, Modifier.padding(bottom = 4.dp, end = if (anexos.isNotEmpty()) 6.dp else 0.dp))
            if (!gravandoSegurando && (!gravarVoz || anexos.isNotEmpty())) Box(
                Modifier.padding(bottom = 4.dp).size(48.dp).clip(CircleShape).background(if (pode) c.primario else c.elevada)
                    .clickable(enabled = pode, role = Role.Button, onClick = enviarTudo),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Rounded.Send, "Enviar", tint = if (pode) c.noPrimario else c.apoio, modifier = Modifier.size(22.dp)) }
        }
    }
}

// Prefixo do nome primeiro, depois quem so contem o que foi digitado (nome ou o pedaco depois de "plugin:").
private fun filtrarComandos(itens: List<io.github.duckv.app.Comando>, digitado: String): List<io.github.duckv.app.Comando> {
    val q = digitado.removePrefix("/").lowercase()
    if (q.isEmpty()) return itens
    val nome = { c: io.github.duckv.app.Comando -> c.nome.removePrefix("/").lowercase() }
    val (comeca, contem) = itens.filter { nome(it).contains(q) }.partition { nome(it).startsWith(q) || nome(it).substringAfter(':').startsWith(q) }
    return comeca + contem
}

@Composable
private fun ListaComandos(itens: List<io.github.duckv.app.Comando>, hospedada: Boolean, agente: String, aoEscolher: (io.github.duckv.app.Comando) -> Unit) {
    val c = cores
    Column(
        Modifier.padding(horizontal = 12.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.cartao),
    ) {
        Text(
            if (hospedada) "Comandos e skills" else "Skills · os comandos do $agente só valem nas sessões abertas pelo celular",
            style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 2.dp),
        )
        LazyColumn(Modifier.heightIn(max = 264.dp)) {
            items(itens, key = { it.nome }) { cmd ->
                val bloq = cmd.bloqueado != null
                Row(
                    Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Usar ${cmd.nome}") { aoEscolher(cmd) }
                        .padding(horizontal = 16.dp, vertical = 9.dp)
                        .then(if (bloq) Modifier.alpha(0.55f) else Modifier),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(cmd.nome, style = Texto.codigo, color = if (bloq) c.apoio else c.realce, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val sub = cmd.bloqueado ?: cmd.desc
                        if (sub.isNotBlank()) Text(sub, style = Texto.pequeno, color = c.apoio, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    EspacoLargo(12.dp)
                    Text(
                        when (cmd.tipo) { "skill" -> "skill"; "personalizado" -> "seu"; else -> cmd.origem.substringBefore(' ').lowercase() },
                        style = Texto.pequeno, color = c.apoio,
                    )
                }
            }
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
            else if (s.agente != "claude") "Conversa salva. Para mandar mensagens, continue a mesma conversa pelo celular. Se ela estiver aberta no computador, feche lá antes, para as duas não escreverem juntas."
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
            Column(Modifier.clip(RoundedCornerShape(16.dp)).background(c.cartao)) {
                Leitura(Icons.Rounded.Memory, "Modelo", s.model ?: "Não informado", Modifier)
                Divisoria(Modifier.padding(start = 56.dp))
                Leitura(Icons.Rounded.Psychology, "Esforço", ESFORCOS[s.effort] ?: s.effort ?: "Padrão", Modifier)
                Divisoria(Modifier.padding(start = 56.dp))
                Leitura(Icons.Rounded.Shield, "Permissões", nomeDoModo(s.modo).replaceFirstChar { it.uppercase() }, Modifier)
            }
            Column {
                if (s.desktop) {
                    TituloSecao(if (s.agente == "claude") "Conversa do Claude Code" else "Conversa do ${e.agente(s.agente).nome}")
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
        val ag = e.agenteDa(s.conta)
        Column {
            TituloSecao("Ações")
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Botao("Interromper", { tecla("esc", "Interrompido") }, Modifier.weight(1f), Icons.Rounded.PanTool, vertical = true)
                    // cada agente tem o seu comando para resumir a conversa e liberar contexto
                    Botao("Compactar conversa", { enviar(if (ag.id == "gemini") "/compress" else "/compact", "Compactação pedida") }, Modifier.weight(1f), Icons.Rounded.CloseFullscreen, vertical = true)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BotaoConfirma("Limpar conversa", Icons.Rounded.CleaningServices, { enviar(if (ag.id == "codex" || ag.id == "opencode") "/new" else "/clear", "Conversa limpa") }, Modifier.weight(1f), vertical = true)
                    BotaoConfirma("Encerrar sessão", Icons.Rounded.PowerSettingsNew, {
                        Hub.mandar(JSONObject().put("t", "stop").put("instance", s.id)) { erro, _ -> aviso(erro ?: "Sessão encerrada") }
                    }, Modifier.weight(1f), Peso.Perigo, vertical = true)
                }
            }
        }
        // Os outros agentes guardam o que foi escolhido ao abrir; para trocar, abre-se uma sessao nova.
        if (ag.id != "claude") Column {
            TituloSecao("Ajustes desta sessão")
            Column(Modifier.clip(RoundedCornerShape(16.dp)).background(c.cartao)) {
                Leitura(Icons.Rounded.Memory, "Modelo", s.model?.let { nomeDoModelo(ag, it) } ?: "Padrão da conta", Modifier)
                Divisoria(Modifier.padding(start = 56.dp))
                Leitura(Icons.Rounded.Shield, "Permissões", s.modo?.let { nomeDoModo(ag, it) } ?: ag.modos.firstOrNull()?.rotulo ?: "Perguntar", Modifier)
            }
            Text("Para trocar o modelo ou o modo, abra uma sessão nova nesta conta.", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 8.dp))
        }
        if (ag.id == "claude") Column(verticalArrangement = Arrangement.spacedBy(22.dp)) {
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
                EscolhaModo(s, ag, cor)
                if (s.rodape.isNotBlank()) Text("O Claude Code mostra agora: ${s.rodape}", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 8.dp))
            }
        }
        Column {
            TituloSecao("Avançado")
            Text("A tela crua do ${ag.nome}, com teclas e um campo para digitar. Serve para as perguntas que não viram botão.", style = Texto.apoio, color = c.apoio)
            Espaco(10.dp)
            Botao("Ver a tela do terminal", aoTerminal, Modifier.fillMaxWidth(), Icons.Rounded.Terminal, Peso.Quieto)
        }
    }
}

/** Uma opcao do menu de anexar: circulo com o icone e o nome embaixo. */
@Composable
private fun OpcaoAnexo(icone: ImageVector, nome: String, cor: Color, aoTocar: () -> Unit) {
    val c = cores
    Column(
        Modifier.clip(RoundedCornerShape(16.dp)).clickable(role = Role.Button, onClick = aoTocar).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(60.dp).clip(CircleShape).background(cor.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
            Icon(icone, null, tint = cor, modifier = Modifier.size(28.dp))
        }
        Text(nome, style = Texto.rotulo, color = c.texto)
    }
}

/** Modo de permissao escolhido direto, na conversa e nos ajustes. Ate o computador confirmar, vale o que voce tocou. */
@Composable
private fun EscolhaModo(s: Sessao, ag: io.github.duckv.app.Agente, cor: Color, aoTrocar: () -> Unit = {}) {
    val aviso = LocalAviso.current
    val atual = if (s.modo == null || s.modo == "default") "manual" else s.modo
    var tocado by remember(s.id, s.modo) { mutableStateOf<String?>(null) }
    ListaEscolha(opcoesModo(ag), tocado ?: atual, { m ->
        if (m == (tocado ?: atual)) aoTrocar()
        else {
            tocado = m
            Hub.modo(s.id, m) { erro, _ ->
                if (erro != null) { tocado = null; aviso(erro) }
                else { aviso("Modo: ${nomeDoModo(ag, m)}"); aoTrocar() }
            }
        }
    }, cor = cor)
}

@Composable
private fun Leitura(icone: ImageVector, rotulo: String, valor: String, modifier: Modifier) {
    val c = cores
    // item de lista do Material 3: icone, rotulo e valor
    Row(modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icone, null, tint = c.apoio, modifier = Modifier.size(24.dp))
        Column(Modifier.padding(start = 16.dp)) {
            Text(rotulo, style = Texto.pequeno, color = c.apoio)
            Text(valor, style = Texto.corpo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
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

    val ctx = LocalContext.current
    var digitado by rememberSaveable(s.id) { mutableStateOf("") }
    Column(Modifier.fillMaxSize().navigationBarsPadding()) {
        LazyRow(contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Botao(if (s.login) "Conversa" else "Controles", aoSair, icone = Icons.AutoMirrored.Rounded.ArrowBack, peso = Peso.Quieto, altura = 42.dp) }
            items(TECLAS) { (k, rotulo, ic) ->
                Botao(rotulo, { Hub.tecla(s.id, k) { erro, _ -> if (erro != null) aviso(erro) } }, icone = ic, altura = 42.dp, descricao = rotulo ?: k)
            }
        }
        // links na tela (o de login, por exemplo) e as opcoes da pergunta aberta, como botoes
        val links = tela?.links?.takeIf { it.isNotEmpty() } ?: s.links
        val pergunta = s.pergunta
        if (links.isNotEmpty() || pergunta != null) {
            LazyRow(contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(links) { u ->
                    Botao(
                        "Abrir " + (runCatching { android.net.Uri.parse(u).host }.getOrNull() ?: "link"),
                        { runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(u))) } },
                        icone = Icons.AutoMirrored.Rounded.OpenInNew, peso = Peso.Principal, altura = 42.dp,
                    )
                }
                if (pergunta != null) items(pergunta.opcoes) { o ->
                    Botao(
                        if (o.tecla.length == 1 && o.tecla[0].isDigit()) "${o.tecla}. ${o.rotulo}" else o.rotulo,
                        { Hub.tecla(s.id, o.tecla) { erro, _ -> if (erro != null) aviso(erro) } },
                        Modifier.widthIn(max = 280.dp), peso = Peso.Comum, altura = 42.dp, linhas = 1,
                    )
                }
            }
        }
        Box(
            Modifier.weight(1f).fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF120D0A))
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
        // digitar no terminal: o codigo que a pagina de login mostra, ou uma resposta escrita
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                digitado, { digitado = it }, Modifier.weight(1f), singleLine = true,
                placeholder = { Text("Digitar no terminal (código, resposta…)", color = cores.apoio) },
                textStyle = Texto.codigo.copy(color = cores.texto), shape = RoundedCornerShape(12.dp), colors = campoCores(),
            )
            IconButton({
                val t = digitado.trim()
                if (t.isNotEmpty()) Hub.mandar(JSONObject().put("t", "digitar").put("instance", s.id).put("text", t)) { erro, _ -> if (erro != null) aviso(erro) else digitado = "" }
            }, enabled = digitado.isNotBlank()) { Icon(Icons.AutoMirrored.Rounded.Send, "Digitar e apertar Enter", tint = if (digitado.isNotBlank()) cores.realce else cores.apoio) }
        }
    }
}
