package io.github.duckv.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Estado
import java.util.Calendar

/** Sol de dia. */
private val SOL = listOf(
    "....#....",
    ".#.....#.",
    "...###...",
    "..#####..",
    "#.#####.#",
    "..#####..",
    "...###...",
    ".#.....#.",
    "....#....",
)

/** Lua de noite, com duas estrelinhas. */
private val LUA = listOf(
    "..####..o",
    ".###.....",
    "###......",
    "###....o.",
    "###......",
    "###......",
    ".###.....",
    "..####...",
)

private data class Periodo(val oi: String, val noite: Boolean, val madrugada: Boolean)

private fun periodo(agora: Long): Periodo {
    val h = Calendar.getInstance().apply { timeInMillis = agora }.get(Calendar.HOUR_OF_DAY)
    return when (h) {
        in 5..11 -> Periodo("Bom dia", noite = false, madrugada = false)
        in 12..17 -> Periodo("Boa tarde", noite = false, madrugada = false)
        in 18..23 -> Periodo("Boa noite", noite = true, madrugada = false)
        else -> Periodo("Boa noite", noite = true, madrugada = true)
    }
}

/** O patinho do lobby: cumprimenta conforme a hora e conta em uma frase como o bando esta. */
@Composable
fun Saudacao(e: Estado, agora: Long, pato: String, modifier: Modifier = Modifier) {
    val c = cores
    val p = periodo(agora)
    // O nome vem do e-mail da primeira conta logada ("maria.silva@..." vira "Maria").
    val nome = e.contas.firstNotNullOfOrNull { it.email?.takeIf { m -> '@' in m } }
        ?.substringBefore('@')?.split('.', '_', '-')?.firstOrNull()?.takeIf { it.length in 2..16 && it.all(Char::isLetter) }
        ?.replaceFirstChar { it.uppercase() }
    val vivas = e.sessoes.filter { it.viva && !it.login }
    val trabalhando = vivas.count { it.status == "working" }
    val pedindo = e.contas.filter { ct -> vivas.any { it.conta == ct.id && it.precisa } }

    val frase = when {
        pedindo.size == 1 -> "${pedindo[0].nome} precisa de você."
        pedindo.size > 1 -> "${pedindo.size} contas precisam de você."
        trabalhando > 0 && p.madrugada -> "Ainda acordado? O bando segue trabalhando em ${sessoes(trabalhando)}."
        trabalhando > 0 -> "Seus patinhos estão trabalhando em ${sessoes(trabalhando)}."
        p.madrugada -> "Ainda acordado? Tudo quieto por aqui. Bom descanso."
        vivas.isNotEmpty() -> "Tudo pronto, esperando você."
        p.oi == "Bom dia" -> "Que tal começar o dia abrindo uma sessão?"
        p.noite -> "Tudo tranquilo. O bando descansa."
        else -> "Tudo calmo por aqui."
    }
    val bicho = when {
        pedindo.isNotEmpty() -> "pede"
        trabalhando > 0 -> "trabalha"
        p.madrugada || (p.noite && vivas.isEmpty()) -> "dorme"
        else -> "parado"
    }

    // o patinho do bando ao lado do cumprimento; os numeros ficam no cartao de cada conta
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (pato != "nenhum") Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Pato(bicho, pato, Laranja, Modifier.size(width = 52.dp, height = 40.dp), andar = false)
            ChaoSaudacao(Modifier.width(46.dp))
        }
        Column(Modifier.weight(1f).padding(start = if (pato == "nenhum") 0.dp else 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (nome != null) "${p.oi}, $nome" else p.oi, style = Texto.titulo, color = c.texto, maxLines = 1)
                // o sol ou a lua, pequenos, depois do nome
                if (p.noite) PixelArte(LUA, Modifier.padding(start = 8.dp).size(16.dp), mapOf('#' to Color(0xFFF2D06B), 'o' to c.apoio))
                else PixelArte(SOL, Modifier.padding(start = 8.dp).size(16.dp), mapOf('#' to Color(0xFFFFB22E)))
            }
            Text(frase, style = Texto.apoio, color = if (pedindo.isNotEmpty()) c.realce else c.apoio, maxLines = 2)
        }
    }
}

private fun sessoes(n: Int) = if (n == 1) "1 sessão" else "$n sessões"

/** Chaozinho de pixels sob o pato da saudacao. */
@Composable
private fun ChaoSaudacao(modifier: Modifier) {
    Canvas(modifier.height(4.dp)) {
        val lado = 2.5.dp.toPx()
        val n = (size.width / lado).toInt()
        for (i in 0 until n) {
            val meio = 1f - kotlin.math.abs(i - n / 2f) / (n / 2f)
            drawRect(Laranja.copy(alpha = 0.12f + 0.45f * meio), Offset(i * lado, 0f), Size(lado - 0.5f, lado))
        }
    }
}
