package io.github.duckv.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ------------------------------------------------------------ tabelas em markdown

/** Pedaco de texto da conversa: texto corrido ou tabela. */
sealed interface Trecho {
    data class Texto(val texto: String) : Trecho
    data class Tabela(val cabecalho: List<String>, val linhas: List<List<String>>) : Trecho
}

private val SEPARADOR = Regex("""^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$""")
private fun celulas(l: String) = l.trim().removePrefix("|").removeSuffix("|").split('|').map { it.trim().replace("**", "").replace("`", "") }

/** Separa as tabelas (linha de titulos, linha |---|, linhas) do texto corrido em volta. */
fun trechos(texto: String): List<Trecho> {
    val ls = texto.lines()
    val out = mutableListOf<Trecho>()
    val corrido = StringBuilder()
    var i = 0
    while (i < ls.size) {
        val ehTabela = i + 1 < ls.size && ls[i].contains('|') && SEPARADOR.matches(ls[i + 1])
        if (!ehTabela) {
            corrido.append(ls[i]).append('\n')
            i++
            continue
        }
        if (corrido.isNotBlank()) out.add(Trecho.Texto(corrido.toString().trim('\n')))
        corrido.clear()
        val cab = celulas(ls[i])
        i += 2
        val linhas = mutableListOf<List<String>>()
        while (i < ls.size && ls[i].trim().startsWith("|")) {
            linhas.add(celulas(ls[i]).let { c -> List(cab.size) { n -> c.getOrElse(n) { "" } } })
            i++
        }
        out.add(Trecho.Tabela(cab, linhas))
    }
    if (corrido.isNotBlank()) out.add(Trecho.Texto(corrido.toString().trim('\n')))
    return out
}

@Composable
fun TabelaMarkdown(t: Trecho.Tabela, cor: Color) {
    val c = cores
    // largura de cada coluna pelo texto mais longo dela, dentro de limites legiveis
    val larguras = t.cabecalho.indices.map { n ->
        val maior = (listOf(t.cabecalho[n]) + t.linhas.map { it[n] }).maxOf { it.length }
        (maior * 8 + 24).coerceIn(72, 260).dp
    }
    val forma = RoundedCornerShape(12.dp)
    Box(Modifier.clip(forma).border(1.dp, c.linha, forma).horizontalScroll(rememberScrollState())) {
        Column {
            Row(Modifier.background(cor.copy(alpha = if (c.escuro) 0.22f else 0.14f))) {
                t.cabecalho.forEachIndexed { n, h ->
                    Text(h, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp), color = c.texto, modifier = Modifier.width(larguras[n]).padding(horizontal = 10.dp, vertical = 8.dp))
                }
            }
            t.linhas.forEachIndexed { i, linha ->
                Row(Modifier.background(if (i % 2 == 1) c.elevada else c.superficie)) {
                    linha.forEachIndexed { n, v ->
                        Text(v, style = Texto.apoio, color = c.texto, modifier = Modifier.width(larguras[n]).padding(horizontal = 10.dp, vertical = 8.dp))
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------ bolinha do contexto

/** Anel que enche conforme o contexto: o mesmo sinal discreto que o Claude mostra perto da caixa de mensagem. */
@Composable
fun AnelContexto(pct: Double?, cor: Color, aoTocar: () -> Unit, modifier: Modifier = Modifier) {
    val c = cores
    val p = ((pct ?: 0.0) / 100.0).coerceIn(0.0, 1.0).toFloat()
    val cheio = (pct ?: 0.0) >= 80
    Box(
        modifier.size(40.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Ver o contexto em detalhe", onClick = aoTocar),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(30.dp)) {
            val traco = 3.5.dp.toPx()
            val lado = size.minDimension - traco
            val canto = Offset(traco / 2, traco / 2)
            drawArc(c.linha, 0f, 360f, false, canto, Size(lado, lado), style = Stroke(traco))
            if (p > 0f) drawArc(if (cheio) c.realce else cor, -90f, 360f * p, false, canto, Size(lado, lado), style = Stroke(traco, cap = StrokeCap.Round))
        }
        Text(
            if (pct == null) "–" else "${pct.toInt()}",
            style = Texto.pequeno.copy(fontSize = 10.sp, fontWeight = FontWeight.Bold), color = if (cheio) c.realce else c.apoio, textAlign = TextAlign.Center,
        )
    }
}
