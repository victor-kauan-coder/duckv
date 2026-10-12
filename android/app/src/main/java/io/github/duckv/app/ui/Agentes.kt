package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Agente

// Um icone em pixels para cada agente, no mesmo traco do pato e do V do logo.
// Sao desenhos proprios, na cor de cada marca, e nao os logotipos das empresas.

/** Claude Code: a faisca. */
private val ICONE_CLAUDE = listOf(
    "....#....",
    ".#..#..#.",
    "..#.#.#..",
    "...###...",
    "#########",
    "...###...",
    "..#.#.#..",
    ".#..#..#.",
    "....#....",
)

/** Codex: o terminal com o prompt >_ . */
private val ICONE_CODEX = listOf(
    ".#######.",
    "#########",
    "#o#######",
    "##o######",
    "###o#####",
    "##o######",
    "#o##ooo##",
    "#########",
    ".#######.",
)

/** Gemini CLI: a estrela de quatro pontas. */
private val ICONE_GEMINI = listOf(
    "....#....",
    "....#....",
    "...###...",
    "..#####..",
    "#########",
    "..#####..",
    "...###...",
    "....#....",
    "....#....",
)

/** OpenCode: os colchetes de codigo. */
private val ICONE_OPENCODE = listOf(
    ".#######.",
    "#########",
    "#oo###oo#",
    "#o#####o#",
    "#o#####o#",
    "#o#####o#",
    "#oo###oo#",
    "#########",
    ".#######.",
)

/** Cline: o robozinho. */
private val ICONE_CLINE = listOf(
    "....#....",
    "....#....",
    ".#######.",
    "#########",
    "##o###o##",
    "#########",
    "##ooooo##",
    "#########",
    ".#######.",
)

private val ICONES = mapOf(
    "claude" to ICONE_CLAUDE,
    "codex" to ICONE_CODEX,
    "gemini" to ICONE_GEMINI,
    "opencode" to ICONE_OPENCODE,
    "cline" to ICONE_CLINE,
)

/** O icone do agente em pixels. */
@Composable
fun AgenteIcone(ag: Agente, tamanho: Dp = 18.dp, modifier: Modifier = Modifier) {
    PixelArte(
        ICONES[ag.id] ?: ICONE_CLAUDE,
        modifier.size(tamanho).semantics { contentDescription = ag.nome },
        mapOf('#' to Color(ag.cor), 'o' to Color(0xFFFFF8F5)),
    )
}

/** Selo do agente: o icone e o nome numa pilula tingida com a cor dele. */
@Composable
fun SeloAgente(ag: Agente, modifier: Modifier = Modifier, completo: Boolean = false) {
    val c = cores
    val fundo = Color(ag.cor).copy(alpha = if (c.escuro) 0.22f else 0.14f).compositeOver(c.fundo)
    Row(
        modifier.clip(CircleShape).background(fundo).padding(start = 8.dp, end = 10.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AgenteIcone(ag, 14.dp)
        Text(
            if (completo) "${ag.nome} · ${ag.empresa}" else ag.nome,
            style = Texto.pequeno.copy(fontWeight = FontWeight.Medium), color = c.texto, maxLines = 1,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}
