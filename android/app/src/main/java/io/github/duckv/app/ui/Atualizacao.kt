package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.InstallMobile
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Atualizacao
import io.github.duckv.app.Atualizacao.Etapa
import io.github.duckv.app.VersaoApp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Cartao no inicio quando o computador trouxe uma versao nova: o pato comemora, um toque abre a folha. */
@Composable
fun CartaoAtualizacao(v: VersaoApp, pato: String, aoVer: () -> Unit, aoDepois: () -> Unit) {
    val c = cores
    Row(
        Modifier.widthIn(max = 600.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.cartao)
            .clickable(role = Role.Button, onClickLabel = "Ver a versão nova", onClick = aoVer)
            .padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Pato("festa", if (pato == "nenhum") "parado" else pato, Laranja, Modifier.size(48.dp), andar = false, tocavel = false)
        EspacoLargo(12.dp)
        Column(Modifier.weight(1f)) {
            Text("duckV ${v.versao} chegou", style = Texto.rotulo, color = c.texto)
            Text("Toque para ver o que mudou e instalar.", style = Texto.pequeno, color = c.apoio)
        }
        Text(
            "Depois", style = Texto.rotulo, color = c.apoio,
            modifier = Modifier.clip(RoundedCornerShape(20.dp)).clickable(role = Role.Button, onClick = aoDepois).padding(horizontal = 12.dp, vertical = 10.dp),
        )
    }
}

