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

val Laranja = Color(0xFFFF7A1A)
val LaranjaBorda = Color(0xFFB84A08)
val Tinta = Color(0xFF1D1410)
val Creme = Color(0xFFFFF6EE)

@Immutable
data class Cores(
    val fundo: Color,
    val superficie: Color,
    val elevada: Color,
    val linha: Color,
    val vazio: Color,
    val texto: Color,
    val apoio: Color,
    val realce: Color,
    val perigo: Color,
    val ok: Color,
    val invFundo: Color,
    val invTexto: Color,
    val invApoio: Color,
    val invLinha: Color,
    val escuro: Boolean,
)

private val Claro = Cores(
    fundo = Color(0xFFF6F3F1), superficie = Color(0xFFFFFFFF), elevada = Color(0xFFFBF8F6),
    linha = Color(0xFFE7E0DA), vazio = Color(0xFFD6CCC3), texto = Tinta, apoio = Color(0xFF675A51),
    realce = Color(0xFFAD3C08), perigo = Color(0xFFC8261B), ok = Color(0xFF1A7A43),
    invFundo = Tinta, invTexto = Color(0xFFF7EFE8), invApoio = Color(0xFFC9B8AA), invLinha = Color(0xFF57463B),
    escuro = false,
)
private val Escuro = Cores(
    fundo = Color(0xFF17110E), superficie = Color(0xFF211814), elevada = Color(0xFF2A201A),
    linha = Color(0xFF3A2D25), vazio = Color(0xFF4F3E33), texto = Color(0xFFF7EFE8), apoio = Color(0xFFB9A89B),
    realce = Color(0xFFFF9A4D), perigo = Color(0xFFFF6B5E), ok = Color(0xFF4CD08A),
    invFundo = Color(0xFFF7EFE8), invTexto = Tinta, invApoio = Color(0xFF5F5249), invLinha = Color(0xFFCDBFB3),
    escuro = true,
)

val LocalCores = staticCompositionLocalOf { Claro }
val cores: Cores @Composable get() = LocalCores.current

val Ui = FontFamily(
    Font(R.font.bricolage_regular, FontWeight.Normal),
    Font(R.font.bricolage_medium, FontWeight.Medium),
    Font(R.font.bricolage_semibold, FontWeight.SemiBold),
    Font(R.font.bricolage_bold, FontWeight.Bold),
)
val Pixel = FontFamily(Font(R.font.pixelify_medium, FontWeight.Medium))
val Mono = FontFamily(Font(R.font.jetbrains_mono, FontWeight.Normal))

object Texto {
    val marca = TextStyle(fontFamily = Pixel, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 26.sp)
    val conta = TextStyle(fontFamily = Pixel, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 26.sp)
    val numero = TextStyle(fontFamily = Pixel, fontWeight = FontWeight.Medium, fontSize = 28.sp, lineHeight = 28.sp)
    val titulo = TextStyle(fontFamily = Ui, fontWeight = FontWeight.SemiBold, fontSize = 19.sp, lineHeight = 24.sp)
    val secao = TextStyle(fontFamily = Ui, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 16.sp, letterSpacing = 0.6.sp)
    val corpo = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 23.sp)
    val rotulo = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp)
    val apoio = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp)
    val pequeno = TextStyle(fontFamily = Ui, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp)
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
            primary = Laranja, onPrimary = Tinta, background = c.fundo, onBackground = c.texto,
            surface = c.superficie, onSurface = c.texto, surfaceVariant = c.elevada, onSurfaceVariant = c.apoio,
            outline = c.vazio, outlineVariant = c.linha, error = c.perigo, surfaceContainerHigh = c.elevada,
            surfaceContainer = c.superficie, surfaceContainerLow = c.superficie, secondaryContainer = c.elevada,
        )
    } else {
        lightColorScheme(
            primary = Laranja, onPrimary = Tinta, background = c.fundo, onBackground = c.texto,
            surface = c.superficie, onSurface = c.texto, surfaceVariant = c.elevada, onSurfaceVariant = c.apoio,
            outline = c.vazio, outlineVariant = c.linha, error = c.perigo, surfaceContainerHigh = c.elevada,
            surfaceContainer = c.superficie, surfaceContainerLow = c.superficie, secondaryContainer = c.elevada,
        )
    }
    val base = Typography()
    val tipos = Typography(
        bodyLarge = Texto.corpo, bodyMedium = Texto.apoio, bodySmall = Texto.pequeno,
        titleLarge = Texto.titulo, titleMedium = Texto.rotulo, labelLarge = Texto.rotulo,
        labelMedium = Texto.pequeno, labelSmall = Texto.pequeno.copy(fontSize = 11.sp),
        headlineSmall = base.headlineSmall.copy(fontFamily = Ui),
    )
    CompositionLocalProvider(LocalCores provides c) {
        MaterialTheme(colorScheme = esquema, typography = tipos, content = conteudo)
    }
}
