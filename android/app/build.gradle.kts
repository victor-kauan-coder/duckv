import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Assinatura do APK de release: fica fora do repositorio, em assinatura.properties.
val assinatura = Properties().apply {
    val f = rootProject.file("assinatura.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "io.github.duckv.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.duckv.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 13
        versionName = "2.4.0"
    }

    signingConfigs {
        if (assinatura.isNotEmpty()) {
            create("release") {
                storeFile = file(assinatura.getProperty("arquivo"))
                storePassword = assinatura.getProperty("senha")
                keyAlias = assinatura.getProperty("apelido")
                keyPassword = assinatura.getProperty("senha")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2025.04.01")
    implementation(bom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