/**
 * A folha da atualizacao: o pato (parado, trabalhando no download, em festa quando esta pronta),
 * da versao instalada para a nova, o que mudou, e a acao do momento. O progresso usa as casas em
 * pixels das barras do app.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolhaAtualizacao(v: VersaoApp, pato: String, aoFechar: () -> Unit) {
    val c = cores
    val ctx = LocalContext.current
    val aviso = LocalAviso.current
    val etapa by Atualizacao.etapa.collectAsState()
    LaunchedEffect(v.versao) { Atualizacao.preparar(ctx, v) }
    // volta das configuracoes do Android: confere de novo se o duckV ja pode instalar
    var podeInstalar by remember { mutableStateOf(Atualizacao.podeInstalar(ctx)) }
    androidx.lifecycle.compose.LifecycleResumeEffect(Unit) {
        podeInstalar = Atualizacao.podeInstalar(ctx)
        onPauseOrDispose { }
    }

    ModalBottomSheet(aoFechar, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.fundo) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            // o pato no palco, com o estado do momento
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.size(132.dp).clip(CircleShape).background(c.invFundo.copy(alpha = if (c.escuro) 0.35f else 0.6f)))
                val humor = when (etapa) {
                    is Etapa.Baixando, Etapa.Conferindo -> "trabalha"
                    is Etapa.Pronta -> "festa"
                    is Etapa.Erro -> "dorme"
                    Etapa.Parada -> "parado"
                }
                Pato(humor, if (pato == "nenhum") "parado" else pato, Laranja, Modifier.size(104.dp), andar = false)
            }

            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Versão nova", style = Texto.rotulo, color = c.realce)
                Logo(tamanho = 30)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pilula(Atualizacao.instalada(ctx), atual = false)
                    Icon(Icons.AutoMirrored.Rounded.ArrowForward, "para", tint = c.apoio, modifier = Modifier.size(18.dp))
                    Pilula(v.versao, atual = true)
                }
                Text(
                    listOf(
                        v.publicada.takeIf { it > 0 }?.let { "Publicada em " + SimpleDateFormat("d 'de' MMMM", Locale.forLanguageTag("pt-BR")).format(Date(it)) },
                        v.tamanho.takeIf { it > 0 }?.let { tamanhoLegivel(it) },
                    ).filterNotNull().joinToString(" · "),
                    style = Texto.pequeno, color = c.apoio,
                )
            }

            Acao(etapa, v, podeInstalar, aviso)

            if (v.notas.isNotBlank()) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.cartao).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("O que mudou", style = Texto.secao, color = c.texto)
                    Notas(v.notas)
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Rounded.Shield, null, tint = c.apoio, modifier = Modifier.size(16.dp))
                Text(
                    "Vem do seu computador, conferida com o arquivo publicado no GitHub. O Android só instala por cima se a assinatura for a mesma.",
                    style = Texto.pequeno, color = c.apoio,
                )
            }
        }
    }
}

@Composable
private fun Pilula(versao: String, atual: Boolean) {
    val c = cores
    Text(
        versao,
        style = Texto.codigo.copy(textDecoration = if (atual) null else TextDecoration.LineThrough),
        color = if (atual) c.invTexto else c.apoio,
        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (atual) c.invFundo else c.elevada).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun Acao(etapa: Etapa, v: VersaoApp, podeInstalar: Boolean, aviso: (String) -> Unit) {
    val c = cores
    val ctx = LocalContext.current
    val largo = Modifier.fillMaxWidth()
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        when (etapa) {
            Etapa.Parada -> Botao("Baixar e instalar · ${tamanhoLegivel(v.tamanho)}", { Atualizacao.baixar(ctx, v) }, largo, Icons.Rounded.Download, Peso.Principal, altura = 52.dp)
            is Etapa.Baixando, Etapa.Conferindo -> {
                val total = (etapa as? Etapa.Baixando)?.total?.takeIf { it > 0 } ?: v.tamanho
                val feito = (etapa as? Etapa.Baixando)?.feito ?: total
                val f = (feito.toFloat() / total).coerceIn(0f, 1f)
                val casas = 24
                val cheias = (f * casas).toInt()
                // casas em pixels, a proxima piscando de leve
                Celulas(casas, cheias, Laranja, quenteDe = null, agora = if (cheias < casas) cheias else -1, altura = 6.dp)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (etapa == Etapa.Conferindo) "Conferindo o arquivo…" else "Baixando do computador · ${(f * 100).toInt()}%",
                        style = Texto.rotulo, color = c.texto, modifier = Modifier.weight(1f),
                    )
                    Text("${tamanhoLegivel(feito)} de ${tamanhoLegivel(total)}", style = Texto.pequeno, color = c.apoio)
                }
                if (etapa is Etapa.Baixando) Botao("Parar", { Atualizacao.parar() }, largo, peso = Peso.Quieto)
            }
            is Etapa.Pronta -> if (podeInstalar) {
                Botao("Instalar agora", { Atualizacao.instalar(ctx, etapa.arquivo)?.let(aviso) }, largo, Icons.Rounded.InstallMobile, Peso.Principal, altura = 52.dp)
                Text("O Android pede para confirmar. As contas e o pareamento continuam como estão.", style = Texto.pequeno, color = c.apoio)
            } else {
                Aviso(
                    null, "Falta uma permissão, uma vez só",
                    "O Android pede que você deixe o duckV instalar atualizações. Ative \"Permitir desta fonte\" e volte aqui.",
                    erro = false,
                )
                Botao("Abrir a permissão", { Atualizacao.liberarInstalacao(ctx) }, largo, Icons.AutoMirrored.Rounded.ArrowForward, Peso.Principal, altura = 52.dp)
            }
            is Etapa.Erro -> {
                Aviso(null, "Não deu para baixar", etapa.msg, erro = true)
                Botao("Tentar de novo", { Atualizacao.baixar(ctx, v) }, largo, Icons.Rounded.Refresh, Peso.Principal, altura = 52.dp)
            }
        }
    }
}

// As notas da versao, do jeito que vem do GitHub: "- " vira item com um quadradinho laranja em pixel,
// **negrito** e `codigo` ganham o estilo do app; o resto vira paragrafo.
@Composable
private fun Notas(md: String) {
    val c = cores
    for (linha in md.lines().map { it.trimEnd() }.filter { it.isNotBlank() }) {
        val item = linha.trimStart().startsWith("- ") || linha.trimStart().startsWith("* ")
        val texto = rico(if (item) linha.trimStart().drop(2) else linha.trimStart('#', ' '), c)
        if (item) {
            Row {
                Box(Modifier.padding(top = 8.dp, end = 12.dp).size(6.dp).background(Laranja))
                Text(texto, style = Texto.apoio, color = c.texto)
            }
        } else Text(texto, style = Texto.apoio, color = c.apoio)
    }
}

private fun rico(t: String, c: Cores): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < t.length) {
        when {
            t.startsWith("**", i) && t.indexOf("**", i + 2) > 0 -> {
                val f = t.indexOf("**", i + 2)
                withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = c.texto)) { append(t.substring(i + 2, f)) }
                i = f + 2
            }
            t[i] == '`' && t.indexOf('`', i + 1) > 0 -> {
                val f = t.indexOf('`', i + 1)
                withStyle(SpanStyle(fontFamily = Mono, background = c.elevada)) { append(t.substring(i + 1, f).replace("\\\\", "\\")) }
                i = f + 1
            }
            else -> append(t[i++])
        }
    }
}
