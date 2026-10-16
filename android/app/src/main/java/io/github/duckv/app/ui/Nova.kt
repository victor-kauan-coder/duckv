package io.github.duckv.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.SubdirectoryArrowLeft
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.duckv.app.Estado
import io.github.duckv.app.Hub
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun campoCores() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = cores.texto, unfocusedBorderColor = cores.linha, cursorColor = Laranja,
    focusedLabelColor = cores.texto, focusedContainerColor = cores.superficie, unfocusedContainerColor = cores.superficie,
)

@Composable
fun Topo(titulo: String, subtitulo: String?, aoVoltar: () -> Unit) {
    val c = cores
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 16.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(aoVoltar, Modifier.size(52.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Voltar", tint = c.texto) }
        Column {
            Text(titulo, style = Texto.titulo, color = c.texto)
            if (subtitulo != null) Text(subtitulo, style = Texto.pequeno, color = c.apoio)
        }
    }
}

private data class Listagem(val caminho: String, val pai: String?, val pastas: List<String>)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TelaNova(e: Estado?, contaInicial: String?, aoVoltar: () -> Unit, aoAbriu: (String) -> Unit) {
    val c = cores
    if (e == null) {
        Column(Modifier.fillMaxSize().background(c.fundo)) { Topo("Abrir sessão", null, aoVoltar) }
        return
    }
    var conta by rememberSaveable { mutableStateOf(e.contas.find { it.id == contaInicial }?.id ?: e.contas.firstOrNull()?.id) }
    var cwd by rememberSaveable { mutableStateOf("") }
    var nome by rememberSaveable { mutableStateOf("") }
    var modelo by rememberSaveable { mutableStateOf("default") }
    var esforco by rememberSaveable { mutableStateOf("") }
    var modo by rememberSaveable { mutableStateOf("manual") }
    var erroPasta by remember { mutableStateOf<String?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var abrindo by remember { mutableStateOf(false) }
    var ajustar by rememberSaveable { mutableStateOf(false) }
    // Onde roda: neste computador (o de sempre) ou na nuvem da Anthropic (so contas do Claude Code)
    var naNuvem by rememberSaveable { mutableStateOf(false) }
    var tarefa by rememberSaveable { mutableStateOf("") }
    var lista by remember { mutableStateOf<Listagem?>(null) }
    var erroLista by remember { mutableStateOf<String?>(null) }

    // O agente da conta escolhida define modelos, esforcos e modos.
    val ag = e.agenteDa(conta.orEmpty())
    val instalado = e.contas.find { it.id == conta }?.instalado != false
    val nuvemPode = ag.id == "claude"
    LaunchedEffect(nuvemPode) { if (!nuvemPode) naNuvem = false }
    // Preenche com o jeito de comecar que a conta tem nas Opcoes.
    LaunchedEffect(conta) {
        val p = e.contas.find { it.id == conta }?.padroes ?: return@LaunchedEffect
        modelo = p.model?.takeIf { m -> ag.modelos.any { it.id == m } } ?: "default"
        esforco = p.effort?.takeIf { m -> ag.esforcos.any { it.id == m } } ?: ""
        modo = p.mode?.takeIf { m -> ag.modos.any { it.id == m } } ?: ag.modos.firstOrNull()?.id ?: "manual"
        if (!p.cwd.isNullOrBlank() && cwd.isBlank()) cwd = p.cwd
    }

    fun navegar(dir: String) {
        Hub.mandar(JSONObject().put("t", "ls").put("path", dir)) { er, r ->
            if (er != null || r == null) {
                erroLista = er
                return@mandar
            }
            val dirs = r.optJSONArray("dirs") ?: JSONArray()
            lista = Listagem(r.optString("path"), r.optString("parent").takeIf { !r.isNull("parent") && it.isNotEmpty() }, List(dirs.length()) { dirs.optString(it) })
            erroLista = null
            cwd = r.optString("path")
            erroPasta = null
        }
    }

    Column(Modifier.fillMaxSize().background(c.fundo).imePadding()) {
        Topo("Abrir sessão", if (naNuvem) "Roda na nuvem da Anthropic." else "Abre no computador, você comanda daqui.", aoVoltar)
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(36.dp),
        ) {
          Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column {
                CabecalhoAjuste("Conta", null)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (ct in e.contas) Escolha(ct.nome, ct.id == conta, { conta = ct.id }, marca = androidx.compose.ui.graphics.Color(ct.cor))
                }
                // qual agente vai abrir: sem duvida antes de tocar em Abrir sessao
                SeloAgente(ag, Modifier.padding(top = 10.dp), completo = true)
                if (!instalado) Text("O ${ag.nome} não está instalado no computador. Rode o instalador do duckV de novo.", style = Texto.apoio, color = c.perigo, modifier = Modifier.padding(top = 6.dp))
            }
            if (nuvemPode) Column {
                CabecalhoAjuste("Onde roda", null)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Escolha("Neste computador", !naNuvem, { naNuvem = false })
                    Escolha("Na nuvem", naNuvem, { naNuvem = true })
                }
                AnimatedVisibility(naNuvem) {
                    Row(
                        Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.superficie).padding(12.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Icon(iconeOrigem("nuvem"), null, Modifier.size(18.dp), tint = c.apoio)
                        Text(
                            "Roda nos servidores da Anthropic, a partir do repositório do GitHub da pasta, e continua mesmo com o computador desligado. Você acompanha por aqui; para responder, abre no claude.ai.",
                            style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 10.dp),
                        )
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CabecalhoAjuste("Pasta do projeto", null, Modifier.padding(bottom = 0.dp))
                OutlinedTextField(
                    cwd, { cwd = it; erroPasta = null }, Modifier.fillMaxWidth(),
                    placeholder = { Text("C:\\projetos\\meu-projeto", color = c.apoio) },
                    textStyle = Texto.codigo.copy(color = c.texto), singleLine = true, isError = erroPasta != null,
                    supportingText = erroPasta?.let { { Text(it, color = c.perigo) } },
                    shape = RoundedCornerShape(10.dp), colors = campoCores(),
                )
                Botao("Procurar no computador", { navegar(cwd.ifBlank { e.host.home }) }, Modifier.fillMaxWidth(), Icons.Rounded.FolderOpen, Peso.Quieto)
                erroLista?.let { Text(it, style = Texto.apoio, color = c.perigo) }
                lista?.let { l ->
                    val forma = RoundedCornerShape(12.dp)
                    Column(Modifier.fillMaxWidth().clip(forma).background(c.cartao)) {
                        Text(l.caminho, style = Texto.codigo, color = c.apoio, modifier = Modifier.padding(12.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Divisoria()
                        if (l.pai != null) LinhaPasta(Icons.Rounded.SubdirectoryArrowLeft, "Subir uma pasta") { navegar(l.pai) }
                        for (d in l.pastas) LinhaPasta(Icons.Rounded.Folder, d) { navegar(l.caminho + (if (l.caminho.endsWith(e.host.sep)) "" else e.host.sep) + d) }
                        if (l.pastas.isEmpty()) Text("Esta pasta não tem subpastas. Ela já está escolhida no campo acima.", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(12.dp))
                    }
                }
                if (e.host.pastas.isNotEmpty()) {
                    Text("Usadas há pouco", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 4.dp))
                    for (f in e.host.pastas.take(6)) LinhaPasta(Icons.Rounded.History, io.github.duckv.app.pasta(f), f.dropLast(io.github.duckv.app.pasta(f).length).trimEnd('\\', '/')) { cwd = f; lista = null; erroPasta = null }
                }
            }
            if (naNuvem) OutlinedTextField(
                tarefa, { tarefa = it.take(4000) }, Modifier.fillMaxWidth(), label = { Text("O que a sessão deve fazer") },
                placeholder = { Text("Ex.: corrija o teste que está falhando e abra um pull request", color = c.apoio) },
                minLines = 3, maxLines = 8, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
            )
            else OutlinedTextField(
                nome, { nome = it.take(50) }, Modifier.fillMaxWidth(), label = { Text("Nome da sessão (opcional)") },
                singleLine = true, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
            )
          }
          if (!naNuvem) Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TituloSecao("Como começar", Modifier.padding(bottom = 0.dp))
            // Os padroes da conta ja vem escolhidos; o resumo evita tres listas longas no caminho de quem so quer abrir.
            val resumo = listOfNotNull(nomeDoModelo(ag, modelo), if (ag.esforcos.isEmpty()) null else ag.esforcos.find { it.id == esforco }?.rotulo ?: ESFORCOS[esforco] ?: "Esforço padrão").joinToString(" · ")
            Cartao {
                Row(
                    Modifier.fillMaxWidth().clickable(onClickLabel = if (ajustar) "Esconder ajustes" else "Mudar ajustes") { ajustar = !ajustar }.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(resumo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
                        Text(nomeDoModo(ag, modo), style = Texto.apoio, color = c.apoio)
                    }
                    Text(if (ajustar) "Pronto" else "Mudar", style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.realce)
                }
                if (!ajustar) {
                    Divisoria()
                    Text("Vem dos padrões da conta. Para mudar de vez, vá em Opções, Contas.", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
                }
            }
            AnimatedVisibility(ajustar) {
                Column(verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    Column {
                        CabecalhoAjuste("Modelo", null)
                        ListaEscolha(opcoesModelo(ag), modelo, { modelo = it })
                    }
                    if (ag.esforcos.isNotEmpty()) Column {
                        CabecalhoAjuste("Esforço de raciocínio", null)
                        EscalaEsforco(ag, esforco, { esforco = it })
                    }
                    Column {
                        CabecalhoAjuste("Permissões", null)
                        ListaEscolha(opcoesModo(ag), modo, { modo = it })
                    }
                }
            }
          }
        }
        // Acao principal presa embaixo: nunca some atras da rolagem.
        Column(Modifier.fillMaxWidth().background(c.fundo).navigationBarsPadding()) {
            Divisoria()
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val aviso = if (!e.host.disponivel && !naNuvem) "O computador não conseguiu carregar o terminal virtual, então não dá para abrir sessões por aqui. Rode a instalação de novo." else erro
                aviso?.let { Text(it, style = Texto.apoio, color = c.perigo) }
                Botao(
                    if (abrindo) (if (naNuvem) "Criando na nuvem" else "Abrindo") else if (naNuvem) "Criar na nuvem" else "Abrir sessão",
                    {
                        erro = null
                        if (cwd.isBlank()) {
                            erroPasta = "Escolha a pasta do projeto."
                            return@Botao
                        }
                        if (naNuvem) {
                            if (tarefa.trim().length < 3) {
                                erro = "Escreva o que a sessão deve fazer."
                                return@Botao
                            }
                            abrindo = true
                            Hub.mandar(JSONObject().put("t", "nuvemNova").put("account", conta).put("cwd", cwd.trim()).put("texto", tarefa)) { er, r ->
                                abrindo = false
                                if (er != null) erro = er else r?.optString("instance")?.let(aoAbriu)
                            }
                            return@Botao
                        }
                        abrindo = true
                        Hub.mandar(
                            JSONObject().put("t", "start").put("account", conta).put("cwd", cwd.trim()).put("name", nome.trim())
                                .put("model", modelo).put("effort", esforco.ifEmpty { JSONObject.NULL }).put("mode", modo).put("cols", 60).put("rows", 32),
                        ) { er, r ->
                            abrindo = false
                            if (er != null) erro = er else r?.optString("instance")?.let(aoAbriu)
                        }
                    },
                    Modifier.fillMaxWidth(), if (naNuvem) iconeOrigem("nuvem") else null, Peso.Principal, habilitado = (naNuvem || e.host.disponivel) && !abrindo && conta != null && instalado,
                )
            }
        }
    }
}

@Composable
private fun LinhaPasta(icone: androidx.compose.ui.graphics.vector.ImageVector, texto: String, caminho: String? = null, aoTocar: () -> Unit) {
    val c = cores
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = aoTocar).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icone, null, tint = c.apoio, modifier = Modifier.size(20.dp))
        EspacoLargo(16.dp)
        // o nome da pasta em destaque; o caminho ate ela embaixo, cortado no comeco
        Column {
            Text(texto, style = Texto.corpo, color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!caminho.isNullOrBlank()) Text(if (caminho.length > 42) "…" + caminho.takeLast(41) else caminho, style = Texto.pequeno, color = c.apoio, maxLines = 1)
        }
    }
}
