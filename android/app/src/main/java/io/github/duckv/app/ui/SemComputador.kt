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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.NuvemGuardada

/**
 * Com o computador fora de alcance, as sessoes na nuvem continuam rodando. Aqui fica a ultima lista
 * que o duckV viu (com a hora da leitura); um toque abre a sessao no app Claude ou no claude.ai, e os
 * botoes de baixo criam uma sessao nova ou abrem o app Claude. Criar e responder e la, nao aqui.
 */
@Composable
fun PainelNuvemSemComputador(modifier: Modifier = Modifier) {
    val c = cores
    val ctx = LocalContext.current
    val guardada by NuvemGuardada.lista.collectAsState()
    val temApp = remember { NuvemGuardada.temAppClaude(ctx) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(iconeOrigem("nuvem"), null, Modifier.size(20.dp), tint = c.texto)
            Text("Na nuvem", style = Texto.secao, color = c.texto, modifier = Modifier.padding(start = 8.dp))
        }
        val l = guardada
        Text(
            when {
                l == null -> "As sessões na nuvem continuam rodando com o computador desligado. Elas aparecem aqui depois que o duckV vê o computador ao menos uma vez."
                l.itens.isEmpty() -> "Nenhuma sessão na nuvem aberta da última vez que o duckV viu o computador (${quando(l.vistaEm)})."
                else -> "Continuam rodando com o computador desligado. Lista de ${quando(l.vistaEm)}; o estado de agora está no app Claude."
            },
            style = Texto.apoio, color = c.apoio,
        )
        if (l != null && l.itens.isNotEmpty()) {
            val forma = RoundedCornerShape(16.dp)
            Column(Modifier.fillMaxWidth().clip(forma).background(c.cartao)) {
                for ((i, s) in l.itens.withIndex()) {
                    if (i > 0) Divisoria(Modifier.padding(start = 64.dp))
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable(role = Role.Button, onClickLabel = if (s.link != null) "Abrir no app Claude" else "Abrir o app Claude") {
                                val link = s.link
                                if (link != null) NuvemGuardada.abrir(ctx, link) else NuvemGuardada.abrirAppClaude(ctx)
                            }
                            .heightIn(min = 64.dp).padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(c.elevada), contentAlignment = Alignment.Center) {
                            Icon(iconeOrigem(s.origem), null, Modifier.size(20.dp), tint = c.texto)
                        }
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text(s.titulo, style = Texto.rotulo.copy(fontWeight = FontWeight.Medium), color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Marca(Color(s.cor), tamanho = 8.dp)
                                val estado = when (s.estado) {
                                    "pede" -> "Esperava você"
                                    "trabalha" -> "Trabalhando"
                                    "arquivada" -> "Arquivada"
                                    else -> "Parada"
                                }
                                Text(
                                    listOfNotNull(s.conta, estado, s.repo).joinToString(" · "),
                                    style = Texto.pequeno, color = if (s.estado == "pede") c.realce else c.apoio,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp),
                                )
                            }
                        }
                        Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, Modifier.size(18.dp), tint = c.apoio)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Botao("Nova sessão na nuvem", { NuvemGuardada.abrir(ctx, "https://claude.ai/code") }, Modifier.weight(1f), Icons.Rounded.Add, Peso.Principal, linhas = 1)
            Botao(if (temApp) "App Claude" else "claude.ai", { NuvemGuardada.abrirAppClaude(ctx) }, icone = Icons.AutoMirrored.Rounded.OpenInNew, peso = Peso.Quieto, linhas = 1)
        }
    }
}

// "hoje às 14:02", "ontem às 09:15" ou "3/10 às 18:40"
private fun quando(ms: Long): String {
    val br = java.util.Locale.forLanguageTag("pt-BR")
    val d = java.util.Calendar.getInstance().apply { timeInMillis = ms }
    val hoje = java.util.Calendar.getInstance()
    val ontem = java.util.Calendar.getInstance().apply { add(java.util.Calendar.DAY_OF_YEAR, -1) }
    val mesmoDia = { a: java.util.Calendar, b: java.util.Calendar -> a.get(java.util.Calendar.YEAR) == b.get(java.util.Calendar.YEAR) && a.get(java.util.Calendar.DAY_OF_YEAR) == b.get(java.util.Calendar.DAY_OF_YEAR) }
    val hora = java.text.SimpleDateFormat("HH:mm", br).format(java.util.Date(ms))
    return when {
        mesmoDia(d, hoje) -> "hoje às $hora"
        mesmoDia(d, ontem) -> "ontem às $hora"
        else -> java.text.SimpleDateFormat("d/M", br).format(java.util.Date(ms)) + " às $hora"
    }
}
