package io.github.duckv.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color

// Ilustracoes em pixels, do mesmo mundo do pato: cada letra e uma cor da paleta, '.' e vazio.
// O desenho se ajusta ao maior quadrado que cabe no espaco, sem distorcer.

/** Balao de fala com uma interrogacao: perguntas do Claude. '#' contorno, 'o' sinal. */
val BALAO = listOf(
    ".##########.",
    "#..........#",
    "#....oo....#",
    "#...o..o...#",
    "#......o...#",
    "#.....o....#",
    "#..........#",
    "#.....o....#",
    ".####.######",
    "....#.#.....",
    "....##......",
)

/** Notebook aberto: o computador. '#' contorno, 'o' tela acesa, 'b' base. */
val NOTEBOOK = listOf(
    "..##########..",
    "..#oooooooo#..",
    "..#o......o#..",
    "..#o.oo...o#..",
    "..#o......o#..",
    "..#oooooooo#..",
    "..##########..",
    "##############",
    "#bbbbbbbbbbbb#",
    "##############",
)

/** Celular: o app. '#' contorno, 'o' tela. */
val CELULAR = listOf(
    "########",
    "#oooooo#",
    "#o....o#",
    "#o.oo.o#",
    "#o....o#",
    "#o.oo.o#",
    "#oooooo#",
    "#..##..#",
    "########",
)

/** Coracao: carinho no pato. 'o' preenchimento. */
val CORACAO = listOf(
    ".oo.oo.",
    "ooooooo",
    "ooooooo",
    ".ooooo.",
    "..ooo..",
    "...o...",
)

/** Faisca de quatro pontas: algo novo, festa. 'o' preenchimento. */
val FAISCA = listOf(
    "...o...",
    "...o...",
    "..ooo..",
    "ooooooo",
    "..ooo..",
    "...o...",
    "...o...",
)

/** Nuvem: nada por aqui ainda. '#' contorno, 'o' miolo. */
val NUVEM = listOf(
    "....####......",
    "...#oooo#.....",
    "..#oooooo####.",
    ".#oooooooooo#.",
    "#oooooooooooo#",
    "#oooooooooooo#",
    ".############.",
)

/** Ovo: a conta que ainda nao nasceu (sem login). '#' contorno, 'o' casca, 'm' manchas. */
val OVO = listOf(
    "...####...",
    "..#oooo#..",
    ".#oomooo#.",
    ".#oooooo#.",
    "#oooooomo#",
    "#omoooooo#",
    "#oooooooo#",
    ".#oooooo#.",
    "..######..",
)

@Composable
fun PixelArte(desenho: List<String>, modifier: Modifier, paleta: Map<Char, Color>, deslocar: (Int, Int) -> Offset = { _, _ -> Offset.Zero }) {
    val colunas = desenho.maxOf { it.length }
    val linhas = desenho.size
    Canvas(modifier) {
        val u = minOf(size.width / colunas, size.height / linhas)
        val ox = (size.width - u * colunas) / 2
        val oy = (size.height - u * linhas) / 2
        desenho.forEachIndexed { y, linha ->
            linha.forEachIndexed { x, ch ->
                val cor = paleta[ch] ?: return@forEachIndexed
                val d = deslocar(x, y)
                // meio pixel a mais para nao abrir frestas entre as casas
                drawRect(cor, Offset(ox + (x + d.x) * u, oy + (y + d.y) * u), Size(u + 0.6f, u + 0.6f))
            }
        }
    }
}
