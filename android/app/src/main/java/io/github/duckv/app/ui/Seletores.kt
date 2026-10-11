package io.github.duckv.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.SegmentedButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

// O que cada escolha faz, numa frase. Sem descricao, a linha mostra so o nome.
val SOBRE_MODELO = mapOf(
    "default" to "O que a conta usa quando você não escolhe.",
    "best" to "O mais capaz que a conta pode usar agora.",
    "opus" to "Para tarefas longas e difíceis.",
    "sonnet" to "Equilíbrio entre qualidade e velocidade.",
    "haiku" to "O mais rápido e o que menos gasta limite.",
    "opusplan" to "Opus quando planeja, Sonnet quando executa.",
)
val SOBRE_ESFORCO = mapOf(
    "" to "O Claude Code decide quanto pensar.",
    "low" to "Responde rápido e pensa pouco.",
    "medium" to "Pensa o suficiente para o dia a dia.",
    "high" to "Pensa mais antes de agir.",
    "xhigh" to "Para problemas difíceis. Mais lento e gasta mais limite.",
    "max" to "Todo o raciocínio disponível. O mais lento e o que mais gasta.",
)
private val CURTO = mapOf("low" to "Baixo", "medium" to "Médio", "high" to "Alto", "xhigh" to "Extra", "max" to "Máx")

/** Nome do ajuste a esquerda e o valor escolhido a direita: a escolha se le sem abrir a lista. */
@Composable
fun CabecalhoAjuste(nome: String, valor: String?, modifier: Modifier = Modifier) {
    val c = cores
    Row(modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.Bottom) {
        Text(nome, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto, modifier = Modifier.weight(1f))
        if (valor != null) Text(valor, style = Texto.apoio, color = c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

data class Opcao(val id: String, val nome: String, val sobre: String? = null)

/** Lista de escolha unica: uma linha por opcao, com o que ela faz embaixo do nome. */
@Composable
fun ListaEscolha(opcoes: List<Opcao>, marcado: String?, aoEscolher: (String) -> Unit, modifier: Modifier = Modifier, cor: Color = Laranja) {
    val c = cores
    val forma = RoundedCornerShape(16.dp)
    Column(modifier.fillMaxWidth().clip(forma).background(c.cartao).selectableGroup()) {
        opcoes.forEachIndexed { i, o ->
            val sim = o.id == marcado
            if (i > 0) Divisoria(if (sim || opcoes[i - 1].id == marcado) Modifier else Modifier.padding(start = 16.dp))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp)
                    .background(if (sim) c.invFundo else Color.Transparent)
                    .selectable(sim, role = Role.RadioButton, onClick = { aoEscolher(o.id) })
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(o.nome, style = Texto.rotulo.copy(fontWeight = if (sim) FontWeight.SemiBold else FontWeight.Medium), color = if (sim) c.invTexto else c.texto)
                    if (o.sobre != null) Text(o.sobre, style = Texto.apoio, color = if (sim) c.invApoio else c.apoio)
                }
                Box(Modifier.padding(start = 12.dp)) { Marcador(sim, cor) }
            }
        }
    }
}

@Composable
private fun Marcador(sim: Boolean, cor: Color) {
    // botao de radio do Material 3; a linha inteira e que recebe o toque
    androidx.compose.material3.RadioButton(sim, null, colors = androidx.compose.material3.RadioButtonDefaults.colors(selectedColor = cores.realce, unselectedColor = cores.vazio))
}

/** Esforco: a mesma lista de escolha do modelo e das permissoes, do padrao ao maximo, com o que cada nivel faz. */
@Composable
fun EscalaEsforco(niveis: List<String>, marcado: String, aoEscolher: (String) -> Unit, modifier: Modifier = Modifier, comPadrao: Boolean = true, cor: Color = Laranja) {
    val opcoes = (if (comPadrao) listOf(Opcao("", "Padrão", SOBRE_ESFORCO[""])) else emptyList()) +
        niveis.map { Opcao(it, ESFORCOS[it] ?: it, SOBRE_ESFORCO[it]) }
    ListaEscolha(opcoes, marcado.takeIf { m -> opcoes.any { it.id == m } }, aoEscolher, modifier, cor)
}

fun opcoesModelo(ids: List<String>) = ids.map { Opcao(it, MODELOS[it] ?: it, SOBRE_MODELO[it]) }
fun opcoesModo(ids: List<String>) = ids.map { Opcao(it, MODOS[it]?.first ?: it, MODOS[it]?.second) }
