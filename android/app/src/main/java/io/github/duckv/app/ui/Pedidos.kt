package io.github.duckv.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material3.Icon
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Conta
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.Perm
import io.github.duckv.app.Sessao

// ------------------------------------------------------------ regras de exibicao

data class EstadoConta(val bicho: String, val acesa: Boolean, val texto: String)

fun estadoDaConta(e: Estado, conta: Conta, agora: Long): EstadoConta {
    val ss = e.vivas(conta.id)
    val cinco = conta.cinco
    if (ss.any { it.precisa }) return EstadoConta("pede", true, "Precisa de você")
    if (cinco?.pct != null && cinco.pct >= 100 && cinco.resetsAt != null) {
        return EstadoConta("cansado", false, "Sem energia até ${hora(cinco.resetsAt)}")
    }
    val festa = conta.reinicio != null && agora - conta.reinicio.em < 90_000
    val trabalhando = ss.count { it.status == "working" }
    if (trabalhando > 0) return EstadoConta(if (festa) "festa" else "trabalha", true, "Trabalhando em ${plural(trabalhando, "sessão", "sessões")}")
    if (festa) return EstadoConta("festa", true, "Limite reiniciado agora")
    if (ss.any { it.status == "error" }) return EstadoConta("parado", true, "Uma sessão parou com erro")
    if (ss.isNotEmpty()) return EstadoConta("parado", true, "Esperando sua mensagem")
    return EstadoConta("dorme", false, "Nenhuma sessão aberta")
}

fun oQueFaz(s: Sessao): String = when {
    s.status == "ended" -> "Encerrada"
    s.precisa && s.remota -> s.atividade.ifBlank { "Esperando você na nuvem" }
    s.precisa -> if (s.perms.isNotEmpty()) "Pedindo permissão" else "Pedindo permissão no computador"
    s.status == "working" -> s.atividade.ifBlank { "Trabalhando" }
    s.arquivada -> "Arquivada na nuvem"
    s.remota -> s.ultimoTexto.ifBlank { if (s.origem == "cowork") "Parada no Cowork" else "Parada na nuvem" }
    s.desktop -> "No Claude desktop" + (s.ultimoTexto.takeIf { it.isNotBlank() }?.let { ": $it" } ?: "")
    s.status == "error" -> s.atividade.ifBlank { "Parou com erro" }
    else -> s.ultimoTexto.ifBlank { "Esperando sua mensagem" }
}

fun bichoDaSessao(s: Sessao) = when {
    !s.viva -> "dorme"
    s.precisa -> "pede"
    s.status == "working" -> "trabalha"
    else -> "parado"
}

val MODELOS = mapOf("default" to "Padrão da conta", "best" to "O melhor disponível", "fable" to "Fable", "opus" to "Opus", "sonnet" to "Sonnet", "haiku" to "Haiku", "opusplan" to "Opus para planejar")
val ESFORCOS = mapOf("low" to "Baixo", "medium" to "Médio", "high" to "Alto", "xhigh" to "Extra alto", "max" to "Máximo")
val MODOS = mapOf(
    "manual" to ("Perguntar sempre" to "O Claude pede sua permissão antes de editar arquivos e rodar comandos."),
    "acceptEdits" to ("Aceitar edições" to "Edita arquivos sem perguntar. Comandos ainda pedem permissão."),
    "plan" to ("Planejar antes" to "Só lê e monta um plano. Não altera nada até você aprovar."),
    "auto" to ("Automático" to "Um classificador avalia cada ação no seu lugar e só barra o que parecer arriscado."),
)
fun nomeDoModo(m: String?) = MODOS[if (m == "default") "manual" else m]?.first ?: m ?: "não informado"

// ------------------------------------------------------------ cartoes

@Composable
private fun CartaoInvertido(conteudo: @Composable () -> Unit) {
    val c = cores
    val forma = RoundedCornerShape(16.dp)
    Column(
        Modifier.fillMaxWidth().clip(forma).background(c.invFundo).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) { conteudo() }
}

