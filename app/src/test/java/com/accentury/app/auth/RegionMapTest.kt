package com.accentury.app.auth

import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 출신 지역 지도 데이터 (KAN-354 3단계). 사본 일치는 KAN-347 7단계의 플랫폼별 사본 일치 테스트와 같은 방식이다. */
class RegionMapTest {

    /** Gradle은 모듈 디렉터리(app/)에서, IDE는 레포 루트에서 돌릴 수 있다 — AppLinkTest와 같은 방식으로 둘 다 본다. */
    private fun repoFile(fromModule: String, fromRoot: String): File =
        listOf(File(fromModule), File(fromRoot)).firstOrNull { it.isFile }
            ?: error("$fromRoot 을 찾지 못했다 (cwd=${File(".").absolutePath})")

    private val copy = repoFile("src/main/assets/region-map.svg", "app/src/main/assets/region-map.svg")
    private val canonical = repoFile("../docs/assets/region-map.svg", "docs/assets/region-map.svg")

    @Test
    fun `앱 사본은 정본 docs assets region-map svg와 바이트가 같다`() {
        assertArrayEquals(canonical.readBytes(), copy.readBytes())
    }

    @Test
    fun `path 25개, 열 지역 모두 면이 있고 d는 M L Z 명령뿐이다`() {
        val paths = parseRegionMap(copy.readText())

        assertEquals(25, paths.size)
        assertEquals(Region.entries.toSet(), paths.map { it.region }.toSet())
        paths.forEach { assertTrue(it.d, it.d.all { c -> !c.isLetter() || c in "MLZ" }) }
        // 광역시·세종 7곳은 면 한 번 + 경계선 한 번 실린다
        assertEquals(14, paths.count { it.metro })
    }

    @Test
    fun `결과 줄은 광역시를 붙이고 세종은 적지 않는다`() {
        assertEquals(
            listOf(
                "서울", "경기 · 인천 포함", "강원", "충북", "충남 · 대전 포함",
                "전북", "전남 · 광주 포함", "경북 · 대구 포함", "경남 · 부산·울산 포함", "제주",
            ),
            Region.entries.map(::regionSelectionLine),
        )
    }
}
