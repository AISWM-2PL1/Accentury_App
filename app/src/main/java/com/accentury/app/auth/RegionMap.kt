package com.accentury.app.auth

/*
 * 출신 지역 지도의 데이터 쪽 (KAN-354 3단계). Android 클래스를 쓰지 않는다 — 단위 테스트(Robolectric 없음)가 그대로 부른다.
 *
 * 경계는 정본 `docs/assets/region-map.svg`(통계청 SGIS 2013 경계를 10개 지역으로 묶어 단순화, KAN-347 7단계 공동 산출물)의
 * 바이트 동일 사본 `app/src/main/assets/region-map.svg`에서 읽는다. 사본이 정본과 같은지는 RegionMapTest가 본다.
 */

/** 정본 SVG의 viewBox `0 -8 300 335`. 지도 면은 이 상자를 지도 칸에 늘려 채운다(시안 `preserveAspectRatio="none"`). */
internal const val REGION_MAP_VIEW_X = 0f
internal const val REGION_MAP_VIEW_Y = -8f
internal const val REGION_MAP_VIEW_WIDTH = 300f
internal const val REGION_MAP_VIEW_HEIGHT = 335f

/**
 * SVG path 하나. [metro]는 광역시·세종(`data-metro="1"`)이다 — 고르면 자기 [region]으로 골라진다.
 * 정본은 광역시 path를 두 번 싣는다(면 한 번, 위에 긋는 경계선 한 번). 같은 [d]이므로 그릴 때 [d]로 겹침을 걷는다.
 */
internal data class RegionMapPath(val region: Region, val metro: Boolean, val d: String)

private val PATH_TAG = Regex("""<path\s([^>]*)/>""")
private val REGION_ATTR = Regex("""data-region="([A-Z]+)"""")
private val D_ATTR = Regex("""\sd="([^"]+)"""")

/** 정본 SVG 글을 문서 순서대로 path 목록으로 나눈다. 모르는 지역 코드가 있으면 던진다 — 정본이 [Region]과 어긋났다는 뜻이다. */
internal fun parseRegionMap(svg: String): List<RegionMapPath> = PATH_TAG.findAll(svg).map { tag ->
    val attrs = tag.groupValues[1]
    val code = checkNotNull(REGION_ATTR.find(attrs)).groupValues[1]
    RegionMapPath(
        region = Region.valueOf(code),
        metro = "data-metro=\"1\"" in attrs,
        d = checkNotNull(D_ATTR.find(attrs)).groupValues[1],
    )
}.toList()

/**
 * 지역 묶음에 든 광역시 (시안 `data-metro-label`). 세종은 지역 코드 묶음에서 충남에 들지만 화면에 적지 않는다(티켓 결정).
 * 문구 정본은 웹 `regions.ts`다 — 아직 웹에 없어 티켓 문구를 쓰고, 웹은 KAN-347 7단계가 같은 문구로 맞춘다.
 */
private fun metroOf(region: Region): String? = when (region) {
    Region.GYEONGGI -> "인천"
    Region.CHUNGNAM -> "대전"
    Region.JEONNAM -> "광주"
    Region.GYEONGBUK -> "대구"
    Region.GYEONGNAM -> "부산·울산"
    else -> null
}

/** 지도 아래 결과 한 줄 (시안 `.region-selection`): 「경남 · 부산·울산 포함」, 광역시가 없으면 이름만 */
internal fun regionSelectionLine(region: Region): String =
    metroOf(region)?.let { "${region.label} · $it 포함" } ?: region.label

/** 칩이 스크린 리더에 말하는 이름 (시안 칩 `aria-label`): 「경남, 부산·울산 포함」 */
internal fun regionChipDescription(region: Region): String =
    metroOf(region)?.let { "${region.label}, $it 포함" } ?: region.label
