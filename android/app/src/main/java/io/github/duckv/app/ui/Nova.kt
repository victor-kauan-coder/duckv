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
    var lista by remember { mutableStateOf<Listagem?>(null) }
    var erroLista by remember { mutableStateOf<String?>(null) }

    // Preenche com o jeito de comecar que a conta tem nas Opcoes.
    LaunchedEffect(conta) {
        val p = e.contas.find { it.id == conta }?.padroes ?: return@LaunchedEffect
        modelo = p.model ?: "default"
        esforco = p.effort ?: ""
        modo = p.mode ?: "manual"
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
        Topo("Abrir sessão", "Abre no computador, você comanda daqui.", aoVoltar)
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(36.dp),
        ) {
          Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TituloSecao("Onde abrir", Modifier.padding(bottom = 0.dp))
            Column {
                CabecalhoAjuste("Conta", null)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (ct in e.contas) Escolha(ct.nome, ct.id == conta, { conta = ct.id }, marca = androidx.compose.ui.graphics.Color(ct.cor))
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
                    Column(Modifier.fillMaxWidth().clip(forma).border(1.dp, c.linha, forma).background(c.superficie)) {
                        Text(l.caminho, style = Texto.codigo, color = c.apoio, modifier = Modifier.padding(12.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Divisoria()
                        if (l.pai != null) LinhaPasta(Icons.Rounded.SubdirectoryArrowLeft, "Subir uma pasta") { navegar(l.pai) }
                        for (d in l.pastas) LinhaPasta(Icons.Rounded.Folder, d) { navegar(l.caminho + (if (l.caminho.endsWith(e.host.sep)) "" else e.host.sep) + d) }
                        if (l.pastas.isEmpty()) Text("Esta pasta não tem subpastas. Ela já está escolhida no campo acima.", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(12.dp))
                    }
                }
                if (e.host.pastas.isNotEmpty()) {
                    Text("Usadas há pouco", style = Texto.pequeno, color = c.apoio, modifier = Modifier.padding(top = 4.dp))
                    for (f in e.host.pastas.take(6)) LinhaPasta(Icons.Rounded.History, f) { cwd = f; lista = null; erroPasta = null }
                }
            }
            OutlinedTextField(
                nome, { nome = it.take(50) }, Modifier.fillMaxWidth(), label = { Text("Nome da sessão (opcional)") },
                singleLine = true, shape = RoundedCornerShape(10.dp), colors = campoCores(), textStyle = Texto.corpo.copy(color = c.texto),
            )
          }
          Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            TituloSecao("Como começar", Modifier.padding(bottom = 0.dp))
            // Os padroes da conta ja vem escolhidos; o resumo evita tres listas longas no caminho de quem so quer abrir.
            val resumo = listOf(MODELOS[modelo] ?: modelo, ESFORCOS[esforco] ?: "Esforço padrão").joinToString(" · ")
            Cartao {
                Row(
                    Modifier.fillMaxWidth().clickable(onClickLabel = if (ajustar) "Esconder ajustes" else "Mudar ajustes") { ajustar = !ajustar }.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(resumo, style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
                        Text(nomeDoModo(modo), style = Texto.apoio, color = c.apoio)
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
                        ListaEscolha(opcoesModelo(e.host.modelos), modelo, { modelo = it })
                    }
                    Column {
                        CabecalhoAjuste("Esforço de raciocínio", null)
                        EscalaEsforco(e.host.esforcos, esforco, { esforco = it })
                    }
                    Column {
                        CabecalhoAjuste("Permissões", null)
                        ListaEscolha(opcoesModo(e.host.modos), modo, { modo = it })
                    }
                }
            }
          }
        }
        // Acao principal presa embaixo: nunca some atras da rolagem.
        Column(Modifier.fillMaxWidth().background(c.fundo).navigationBarsPadding()) {
            Divisoria()
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val aviso = if (!e.host.disponivel) "O computador não conseguiu carregar o terminal virtual, então não dá para abrir sessões por aqui. Rode a instalação de novo." else erro
                aviso?.let { Text(it, style = Texto.apoio, color = c.perigo) }
                Botao(
                    if (abrindo) "Abrindo" else "Abrir sessão",
                    {
                        erro = null
                        if (cwd.isBlank()) {
                            erroPasta = "Escolha a pasta do projeto."
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
                    Modifier.fillMaxWidth(), peso = Peso.Principal, habilitado = e.host.disponivel && !abrindo && conta != null,
                )
            }
        }
    }
}

@Composable
private fun LinhaPasta(icone: androidx.compose.ui.graphics.vector.ImageVector, texto: String, aoTocar: () -> Unit) {
    val c = cores
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(onClick = aoTocar).padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icone, null, tint = c.apoio, modifier = Modifier.size(20.dp))
        EspacoLargo(12.dp)
        Text(texto, style = Texto.rotulo.copy(fontWeight = FontWeight.Normal), color = c.texto, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
