package io.github.duckv.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ceil

// ------------------------------------------------------------ formatos

private val BR = Locale("pt", "BR")
fun hora(ms: Long): String = SimpleDateFormat("HH:mm", BR).format(Date(ms))
fun diaDaSemana(ms: Long): String = SimpleDateFormat("EEEE", BR).format(Date(ms))

fun falta(ms: Long): String {
    val m = maxOf(1, ceil(ms / 60000.0).toLong())
    if (m < 60) return "$m min"
    val h = m / 60
    if (h < 24) return if (m % 60 != 0L) "$h h ${m % 60} min" else "$h h"
    val d = h / 24
    return if (h % 24 != 0L) "$d d ${h % 24} h" else "$d d"
}

fun compacto(n: Long): String = when {
    n < 1000 -> "$n"
    n < 1_000_000 -> String.format(BR, "%.1f mil", n / 1000.0).replace(",0 ", " ")
    n < 1_000_000_000 -> String.format(BR, "%.1f mi", n / 1_000_000.0).replace(",0 ", " ")
    else -> String.format(BR, "%.1f bi", n / 1_000_000_000.0).replace(",0 ", " ")
}

fun plural(n: Int, um: String, varios: String) = "$n ${if (n == 1) um else varios}"

// Aviso curto no rodape da tela (snackbar).
val LocalAviso = staticCompositionLocalOf<(String) -> Unit> { {} }

// ------------------------------------------------------------ medidores

/**
 * Barra de progresso no desenho do Material 3: trilho claro, parte cheia arredondada, uma
 * fresta entre as duas e o ponto de parada no fim. Sem [quenteDe], vira casas (tarefas).
 */
@Composable
fun Celulas(total: Int, cheias: Int, cor: Color, modifier: Modifier = Modifier, quenteDe: Int? = 16, agora: Int = -1, altura: Dp = 4.dp) {
    val c = cores
    val alto = altura.coerceIn(4.dp, 6.dp)
    Canvas(modifier.fillMaxWidth().height(alto)) {
        if (total <= 0) return@Canvas
        val h = size.height
        val raio = CornerRadius(h / 2, h / 2)
        val trilho = cor.copy(alpha = if (c.escuro) 0.28f else 0.22f)
        if (quenteDe == null) {
            // casas: uma por tarefa
            val gap = 3.dp.toPx()
            val w = (size.width - gap * (total - 1)) / total
            for (i in 0 until total) {
                val corCasa = when {
                    i < cheias -> cor
                    i == agora -> cor.copy(alpha = 0.55f)
                    else -> trilho
                }
                drawRoundRect(corCasa, Offset(i * (w + gap), 0f), Size(w, h), raio)
            }
            return@Canvas
        }
        val f = (cheias.toFloat() / total).coerceIn(0f, 1f)
        val cheio = if (f >= 1f) c.perigo else cor
        val gap = 4.dp.toPx()
        val wCheio = size.width * f
        if (f > 0f) drawRoundRect(cheio, Offset.Zero, Size(wCheio.coerceAtLeast(h), h), raio)
        if (f < 1f) {
            val ini = if (f > 0f) wCheio + gap else 0f
            drawRoundRect(trilho, Offset(ini, 0f), Size((size.width - ini).coerceAtLeast(0f), h), raio)
            // ponto de parada no fim do trilho
            drawCircle(cheio, h / 2, Offset(size.width - h / 2, h / 2))
        }
    }
}

// ------------------------------------------------------------ botoes

enum class Peso { Principal, Comum, Quieto, Perigo, Invertido }

/**
 * Botoes do Material 3. Principal: cheio laranja. Comum: tonal. Quieto: contornado.
 * Perigo: contornado em vermelho. Invertido: contornado sobre um cartao colorido.
 * [vertical] desenha um bloco de acao (icone em cima do rotulo) num cartao tonal.
 */
