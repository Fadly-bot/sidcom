package com.karsa.sidcom

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class SidcomApp : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
