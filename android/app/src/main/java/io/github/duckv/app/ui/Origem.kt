package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.animation.animateContentSize
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Warning
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

/**
 * Login no GitHub do computador (pelo gh), para escolher repositorios das sessoes na nuvem.
 * Durante o login mostra o codigo de 8 letras e o botao que abre github.com/login/device aqui no
 * celular: autorizando por aqui mesmo, a tela atualiza sozinha. [compacto] tira as acoes de conta.
 */
@Composable
fun CartaoGithub(g: io.github.duckv.app.GithubEstado, compacto: Boolean = false) {
    val c = cores
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val aviso = LocalAviso.current
    val mandar = { t: String -> io.github.duckv.app.Hub.mandar(org.json.JSONObject().put("t", t)) { er, _ -> if (er != null) aviso(er) } }
    val forma = RoundedCornerShape(16.dp)
    Column(
        Modifier.fillMaxWidth().clip(forma).background(c.cartao).padding(16.dp).animateContentSize(),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp),
    ) {
        val codigo = g.codigo
        when {
            g.instalado == false -> {
                LinhaGithub(Icons.Rounded.Warning, "GitHub CLI não instalado", "O duckV usa o GitHub CLI (gh) do computador para entrar no GitHub. Instale no computador e volte aqui.")
                Botao("Como instalar", { abrirLink(ctx, "https://cli.github.com") }, icone = Icons.AutoMirrored.Rounded.OpenInNew, peso = Peso.Quieto)
            }
            codigo != null -> {
                Text("No GitHub, digite este código para liberar o duckV:", style = Texto.apoio, color = c.apoio)
                val area = androidx.compose.ui.platform.LocalClipboardManager.current
                Row(
                    Modifier.clip(RoundedCornerShape(14.dp)).background(c.invFundo)
                        .clickable(onClickLabel = "Copiar o código") { area.setText(androidx.compose.ui.text.AnnotatedString(codigo)); aviso("Código copiado") }
                        .padding(start = 18.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(codigo, style = Texto.codigo.copy(fontSize = 26.sp, lineHeight = 30.sp, letterSpacing = 3.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium), color = c.invTexto)
                    Icon(Icons.Rounded.ContentCopy, null, Modifier.padding(start = 12.dp).size(18.dp), tint = c.invApoio)
                }
                val url = g.url ?: "https://github.com/login/device"
                Botao("Abrir github.com/login/device", { abrirLink(ctx, url) }, Modifier.fillMaxWidth(), Icons.AutoMirrored.Rounded.OpenInNew, Peso.Principal)
                val minutos = ((g.ate - System.currentTimeMillis()) / 60_000).coerceAtLeast(1)
                Text("Vale por $minutos min. Quando você autorizar, esta tela atualiza sozinha.", style = Texto.pequeno, color = c.apoio)
                Botao("Cancelar", { mandar("githubCancelar") }, peso = Peso.Quieto)
            }
            g.login != null -> {
                LinhaGithub(Icons.Rounded.CheckCircle, "Conectado como ${g.login}", if (compacto) null else "Pelo GitHub CLI do computador. O token fica lá, nunca no celular.", c.ok)
                if (!compacto) Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                    Botao("Trocar de conta", { mandar("githubEntrar") }, peso = Peso.Quieto)
                    BotaoConfirma("Sair do GitHub", Icons.AutoMirrored.Rounded.Logout, { mandar("githubSair") }, peso = Peso.Perigo)
                }
            }
            else -> {
                LinhaGithub(Icons.Rounded.Language, "Entre no GitHub", "Para escolher os seus repositórios ao criar sessões na nuvem.")
                Botao("Entrar no GitHub", { mandar("githubEntrar") }, Modifier.fillMaxWidth(), Icons.AutoMirrored.Rounded.Login, Peso.Principal)
                g.erro?.let { Text(it, style = Texto.apoio, color = c.perigo) }
            }
        }
    }
}

@Composable
private fun LinhaGithub(icone: ImageVector, titulo: String, apoio: String?, cor: androidx.compose.ui.graphics.Color? = null) {
    val c = cores
    Row(verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.foundation.layout.Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(c.elevada), contentAlignment = Alignment.Center) {
            Icon(icone, null, Modifier.size(20.dp), tint = cor ?: c.apoio)
        }
        Column(Modifier.padding(start = 12.dp)) {
            Text(titulo, style = Texto.rotulo, color = c.texto)
            if (apoio != null) Text(apoio, style = Texto.pequeno, color = c.apoio)
        }
    }
}
