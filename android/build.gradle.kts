// O Android Gradle Plugin 9 ja traz o suporte a Kotlin embutido; o plugin do Kotlin fica declarado
// aqui (sem aplicar) so para fixar a versao do Kotlin, que precisa ser a mesma do plugin do Compose.
plugins {
    id("com.android.application") version "9.4.1" apply false
    id("org.jetbrains.kotlin.android") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
}
