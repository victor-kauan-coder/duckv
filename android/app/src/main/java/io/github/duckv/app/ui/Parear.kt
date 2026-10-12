package io.github.duckv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import io.github.duckv.app.Hub
import io.github.duckv.app.Vigia

@Composable
fun TelaParear(pato: String) {
    val c = cores
    val ctx = LocalContext.current
    var link by rememberSaveable { mutableStateOf("") }
    var erro by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    var sas by remember { mutableStateOf<String?>(null) }
    val rolagem = rememberScrollState()
    // os 4 numeros aparecem no fim da tela: rola ate eles
    androidx.compose.runtime.LaunchedEffect(sas) { if (sas != null) rolagem.animateScrollTo(rolagem.maxValue) }
    val teclado = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val parear = { l: String ->
        teclado?.hide() // os 4 numeros precisam ficar a vista
        ocupado = true
        erro = null
        Hub.parear(l, { sas = it }) { er ->
            ocupado = false
            sas = null
            erro = er
            if (er == null) Vigia.ajustar(ctx)
        }
    }
    val leitor = androidx.activity.compose.rememberLauncherForActivityResult(ScanContract()) { r ->
        r.contents?.let { parear(it) }
    }

    Column(
        Modifier.fillMaxSize().background(c.fundo).statusBarsPadding().navigationBarsPadding().imePadding()
            .verticalScroll(rolagem).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Pato(if (ocupado) "trabalha" else "dorme", pato, Laranja, Modifier.widthIn(max = 420.dp).fillMaxWidth().height(150.dp).padding(top = 24.dp))
        Logo(tamanho = 40)
        Text(
            "Acompanhe e comande as sessões do Claude Code das suas contas, direto do celular.",
            style = Texto.corpo, color = c.apoio, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 420.dp),
        )
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // o computador e o celular, ligados: o que o pareamento faz, num desenho
            androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                PixelArte(NOTEBOOK, Modifier.size(width = 84.dp, height = 60.dp), mapOf('#' to c.texto, 'o' to Laranja, 'b' to c.apoio))
                PixelArte(listOf("o.o.o.o.o"), Modifier.size(width = 54.dp, height = 8.dp).padding(horizontal = 6.dp), mapOf('o' to Laranja))
                PixelArte(CELULAR, Modifier.size(width = 40.dp, height = 46.dp), mapOf('#' to c.texto, 'o' to Laranja))
            }
            Text("Para começar", style = Texto.rotulo.copy(fontWeight = FontWeight.SemiBold), color = c.texto)
            Text("No computador, abra o claudeV. Na janela aparece um código QR: escaneie aqui.", style = Texto.apoio, color = c.apoio)
            Botao(
                "Escanear código", {
                    leitor.launch(
                        ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Aponte para o código na janela do claudeV")
                            .setBeepEnabled(false).setOrientationLocked(false),
                    )
                },
                Modifier.fillMaxWidth(), Icons.Rounded.QrCodeScanner, Peso.Principal, !ocupado,
            )
            Text("Ou cole o link de pareamento que aparece abaixo do código:", style = Texto.apoio, color = c.apoio, modifier = Modifier.padding(top = 8.dp))
            OutlinedTextField(
                link, { link = it.trim() }, Modifier.fillMaxWidth(), singleLine = true,
                placeholder = { Text("https://seu-pc.rede.ts.net/parear?k=…", color = c.apoio) },
                textStyle = Texto.codigo.copy(color = c.texto), shape = RoundedCornerShape(10.dp), colors = campoCores(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { if (link.isNotBlank()) parear(link) }),
            )
            Botao("Conectar", { parear(link) }, Modifier.fillMaxWidth(), Icons.Rounded.Link, habilitado = link.isNotBlank() && !ocupado)
            erro?.let { Text(it, style = Texto.apoio, color = c.perigo) }
            val conferir = sas
            if (ocupado && conferir != null) {
                // verificacao extra: os mesmos 4 numeros na janela do computador, e voce confirma la
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(c.invFundo).padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Digite no computador", style = Texto.conta, color = c.invTexto)
                    Text(
                        conferir.toList().joinToString("  "), style = Texto.numero.copy(fontSize = 44.sp, lineHeight = 52.sp, fontWeight = FontWeight.Medium),
                        color = c.invTexto, modifier = Modifier.semantics { contentDescription = "Código ${conferir.toList().joinToString(" ")}" },
                    )
                    Text(
                        "Na janela do claudeV, digite estes 4 números e aperte Enter. Assim o computador sabe que é este celular.",
                        style = Texto.apoio, color = c.invApoio, textAlign = TextAlign.Center,
                    )
                }
            } else if (ocupado) Text("Conectando ao computador…", style = Texto.apoio, color = c.apoio)
        }
    }
}
