package io.github.duckv.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.graphics.Color
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
fun TelaNova(e: Estado?, contaInicial: String?, pastaInicial: String, tarefaInicial: String, aoVoltar: () -> Unit, aoAbriuEquipe: (String) -> Unit = {}, aoAbriu: (String) -> Unit) {
    val c = cores
    if (e == null) {
        Column(Modifier.fillMaxSize().background(c.fundo)) { Topo("Abrir sessão", null, aoVoltar) }
        return
    }
    // "Todas as contas" (TODAS): uma sessao por conta, que dividem a mesma tarefa
    val daEquipe = contasDaEquipe(e)
    var conta by rememberSaveable { mutableStateOf(if (contaInicial == TODAS && daEquipe.size >= 2) TODAS else e.contas.find { it.id == contaInicial }?.id ?: e.contas.firstOrNull()?.id) }
    val todas = conta == TODAS
    val aviso = LocalAviso.current
    var cwd by rememberSaveable { mutableStateOf(pastaInicial) }
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
    // A tarefa: a primeira mensagem neste computador, a tarefa da nuvem ou a da equipe. Um campo so, para o
    // texto seguir quem troca de conta ou de lugar.
    var tarefa by rememberSaveable { mutableStateOf(tarefaInicial) }
    // Na nuvem: um repositorio do GitHub (os seus, pelo gh do computador), esteja ele no computador ou nao.
    var repo by rememberSaveable { mutableStateOf<String?>(null) }
    var repos by remember { mutableStateOf<List<RepoGh>?>(null) }
    var erroRepos by remember { mutableStateOf<String?>(null) }
    var buscaRepo by rememberSaveable { mutableStateOf("") }
    // entrar no GitHub (ou trocar de conta) muda a lista: busca de novo
    var loginVisto by remember { mutableStateOf(e.github.login) }
    LaunchedEffect(e.github.login) { if (e.github.login != loginVisto) { loginVisto = e.github.login; repos = null } }
    LaunchedEffect(naNuvem, repos == null) {
        if (!naNuvem || repos != null) return@LaunchedEffect
        Hub.mandar(JSONObject().put("t", "repos")) { er, r ->
            val a = r?.optJSONArray("itens")
            repos = List(a?.length() ?: 0) { i ->
                val o = a!!.getJSONObject(i)
                RepoGh(o.optString("repo"), o.optString("descricao").takeIf { !o.isNull("descricao") && it.isNotBlank() }, o.optBoolean("privado"), o.optString("pasta").takeIf { !o.isNull("pasta") && it.isNotBlank() })
            }
            erroRepos = er ?: r?.optString("erro")?.takeIf { !r.isNull("erro") && it.isNotBlank() }
        }
    }
    var lista by remember { mutableStateOf<Listagem?>(null) }
    var erroLista by remember { mutableStateOf<String?>(null) }

    // O agente da conta escolhida define modelos, esforcos e modos.
    val ag = e.agenteDa(conta.orEmpty())
    val instalado = e.contas.find { it.id == conta }?.instalado != false
    val nuvemPode = ag.id == "claude" && !todas
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
                    if (daEquipe.size >= 2) androidx.compose.material3.FilterChip(
                        todas, { io.github.duckv.app.Sons.clique(); conta = TODAS }, { Text("Todas as contas", style = Texto.rotulo) }, Modifier.heightIn(min = 32.dp),
                        leadingIcon = { Patinhos(daEquipe) },
                        shape = RoundedCornerShape(8.dp),
                        colors = androidx.compose.material3.FilterChipDefaults.filterChipColors(
                            selectedContainerColor = c.invFundo, selectedLabelColor = c.invTexto, labelColor = c.texto, containerColor = Color.Transparent,
                        ),
                        border = androidx.compose.material3.FilterChipDefaults.filterChipBorder(true, todas, borderColor = c.vazio, selectedBorderColor = Color.Transparent),
                    )
                }
                if (todas) Text(
                    "${daEquipe.dropLast(1).joinToString(", ") { it.nome }} e ${daEquipe.last().nome} abrem uma sessão cada, na mesma pasta, e dividem a tarefa entre si.",
                    style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(top = 10.dp),
                )
                // qual agente vai abrir: sem duvida antes de tocar em Abrir sessao
                if (!todas) SeloAgente(ag, Modifier.padding(top = 10.dp), completo = true)
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
                            "Roda nos servidores da Anthropic, a partir do repositório escolhido, e continua mesmo com o computador desligado. Repositório que não está no computador ganha uma cópia leve na pasta do duckV. Você acompanha por aqui; para responder, abre no claude.ai.",
                            style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(start = 10.dp),
                        )
                    }
                }
            }
            if (naNuvem) Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CabecalhoAjuste("Repositório do GitHub", null, Modifier.padding(bottom = 0.dp))
                CartaoGithub(e.github, compacto = true)
                OutlinedTextField(
                    buscaRepo, { buscaRepo = it }, Modifier.fillMaxWidth(), singleLine = true,
                    placeholder = { Text("Buscar entre os seus repositórios", color = c.apoio) },
                    shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                )
                // sem login no GitHub, quem explica e o cartao acima
                if (e.github.login != null) erroRepos?.let { Text(it, style = Texto.apoio, color = c.perigo) }
                val lista = repos
                if (lista == null) Text("Buscando seus repositórios…", style = Texto.apoio, color = c.apoio)
                else {
                    val q = buscaRepo.trim().lowercase()
                    val achados = lista.filter { q.isEmpty() || "${it.repo} ${it.descricao.orEmpty()}".lowercase().contains(q) }.take(40)
                    if (achados.isEmpty()) Text(if (q.isEmpty()) "Nenhum repositório encontrado." else "Nenhum repositório com esse nome.", style = Texto.apoio, color = c.apoio)
                    val forma = RoundedCornerShape(16.dp)
                    Column(Modifier.fillMaxWidth().clip(forma).background(c.cartao)) {
                        for ((i, r) in achados.withIndex()) {
                            if (i > 0) Divisoria(Modifier.padding(start = 16.dp))
                            val marcado = repo == r.repo
                            Row(
                                Modifier.fillMaxWidth().background(if (marcado) c.invFundo else Color.Transparent)
                                    .clickable(role = androidx.compose.ui.semantics.Role.RadioButton) { repo = r.repo }
                                    .heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(if (r.pasta != null) Icons.Rounded.Folder else iconeOrigem("nuvem"), null, Modifier.size(20.dp), tint = if (marcado) c.invTexto else c.apoio)
                                Column(Modifier.weight(1f).padding(start = 14.dp)) {
                                    Text(r.repo, style = Texto.rotulo, color = if (marcado) c.invTexto else c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        listOfNotNull(if (r.pasta != null) "Neste computador" else "Baixa uma cópia leve ao criar", if (r.privado) "privado" else null, r.descricao).joinToString(" · "),
                                        style = Texto.pequeno, color = if (marcado) c.invApoio else c.apoio, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                androidx.compose.material3.RadioButton(marcado, { repo = r.repo }, colors = androidx.compose.material3.RadioButtonDefaults.colors(selectedColor = c.realce))
                            }
                        }
                    }
                }
            }
            if (!naNuvem) Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
            if (naNuvem || todas) OutlinedTextField(
                tarefa, { tarefa = it.take(8000) }, Modifier.fillMaxWidth(), label = { Text(if (todas) "O que a equipe deve fazer" else "O que a sessão deve fazer") },
                placeholder = { Text("Ex.: corrija o teste que está falhando e abra um pull request", color = c.apoio) },
                minLines = 3, maxLines = 8, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
            )
            else {
                Column {
                    CabecalhoAjuste("Primeira mensagem", null)
                    OutlinedTextField(
                        tarefa, { tarefa = it.take(8000) }, Modifier.fillMaxWidth(),
                        placeholder = { Text("Opcional. Ex.: rode os testes e corrija o que falhar", color = c.apoio) },
                        supportingText = { Text("Em branco, a sessão abre esperando você.", color = c.apoio) },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences),
                        minLines = 2, maxLines = 8, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                    )
                }
                OutlinedTextField(
                    nome, { nome = it.take(50) }, Modifier.fillMaxWidth(), label = { Text("Nome da sessão (opcional)") },
                    singleLine = true, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
                )
            }
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
                    if (abrindo) (if (naNuvem) "Criando na nuvem" else if (todas) "Abrindo as contas" else "Abrindo") else if (naNuvem) "Criar na nuvem" else if (todas) "Abrir com ${daEquipe.size} contas" else "Abrir sessão",
                    {
                        erro = null
                        if (todas) {
                            if (cwd.isBlank()) {
                                erroPasta = "Escolha a pasta do projeto."
                                return@Botao
                            }
                            if (tarefa.trim().length < 3) {
                                erro = "Escreva o que a equipe deve fazer."
                                return@Botao
                            }
                            abrindo = true
                            abrirEquipe(e, cwd.trim(), tarefa.trim(), {
                                put("model", modelo).put("effort", esforco.ifEmpty { JSONObject.NULL }).put("mode", modo)
                            }) { er, id, falhas ->
                                abrindo = false
                                if (er != null || id == null) erro = er
                                else {
                                    if (falhas.isNotEmpty()) aviso("Não entraram na equipe: ${falhas.joinToString("; ")}")
                                    aoAbriuEquipe(id)
                                }
                            }
                            return@Botao
                        }
                        if (naNuvem) {
                            if (repo == null) {
                                erro = "Escolha o repositório do GitHub."
                                return@Botao
                            }
                            if (tarefa.trim().length < 3) {
                                erro = "Escreva o que a sessão deve fazer."
                                return@Botao
                            }
                            abrindo = true
                            Hub.mandar(JSONObject().put("t", "nuvemNova").put("account", conta).put("repo", repo).put("texto", tarefa.trim().take(4000))) { er, r ->
                                abrindo = false
                                if (er != null) erro = er else r?.optString("instance")?.let(aoAbriu)
                            }
                            return@Botao
                        }
                        if (cwd.isBlank()) {
                            erroPasta = "Escolha a pasta do projeto."
                            return@Botao
                        }
                        abrindo = true
                        Hub.mandar(
                            JSONObject().put("t", "start").put("account", conta).put("cwd", cwd.trim()).put("name", nome.trim())
                                .put("model", modelo).put("effort", esforco.ifEmpty { JSONObject.NULL }).put("mode", modo).put("cols", 60).put("rows", 32)
                                .apply { tarefa.trim().takeIf { it.isNotEmpty() }?.let { put("texto", it) } },
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

/** Um repositorio do GitHub para a sessao na nuvem; [pasta] quando ele ja esta no computador. */
private data class RepoGh(val repo: String, val descricao: String?, val privado: Boolean, val pasta: String?)
