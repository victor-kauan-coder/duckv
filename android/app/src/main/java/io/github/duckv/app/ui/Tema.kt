package io.github.duckv.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import io.github.duckv.app.R

// Material 3 com papeis de cor tirados do laranja da marca, sobre neutros quentes.
// O laranja da marca fica como botao cheio (texto escuro por cima); o laranja de texto
// e mais escuro para ler bem em fundo claro.
val Laranja = Color(0xFFFF7A1A)
val LaranjaBorda = Color(0xFFB84A08)
val Tinta = Color(0xFF221A15)
val Creme = Color(0xFFFFF8F5)

@Immutable
data class Cores(
    val fundo: Color, // surface
    val superficie: Color, // surfaceContainerLow: campos e listas
    val elevada: Color, // surfaceContainerHigh
    val linha: Color, // outlineVariant
    val vazio: Color, // outline
    val texto: Color, // onSurface
    val apoio: Color, // onSurfaceVariant
    val realce: Color, // primary como texto
    val perigo: Color,
    val ok: Color,
    val invFundo: Color, // primaryContainer: o que precisa de voce
    val invTexto: Color,
    val invApoio: Color,
    val invLinha: Color,
    val escuro: Boolean,
    val primario: Color = Laranja,
    val noPrimario: Color = Color(0xFF2B1200),
    val cartao: Color = superficie, // surfaceContainer: cartoes tonais
    val cartaoAlto: Color = elevada, // surfaceContainerHighest
    val erroCont: Color = Color(0xFFFFDAD6),
    val noErroCont: Color = Color(0xFF410002),
)

private val Claro = Cores(
    fundo = Color(0xFFFFF8F5), superficie = Color(0xFFFFF1EA), elevada = Color(0xFFF3E6DE),
    linha = Color(0xFFD8C2B6), vazio = Color(0xFF85736A), texto = Tinta, apoio = Color(0xFF53443B),
    realce = Color(0xFF9A4600), perigo = Color(0xFFBA1A1A), ok = Color(0xFF2E7D32),
    invFundo = Color(0xFFFFDBC8), invTexto = Color(0xFF331200), invApoio = Color(0xFF6A3A1C), invLinha = Color(0xFFE9B999),
    escuro = false,
    cartao = Color(0xFFF9ECE5), cartaoAlto = Color(0xFFEDE0D9),
)
private val Escuro = Cores(
    fundo = Color(0xFF1A120E), superficie = Color(0xFF231A15), elevada = Color(0xFF332823),
    linha = Color(0xFF53443B), vazio = Color(0xFFA08D84), texto = Color(0xFFF1DFD6), apoio = Color(0xFFD8C2B6),
    realce = Color(0xFFFFB68A), perigo = Color(0xFFFFB4AB), ok = Color(0xFF7FD48A),
    invFundo = Color(0xFF7A3400), invTexto = Color(0xFFFFDBC8), invApoio = Color(0xFFF2BC9A), invLinha = Color(0xFF9C5426),
    escuro = true,
    primario = Color(0xFFFF8C3A), noPrimario = Color(0xFF2B1200),
    cartao = Color(0xFF271E19), cartaoAlto = Color(0xFF3E332D),
    erroCont = Color(0xFF93000A), noErroCont = Color(0xFFFFDAD6),
)

val LocalCores = staticCompositionLocalOf { Claro }
val cores: Cores @Composable get() = LocalCores.current

// Roboto, a letra do sistema, em toda a interface. A fonte de pixel mora so no V do logo e no pato.
val Ui = FontFamily.Default
val Pixel = FontFamily(Font(R.font.pixelify_medium, FontWeight.Medium))
val Mono = FontFamily(Font(R.font.jetbrains_mono, FontWeight.Normal))

/** Escala tipografica do Material 3, com os nomes que o app ja usa. */
object Texto {
    val marca = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Medium, fontSize = 22.sp, lineHeight = 28.sp)
    val conta = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.15.sp)
    val numero = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Normal, fontSize = 28.sp, lineHeight = 36.sp)
    val titulo = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Normal, fontSize = 22.sp, lineHeight = 28.sp)
    val secao = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp)
    val corpo = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.5.sp)
    val rotulo = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp)
    val apoio = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.25.sp)
    val pequeno = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.4.sp)
    val codigo = TextStyle(fontFamily = Mono, fontSize = 13.sp, lineHeight = 19.sp)
}

// Texto legivel em cima da cor de uma conta.
fun sobre(c: Color) = if (c.luminance() > 0.33f) Tinta else Creme

@Composable
fun TemaClaudeV(tema: String, conteudo: @Composable () -> Unit) {
    val escuro = when (tema) {
        "claro" -> false
        "escuro" -> true
        else -> isSystemInDarkTheme()
    }
    val c = if (escuro) Escuro else Claro
    val esquema = if (escuro) {
        darkColorScheme(
            primary = c.primario, onPrimary = c.noPrimario, primaryContainer = c.invFundo, onPrimaryContainer = c.invTexto,
            secondary = c.realce, onSecondary = c.noPrimario, secondaryContainer = c.elevada, onSecondaryContainer = c.texto,
            background = c.fundo, onBackground = c.texto, surface = c.fundo, onSurface = c.texto,
            surfaceVariant = c.cartaoAlto, onSurfaceVariant = c.apoio, outline = c.vazio, outlineVariant = c.linha,
            error = c.perigo, errorContainer = c.erroCont, onErrorContainer = c.noErroCont,
            surfaceContainerLowest = Color(0xFF140D09), surfaceContainerLow = c.superficie, surfaceContainer = c.cartao,
            surfaceContainerHigh = c.elevada, surfaceContainerHighest = c.cartaoAlto,
            inverseSurface = c.texto, inverseOnSurface = c.fundo, inversePrimary = Color(0xFF9A4600),
        )
    } else {
        lightColorScheme(
            primary = c.primario, onPrimary = c.noPrimario, primaryContainer = c.invFundo, onPrimaryContainer = c.invTexto,
            secondary = c.realce, onSecondary = Color.White, secondaryContainer = c.invFundo, onSecondaryContainer = c.invTexto,
            background = c.fundo, onBackground = c.texto, surface = c.fundo, onSurface = c.texto,
            surfaceVariant = c.cartaoAlto, onSurfaceVariant = c.apoio, outline = c.vazio, outlineVariant = c.linha,
            error = c.perigo, errorContainer = c.erroCont, onErrorContainer = c.noErroCont,
            surfaceContainerLowest = Color.White, surfaceContainerLow = c.superficie, surfaceContainer = c.cartao,
            surfaceContainerHigh = c.elevada, surfaceContainerHighest = c.cartaoAlto,
            inverseSurface = Color(0xFF382E29), inverseOnSurface = Color(0xFFFFEDE5), inversePrimary = Color(0xFFFFB68A),
        )
    }
    val tipos = Typography(
        titleLarge = Texto.titulo, titleMedium = Texto.conta, titleSmall = Texto.secao,
        bodyLarge = Texto.corpo, bodyMedium = Texto.apoio, bodySmall = Texto.pequeno,
        labelLarge = Texto.rotulo, labelMedium = Texto.pequeno.copy(fontWeight = FontWeight.Medium, letterSpacing = 0.5.sp),
        labelSmall = Texto.pequeno.copy(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.5.sp),
        headlineSmall = Texto.numero.copy(fontSize = 24.sp, lineHeight = 32.sp),
    )
    CompositionLocalProvider(LocalCores provides c) {
        MaterialTheme(colorScheme = esquema, typography = tipos, content = conteudo)
    }
}