@Composable
fun CartaoPedido(conta: Conta, s: Sessao, p: Perm) {
    val c = cores
    val aviso = LocalAviso.current
    var ocupado by remember(p.id) { mutableStateOf(false) }
    var comRecado by rememberSaveable(p.id) { mutableStateOf(false) }
    var recado by rememberSaveable(p.id) { mutableStateOf("") }
    fun responder(aceitar: Boolean, nota: String? = null) {
        ocupado = true
        Hub.veredito(s.id, p.id, aceitar, nota) { erro, _ ->
            if (erro != null) {
                ocupado = false
                aviso(erro)
            } else aviso(if (aceitar) "Aceito" else "Recusado")
        }
    }
    CartaoInvertido {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Marca(Color(conta.cor))
            EspacoLargo(8.dp)
            Text("${conta.nome} · ${s.titulo}", style = Texto.pequeno, color = c.invApoio)
        }
        Text(
            buildString { append(p.tool); if (p.desc.isNotBlank()) append(": ").append(p.desc) },
            style = Texto.rotulo.copy(fontSize = Texto.titulo.fontSize, fontWeight = FontWeight.SemiBold), color = c.invTexto,
        )
        if (p.preview.isNotBlank()) {
            val forma = RoundedCornerShape(10.dp)
            SelectionContainer {
                Text(
                    p.preview, style = Texto.codigo, color = c.invTexto,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp).clip(forma)
                        .border(1.dp, c.invLinha, forma).verticalScroll(rememberScrollState())
                        .horizontalScroll(rememberScrollState()).padding(12.dp),
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Botao("Recusar", { responder(false) }, Modifier.weight(1f), Icons.Rounded.Close, Peso.Invertido, !ocupado)
            Botao("Aceitar", { responder(true) }, Modifier.weight(1f), Icons.Rounded.Check, Peso.Principal, !ocupado)
        }
        // botao de texto do Material (no lugar de um link sublinhado)
        androidx.compose.material3.TextButton(
            { comRecado = !comRecado },
            contentPadding = PaddingValues(horizontal = 12.dp),
            modifier = Modifier.heightIn(min = 48.dp).offset(x = (-12).dp),
            colors = androidx.compose.material3.ButtonDefaults.textButtonColors(contentColor = c.invTexto),
        ) {
            Icon(if (comRecado) Icons.Rounded.Close else Icons.Rounded.Edit, null, Modifier.size(18.dp))
            Text(if (comRecado) "Cancelar recado" else "Recusar e dizer o que fazer", style = Texto.rotulo, modifier = Modifier.padding(start = 8.dp))
        }
        AnimatedVisibility(comRecado) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    recado, { recado = it }, Modifier.fillMaxWidth(),
                    placeholder = { Text("Diga o que ele deve fazer no lugar", color = c.invApoio) },
                    textStyle = Texto.corpo.copy(color = c.invTexto), minLines = 2,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Laranja, unfocusedBorderColor = c.invLinha, cursorColor = Laranja,
                        focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
                    ),
                    shape = RoundedCornerShape(10.dp),
                )
                Botao("Recusar com este recado", { if (recado.isNotBlank()) responder(false, recado.trim()) }, Modifier.fillMaxWidth(), peso = Peso.Invertido, habilitado = !ocupado && recado.isNotBlank())
            }
        }
    }
}

/**
 * Pergunta que o Claude Code mostra no terminal (escolher uma opcao, confiar na pasta, permissao
 * que caiu no terminal). Cada opcao e uma linha tocavel; "Type something." vira um campo de texto.
 */