@Composable
fun Botao(
    texto: String?,
    aoTocar: () -> Unit,
    modifier: Modifier = Modifier,
    icone: ImageVector? = null,
    peso: Peso = Peso.Comum,
    habilitado: Boolean = true,
    altura: Dp = 40.dp,
    vertical: Boolean = false,
    descricao: String? = null,
    linhas: Int = 2,
) {
    val c = cores
    // todo botao faz o "tic" (se os sons dos botoes estiverem ligados nas Opcoes)
    val toqueOriginal = aoTocar
    val aoTocar: () -> Unit = { io.github.duckv.app.Sons.clique(); toqueOriginal() }
    val alto = altura.coerceIn(36.dp, 56.dp)
    if (vertical) {
        val (fundo, frente) = when (peso) {
            Peso.Perigo -> c.erroCont to c.noErroCont
            Peso.Principal -> c.invFundo to c.invTexto
            else -> c.cartao to c.texto
        }
        Surface(
            aoTocar, modifier.heightIn(min = 88.dp).semantics { if (descricao != null) contentDescription = descricao },
            enabled = habilitado, shape = RoundedCornerShape(16.dp), color = fundo, contentColor = frente,
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                if (icone != null) Icon(icone, null, Modifier.size(24.dp))
                if (texto != null) {
                    Spacer(Modifier.size(8.dp))
                    Text(texto, style = Texto.rotulo, textAlign = TextAlign.Center, maxLines = linhas, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        return
    }
    val m = modifier.heightIn(min = alto).semantics { if (descricao != null) contentDescription = descricao }
    val pad = if (texto == null) PaddingValues(horizontal = 12.dp) else if (icone != null) PaddingValues(start = 16.dp, end = 24.dp) else PaddingValues(horizontal = 24.dp)
    val conteudo: @Composable RowScope.() -> Unit = {
        if (icone != null) Icon(icone, if (texto == null) descricao else null, Modifier.size(18.dp))
        if (icone != null && texto != null) Spacer(Modifier.size(8.dp))
        if (texto != null) Text(texto, style = Texto.rotulo, textAlign = TextAlign.Center, maxLines = linhas, overflow = TextOverflow.Ellipsis)
    }
    when (peso) {
        Peso.Principal -> Button(aoTocar, m, habilitado, contentPadding = pad, content = conteudo)
        Peso.Comum -> FilledTonalButton(
            aoTocar, m, habilitado, contentPadding = pad,
            colors = ButtonDefaults.filledTonalButtonColors(containerColor = c.cartaoAlto, contentColor = c.texto),
            content = conteudo,
        )
        Peso.Quieto -> OutlinedButton(
            aoTocar, m, habilitado, contentPadding = pad,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = c.texto),
            border = BorderStroke(1.dp, if (habilitado) c.vazio else c.linha), content = conteudo,
        )
        Peso.Perigo -> OutlinedButton(
            aoTocar, m, habilitado, contentPadding = pad,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = c.perigo),
            border = BorderStroke(1.dp, if (habilitado) c.perigo else c.linha), content = conteudo,
        )
        Peso.Invertido -> OutlinedButton(
            aoTocar, m, habilitado, contentPadding = pad,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = c.invTexto),
            border = BorderStroke(1.dp, c.invTexto.copy(alpha = 0.45f)), content = conteudo,
        )
    }
}

/** Acoes que apagam ou encerram pedem um segundo toque no proprio botao. */
@Composable
fun BotaoConfirma(texto: String, icone: ImageVector, aoConfirmar: () -> Unit, modifier: Modifier = Modifier, peso: Peso = Peso.Comum, vertical: Boolean = false) {
    var armado by remember { mutableStateOf(false) }
    LaunchedEffect(armado) {
        if (armado) {
            delay(3500)
            armado = false
        }
    }
    Botao(
        if (armado) "Toque de novo para confirmar" else texto,
        {
            if (armado) {
                armado = false
                aoConfirmar()
            } else armado = true
        },
        modifier, icone, if (armado) Peso.Perigo else peso, vertical = vertical,
    )
}

/** Escolha unica entre poucas opcoes: chip de filtro do Material 3, com o ponto da cor quando houver. */
@Composable
fun Escolha(texto: String, marcado: Boolean, aoTocar: () -> Unit, modifier: Modifier = Modifier, marca: Color? = null) {
    val c = cores
    FilterChip(
        marcado, { io.github.duckv.app.Sons.clique(); aoTocar() }, { Text(texto, style = Texto.rotulo) }, modifier.heightIn(min = 32.dp),
        leadingIcon = when {
            marca != null -> { { Marca(marca, tamanho = 10.dp) } }
            marcado -> { { Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)) } }
            else -> null
        },
        shape = RoundedCornerShape(8.dp),
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = c.invFundo, selectedLabelColor = c.invTexto, selectedLeadingIconColor = c.invTexto,
            labelColor = c.texto, containerColor = Color.Transparent,
        ),
        border = FilterChipDefaults.filterChipBorder(true, marcado, borderColor = c.vazio, selectedBorderColor = Color.Transparent),
    )
}

/** Titulo de secao do Material 3: titleSmall, sem caixa alta. */
@Composable
fun TituloSecao(texto: String, modifier: Modifier = Modifier) {
    Text(texto, style = Texto.secao, color = cores.apoio, modifier = modifier.padding(bottom = 8.dp))
}

/** Cartao tonal (surfaceContainer), cantos de 16 dp, sem sombra. */
@Composable
fun Cartao(modifier: Modifier = Modifier, conteudo: @Composable () -> Unit) {
    Card(
        modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cores.cartao, contentColor = cores.texto),
    ) { conteudo() }
}

@Composable
fun Marca(cor: Color, modifier: Modifier = Modifier, tamanho: Dp = 10.dp) {
    Box(modifier.size(tamanho).clip(CircleShape).background(cor))
}

@Composable
fun Divisoria(modifier: Modifier = Modifier) {
    HorizontalDivider(modifier, thickness = 1.dp, color = cores.linha)
}

@Composable
fun Espaco(dp: Dp) = Spacer(Modifier.size(dp))

@Composable
fun EspacoLargo(dp: Dp) = Spacer(Modifier.width(dp))
