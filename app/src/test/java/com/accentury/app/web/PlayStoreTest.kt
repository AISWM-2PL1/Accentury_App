package com.accentury.app.web

import android.content.ActivityNotFoundException
import org.junit.Assert.assertEquals
import org.junit.Test

class PlayStoreTest {

    @Test
    fun `스토어 앱이 있으면 market 링크 하나만 연다`() {
        val opened = mutableListOf<String>()
        openStoreListing { opened += it }
        assertEquals(listOf("market://details?id=com.accentury.app"), opened)
    }

    @Test
    fun `market 링크를 받을 앱이 없으면 웹 상세 페이지로 다시 연다`() {
        val opened = mutableListOf<String>()
        openStoreListing { url ->
            opened += url
            if (url.startsWith("market:")) throw ActivityNotFoundException()
        }
        assertEquals(
            listOf("market://details?id=com.accentury.app", "https://play.google.com/store/apps/details?id=com.accentury.app"),
            opened,
        )
    }
}