@Composable
fun CartaoPergunta(conta: Conta, s: Sessao, aoVerTela: () -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val p = s.pergunta ?: return
    // Um toque por vez: o segundo toque cairia na pergunta seguinte.
    var ocupado by remember(p) { mutableStateOf(false) }
    val tecla = { k: String ->
        if (!ocupado) {
            ocupado = true
            Hub.tecla(s.id, k) { erro, _ -> if (erro != null) { ocupado = false; aviso(erro) } }
        }
    }
    // Pedido de permissao: o comando tem de estar a vista antes de aceitar.
    val arriscado = Regex("proceed|make this edit|run this|trust|permission|Bash|command", RegexOption.IGNORE_CASE).containsMatchIn(p.titulo + p.contexto)
    var verTela by remember(p) { mutableStateOf(arriscado) }
    CartaoInvertido {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PixelArte(BALAO, Modifier.size(28.dp), mapOf('#' to c.invTexto, 'o' to Laranja))
            EspacoLargo(10.dp)
            Column(Modifier.weight(1f)) {
                Text(if (s.agente == "claude") "O Claude pergunta" else "O agente pergunta", style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.invTexto)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Marca(Color(conta.cor), tamanho = 8.dp)
                    EspacoLargo(6.dp)
                    Text("${conta.nome} · ${s.titulo}", style = Texto.pequeno, color = c.invApoio, maxLines = 1)
                }
            }
        }
        if (p.titulo.isNotBlank()) Text(p.titulo.replace("☐", "").trim(), style = Texto.corpo.copy(fontWeight = FontWeight.SemiBold), color = c.invTexto)
        if (p.contexto.isNotBlank()) {
            Text(
                if (verTela) "Esconder a tela" else "Ver o que está na tela",
                style = Texto.pequeno, color = c.invApoio, textDecoration = TextDecoration.Underline,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { verTela = !verTela }.padding(vertical = 4.dp),
            )
            AnimatedVisibility(verTela) {
                val forma = RoundedCornerShape(10.dp)
                Text(
                    p.contexto, style = Texto.codigo, color = c.invTexto,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp).clip(forma)
                        .border(1.dp, c.invLinha, forma).verticalScroll(rememberScrollState()).padding(12.dp),
                )
            }
        }
        val forma = RoundedCornerShape(12.dp)
        Column(Modifier.fillMaxWidth().clip(forma).border(1.dp, c.invLinha, forma)) {
            p.opcoes.forEachIndexed { i, o ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(c.invLinha))
                if (o.livre) RespostaLivre(s, o, ocupado) { ocupado = true }
                else OpcaoDaPergunta(o, ocupado) { tecla(o.tecla) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Botao("Cancelar", { tecla("esc") }, Modifier.weight(1f), peso = Peso.Invertido, altura = 44.dp)
            Botao("Ver o terminal", aoVerTela, Modifier.weight(1f), peso = Peso.Invertido, altura = 44.dp)
        }
    }
}

@Composable
private fun OpcaoDaPergunta(o: io.github.duckv.app.Opcao, ocupado: Boolean, aoEscolher: () -> Unit) {
    val c = cores
    var armado by remember(o) { mutableStateOf(false) }
    LaunchedEffect(armado) { if (armado) { kotlinx.coroutines.delay(3500); armado = false } }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp)
            .background(if (armado) Laranja.copy(alpha = 0.18f) else Color.Transparent)
            .clickable(enabled = !ocupado, role = Role.Button) {
                // Opcao que vale para sempre pede um segundo toque.
                if (o.confirmar && !armado) armado = true else aoEscolher()
            }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(28.dp).clip(RoundedCornerShape(7.dp)).background(c.invTexto.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Text(o.tecla, style = Texto.rotulo.copy(fontWeight = FontWeight.Bold), color = c.invTexto)
        }
        EspacoLargo(12.dp)
        Column(Modifier.weight(1f)) {
            Text(if (armado) "Toque de novo para confirmar" else o.rotulo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = if (armado) Laranja else c.invTexto)
            if (o.detalhe != null) Text(o.detalhe, style = Texto.apoio, color = c.invApoio)
        }
    }
}

