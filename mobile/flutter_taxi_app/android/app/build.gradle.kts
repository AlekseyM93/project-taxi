plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.example.taxi_platform_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.example.taxi_platform_mobile"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "role"
    productFlavors {
        create("unified") {
            dimension = "role"
            applicationId = "com.example.taxi_platform_mobile"
            resValue("string", "app_name", "Такси платформа")
        }
        create("passenger") {
            dimension = "role"
            applicationId = "com.example.taxi.passenger"
            resValue("string", "app_name", "Такси Пассажир")
        }
        create("driver") {
            dimension = "role"
            applicationId = "com.example.taxi.driver"
            resValue("string", "app_name", "Такси Водитель")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for production.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
