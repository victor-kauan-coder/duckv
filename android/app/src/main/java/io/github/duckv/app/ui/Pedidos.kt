package io.github.duckv.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
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
    s.precisa -> if (s.perms.isNotEmpty()) "Pedindo permissão" else "Pedindo permissão no computador"
    s.status == "working" -> s.atividade.ifBlank { "Trabalhando" }
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
        Text(
            if (comRecado) "Cancelar recado" else "Recusar e dizer o que fazer",
            style = Texto.rotulo, color = c.invTexto, textDecoration = TextDecoration.Underline,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { comRecado = !comRecado }.padding(vertical = 6.dp),
        )
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

@Composable
fun CartaoPergunta(conta: Conta, s: Sessao, aoVerTela: () -> Unit) {
    val c = cores
    val aviso = LocalAviso.current
    val tecla = { k: String -> Hub.tecla(s.id, k) { erro, _ -> if (erro != null) aviso(erro) } }
    val p = s.pergunta ?: return
    CartaoInvertido {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Marca(Color(conta.cor))
            EspacoLargo(8.dp)
            Text("O Claude Code pergunta em ${s.titulo}", style = Texto.pequeno, color = c.invApoio)
        }
        // A tela inteira acima das opcoes: se for um pedido de permissao, o comando aparece completo.
        if (p.contexto.isNotBlank()) {
            val forma = RoundedCornerShape(10.dp)
            Text(
                p.contexto, style = Texto.codigo, color = c.invTexto,
                modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp).clip(forma)
                    .border(1.dp, c.invLinha, forma).verticalScroll(rememberScrollState()).padding(12.dp),
            )
        } else if (p.titulo.isNotBlank()) Text(p.titulo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.invTexto)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (o in p.opcoes) {
                if (o.confirmar) BotaoConfirma("${o.tecla}.  ${o.rotulo}", Icons.Rounded.Check, { tecla(o.tecla) }, Modifier.fillMaxWidth(), Peso.Invertido)
                else Botao("${o.tecla}.  ${o.rotulo}", { tecla(o.tecla) }, Modifier.fillMaxWidth(), peso = Peso.Invertido)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Botao("Cancelar", { tecla("esc") }, Modifier.weight(1f), peso = Peso.Invertido)
            Botao("Ver a tela", aoVerTela, Modifier.weight(1f), peso = Peso.Invertido)
        }
    }
}

@Composable
fun CartaoLocal(conta: Conta, s: Sessao) {
    val c = cores
    val forma = RoundedCornerShape(16.dp)
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