@Composable
private fun RespostaLivre(s: Sessao, o: io.github.duckv.app.Opcao, ocupado: Boolean, aoEnviar: () -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    var texto by rememberSaveable(s.id) { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Ou escreva a sua resposta", style = Texto.pequeno, color = c.invApoio)
        Row(verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(
                texto, { texto = it }, Modifier.weight(1f),
                placeholder = { Text("Sua resposta", color = c.invApoio) },
                textStyle = Texto.corpo.copy(color = c.invTexto), maxLines = 4,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Laranja, unfocusedBorderColor = c.invLinha, cursorColor = Laranja,
                    focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
                ),
                shape = RoundedCornerShape(12.dp),
            )
            EspacoLargo(8.dp)
            val pode = texto.isNotBlank() && !ocupado
            Box(
                Modifier.padding(bottom = 4.dp).size(48.dp).clip(RoundedCornerShape(14.dp)).background(if (pode) Laranja else c.invLinha)
                    .clickable(enabled = pode, role = Role.Button, onClickLabel = "Enviar resposta") {
                        aoEnviar()
                        Hub.mandar(org.json.JSONObject().put("t", "responder").put("instance", s.id).put("tecla", o.tecla).put("texto", texto.trim())) { erro, _ ->
                            if (erro != null) aviso(erro) else texto = ""
                        }
                    },
                contentAlignment = Alignment.Center,
            ) { androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.Send, "Enviar resposta", tint = if (pode) Tinta else c.invApoio, modifier = Modifier.size(20.dp)) }
        }
    }
}

@Composable
fun CartaoLocal(conta: Conta, s: Sessao) {
    val c = cores
    val forma = RoundedCornerShape(16.dp)
    // Na nuvem ou no Cowork, a resposta e la: o cartao diz o que ela pede e leva ate onde responder.
    if (s.remota) {
        val ctx = androidx.compose.ui.platform.LocalContext.current
        Column(
            Modifier.fillMaxWidth().clip(forma).background(c.cartao).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(iconeOrigem(s.origem), null, Modifier.size(20.dp), tint = c.texto)
                Text(
                    "${conta.nome} espera você ${if (s.origem == "nuvem") "na nuvem" else "no Cowork"}",
                    style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto, modifier = Modifier.padding(start = 10.dp),
                )
            }
            Text(s.atividade.ifBlank { "A sessão parou e espera uma resposta sua." }, style = Texto.apoio, color = c.apoio)
            val link = s.link
            if (link != null) Botao("Responder no claude.ai", { abrirLink(ctx, link) }, icone = Icons.AutoMirrored.Rounded.OpenInNew, peso = Peso.Principal)
            else Text("Responda pelo app Claude do computador.", style = Texto.pequeno, color = c.apoio)
        }
        return
    }
    Column(
        Modifier.fillMaxWidth().clip(forma).border(2.dp, c.texto, forma).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("${conta.nome} espera uma resposta ${if (s.hospedada) "na tela da sessão" else "no computador"}", style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
        Text(
            when {
                s.hospedada -> "O pedido está na tela do terminal desta sessão. Abra Controles e toque em Ver a tela do terminal."
                s.pedidoLocal?.tool != null -> "${s.pedidoLocal.tool} ${s.pedidoLocal.texto}".trim()
                else -> "Esse pedido não chegou ao celular. Responda na janela da sessão."
            },
            style = Texto.apoio, color = c.apoio,
        )
    }
}

/** Todos os pedidos abertos destas sessoes, do mais importante para o menos. */
@Composable
fun Pedidos(e: Estado, sessoes: List<Sessao>, aoVerTela: (Sessao) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        for (s in sessoes) {
            if (!s.viva) continue
            val conta = e.conta(s.conta)
            for (p in s.perms) androidx.compose.runtime.key(p.id) { CartaoPedido(conta, s, p) }
            if (s.hospedada && s.pergunta != null && s.perms.isEmpty()) {
                androidx.compose.runtime.key("q" + s.id + s.pergunta.titulo) { CartaoPergunta(conta, s) { aoVerTela(s) } }
            } else if (s.perms.isEmpty() && s.status == "waiting") CartaoLocal(conta, s)
        }
    }
}

fun temPedidos(sessoes: List<Sessao>) = sessoes.any { s ->
    s.viva && (s.perms.isNotEmpty() || (s.hospedada && s.pergunta != null) || s.status == "waiting")
}
