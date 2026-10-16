package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// De onde cada sessao vem. As do computador sao o caso comum e ficam sem selo; o resto se identifica.
fun iconeOrigem(origem: String?): ImageVector = when (origem) {
    "nuvem" -> Icons.Rounded.Cloud
    "cowork" -> Icons.Rounded.Work
    "app", "desktop" -> Icons.Rounded.Computer
    "historico", "conta" -> Icons.Rounded.History
    else -> Icons.Rounded.Terminal
}

fun nomeOrigem(origem: String?): String = when (origem) {
    "nuvem" -> "Nuvem"
    "cowork" -> "Cowork"
    "app", "desktop" -> "App Claude"
    "historico", "conta" -> "Computador"
    "duckv" -> "duckV"
    else -> "Terminal"
}

/** Origens que ganham selo na tela: as que nao sao uma sessao comum deste computador. */
fun temSelo(origem: String?) = origem == "nuvem" || origem == "cowork" || origem == "app" || origem == "desktop"

/** Selo pequeno com o icone e o nome da origem, ao lado do nome da conta. */
@Composable
fun SeloOrigem(origem: String, modifier: Modifier = Modifier) {
    val c = cores
    Row(
        modifier.height(20.dp).clip(RoundedCornerShape(6.dp)).background(c.elevada).padding(start = 5.dp, end = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(iconeOrigem(origem), null, Modifier.size(13.dp), tint = c.apoio)
        Text(nomeOrigem(origem), style = Texto.pequeno.copy(fontSize = 11.sp), color = c.apoio, modifier = Modifier.padding(start = 4.dp))
    }
}

/** Icone de cada ferramenta nas atividades da conversa. */
fun iconeFerramenta(nome: String?): ImageVector {
    val n = nome.orEmpty()
    return when {
        n in setOf("Bash", "PowerShell", "BashOutput", "KillShell", "Monitor") -> Icons.Rounded.Terminal
        n in setOf("Edit", "MultiEdit", "Write", "NotebookEdit") -> Icons.Rounded.Edit
        n in setOf("Read", "NotebookRead") -> Icons.Rounded.Description
        n in setOf("Grep", "Glob", "LS", "ToolSearch") -> Icons.Rounded.Search
        n in setOf("TodoWrite", "TaskCreate", "TaskUpdate", "TaskList") -> Icons.Rounded.Checklist
        n in setOf("WebFetch", "WebSearch") || n.startsWith("mcp__") -> Icons.Rounded.Language
        n in setOf("Task", "Agent", "Skill", "Workflow") -> Icons.Rounded.AutoAwesome
        else -> Icons.Rounded.Build
    }
}

fun nomeFerramenta(nome: String?): String = nome.orEmpty().let { if (it.startsWith("mcp__")) it.split("__").drop(1).joinToString(" · ") else it }

/** Abre um link do claude.ai no navegador (ou no app Claude, se ele cuidar desses links). */
fun abrirLink(ctx: android.content.Context, url: String) {
    runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
}
