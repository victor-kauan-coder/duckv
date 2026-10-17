package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.History
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import io.github.duckv.app.pasta
import org.json.JSONObject

/**
 * Sessoes abertas pelo duckV que estavam vivas quando ele desligou (computador reiniciado, app fechado).
 * Retomar continua cada conversa de onde parou, com --resume, na mesma conta e pasta; Descartar esquece.
 * Nada abre sozinho. No tom pessego de "precisa de voce", logo abaixo da faixa de pedidos.
 */
@Composable
fun FaixaRetomar(e: Estado, modifier: Modifier = Modifier) {
    val c = cores
    val aviso = LocalAviso.current
    var ocupado by remember { mutableStateOf(false) }
    val lista = e.retomaveis
    val n = lista.size
    val nomes = lista.take(3).joinToString(", ") { "${it.nome ?: pasta(it.cwd).ifEmpty { "Sessão" }} (${e.conta(it.conta).nome})" } +
        if (n > 3) " e mais ${n - 3}" else ""
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.invFundo).padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 6.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Rounded.History, null, tint = c.invTexto, modifier = Modifier.padding(top = 2.dp).size(20.dp))
            Column(Modifier.weight(1f).padding(start = 12.dp, end = 8.dp)) {
                Text(if (n == 1) "Uma sessão estava aberta quando o duckV desligou" else "$n sessões estavam abertas quando o duckV desligou", style = Texto.rotulo, color = c.invTexto)
                Text("$nomes. Retomar continua cada conversa de onde parou.", style = Texto.apoio, color = c.invApoio, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            TextButton(
                {
                    ocupado = true
                    Hub.mandar(JSONObject().put("t", "retomarDescartar")) { er, _ -> ocupado = false; er?.let(aviso) }
                },
                Modifier.heightIn(min = 48.dp), enabled = !ocupado,
            ) { Text("Descartar", style = Texto.rotulo, color = c.invTexto) }
            Button(
                {
                    ocupado = true
                    Hub.mandar(JSONObject().put("t", "retomar")) { er, r ->
                        ocupado = false
                        if (er != null) return@mandar aviso(er)
                        val abertas = r?.optJSONArray("instances")?.length() ?: 0
                        val falhas = r?.optJSONArray("falhas")?.length() ?: 0
                        aviso(
                            (if (abertas == 1) "Uma sessão retomada" else "$abertas sessões retomadas") +
                                if (falhas > 0) ". ${if (falhas == 1) "Uma não pôde" else "$falhas não puderam"} voltar: a conversa não está mais no histórico." else "",
                        )
                    }
                },
                Modifier.heightIn(min = 48.dp).padding(start = 4.dp), enabled = !ocupado,
            ) {
                Icon(Icons.Rounded.History, null, Modifier.size(18.dp))
                Text(if (ocupado) "Retomando…" else "Retomar", style = Texto.rotulo, modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}
