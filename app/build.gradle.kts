plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "pl.kacperpe.gierkaoliwka"
    compileSdk = 34

    defaultConfig {
        applicationId = "pl.kacperpe.gierkaoliwka"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    // Stały klucz w repo — każda nowa wersja instaluje się jako aktualizacja.
    signingConfigs {
        create("gierka") {
            storeFile = file("gierka.keystore")
            storePassword = "gierka123"
            keyAlias = "gierka"
            keyPassword = "gierka123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("gierka")
        }
        debug {
            signingConfig = signingConfigs.getByName("gierka")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
}
