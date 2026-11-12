package com.accentury.app.web

import org.junit.Assert.assertEquals
import org.junit.Test

class WebTextZoomTest {

    @Test
    fun `OS 배율을 백분율로 옮기고 200에서 멈춘다`() {
        assertEquals(100, webTextZoom(1.0f))
        assertEquals(85, webTextZoom(0.85f))
        assertEquals(130, webTextZoom(1.3f))
        assertEquals(200, webTextZoom(2.0f))
        assertEquals(200, webTextZoom(3.0f))
    }
}
