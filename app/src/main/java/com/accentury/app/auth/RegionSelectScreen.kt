package com.accentury.app.auth

import android.graphics.Matrix
import android.graphics.Path
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.PathParser
import com.accentury.app.R
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.Haptic
import com.accentury.app.ui.components.PaperScreen
import com.accentury.app.ui.components.PaperTitle
import com.accentury.app.ui.components.performHaptic
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Jua
import com.accentury.app.ui.theme.LightPaper
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Motion
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors
import com.accentury.app.ui.theme.motionDuration
import kotlin.math.roundToInt
import android.graphics.Region as GraphicsRegion

/**
 * 출신 지역 선택 (KAN-354 3단계, 시안 s-13-region-select-maponly). 지도 위 칩 10개 가운데 하나를 고른다. 세 자리가 같은 화면을 쓴다:
 * 회원은 추가 정보(프로필) 다음(AuthGate), 둘러보기·익명 빌드는 시작 게이트의 동의 화면 다음과 재응시 직전([needsAnonymousRegion]).
 *
 * 규칙은 웹 지역 화면과 같다 — 기본 선택이 없고(그냥 [다음]을 누른 녹음이 엉뚱한 라벨로 쌓이지 않게) 건너뛰기도 없다.
 * 고른 값은 호출자가 든다 — 회원은 프로필로 뒤로 갔다 와도 남아야 해서 [ProfileFormState.region]에 둔다.
 *
 * @param selected 고른 지역. null이면 [다음]이 꺼져 있다
 * @param onSelect 칩이나 지도 면을 눌렀다
 * @param onNext [다음]. 회원은 여기서 프로필을 저장한다(`PUT /v0/users/me/profile`)
 * @param busy 저장 중 — 고르기와 [다음]을 막는다
 * @param error 방금 실패한 저장의 안내 ([AuthGateState.NeedsProfile.error])
 */
@Composable
fun RegionSelectScreen(
    selected: Region?,
    onSelect: (Region) -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    error: AuthFailure? = null,
) {
    // [다음]과 안내 줄은 바닥 고정(PaperFooter) — 하단 주 버튼은 모든 네이티브 화면에서 같은 자리다(KAN-354 리뷰 P1-1).
    PaperScreen(
        modifier = modifier,
        footer = {
            AccenturyButton(
                text = "다음",
                onClick = onNext,
                modifier = Modifier.fillMaxWidth(),
                enabled = selected != null && !busy,
                trailing = { Icon(painterResource(R.drawable.ic_arrow_forward_24), null, Modifier.size(20.dp)) },
            )
            Text(
                "이 정보는 억양 분석 모델을 다듬는 데만 써요",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        PaperTitle("어느 지역 말씨가 몸에 배어 있나요?")
        Text(
            "본인이 쓴다고 생각하는 억양의 지역을 골라 주세요",
            style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 10.dp),
        )

        RegionMap(
            selected = selected,
            onSelect = onSelect,
            enabled = !busy,
            modifier = Modifier.padding(top = Spacing.x3).fillMaxWidth().height(MAP_HEIGHT),
        )

        // 고르기 전에도 한 줄 자리를 잡아 둔다 — 고를 때 아래 출처 표기가 들썩이지 않게. 줄 높이 28만으로는 칩마다 결과 줄 높이가
        // 달라(에뮬레이터 경남 55px·강원 47px, 「·」가 든 줄이 컸다) 최소 높이 36으로 자리를 고정한다(리뷰 P2-5).
        Text(
            selected?.let(::regionSelectionLine).orEmpty(),
            style = TextStyle(fontFamily = Jua, fontSize = 18.sp, lineHeight = 28.sp),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .padding(top = Spacing.x4)
                .fillMaxWidth()
                .heightIn(min = 36.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
        // 경계 데이터 출처 (KAN-347·354 공통 표기). 시안에 자리가 없어 결과 줄 아래 오른쪽 작은 글씨로 둔다.
        Text(
            "행정구역 경계: 통계청 SGIS(2013)",
            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(top = Spacing.x1).fillMaxWidth(),
        )

        if (error != null) AuthFailureBlock(error, verb = "저장", modifier = Modifier.padding(top = Spacing.x4))
    }
}

/** 시안 `.region-map` 높이. 칩·연결선 좌표는 폭 342(390 화면 − 좌우 24) × 이 높이 상자 기준이다. */
private val MAP_HEIGHT = 420.dp
private const val DESIGN_WIDTH = 342f
private const val DESIGN_HEIGHT = 420f

/** 칩 가운데 좌표 (시안 칩 `--x`·`--y`). 서울은 칩이 경기 면을 덮지 않게 서쪽으로 빼고 연결선을 긋는다. */
private fun chipPoint(region: Region): Offset = when (region) {
    Region.SEOUL -> Offset(70f, 87f)
    Region.GYEONGGI -> Offset(151f, 65f)
    Region.GANGWON -> Offset(216f, 65f)
    Region.CHUNGBUK -> Offset(178f, 148f)
    Region.CHUNGNAM -> Offset(117f, 177f)
    Region.JEONBUK -> Offset(140f, 228f)
    Region.JEONNAM -> Offset(121f, 289f)
    Region.GYEONGBUK -> Offset(234f, 180f)
    Region.GYEONGNAM -> Offset(210f, 265f)
    Region.JEJU -> Offset(155f, 395f)
}

/** 시안 `svg.region-connector`(viewBox 0 0 342 420)의 `M92 87 L128 87` — 서울 칩에서 서울 면까지 */
private val CONNECTOR_START = Offset(92f, 87f)
private val CONNECTOR_END = Offset(128f, 87f)

/**
 * 정본 SVG를 그리기·탭 판정용으로 한 번 푼 것. [fills]는 지역 묶음별 면(문서 순서 = 그리는 순서), [metroLines]는 광역시 경계선이다.
 * 탭 판정은 viewBox 좌표를 [HIT_SCALE]배로 키운 `android.graphics.Region`으로 한다 — viewBox 1단위(약 1dp)보다 촘촘하게.
 */
private class RegionMapShapes(paths: List<RegionMapPath>) {
    private val distinct = paths.distinctBy { it.d }
    val fills: List<Pair<Region, List<Path>>> =
        distinct.groupBy { it.region }.map { (region, ps) -> region to ps.map { PathParser.createPathFromPathData(it.d) } }
    val metroLines: List<Path> = distinct.filter { it.metro }.map { PathParser.createPathFromPathData(it.d) }

    private val hitAreas: List<Pair<Region, GraphicsRegion>> = run {
        val toHit = Matrix().apply {
            setScale(HIT_SCALE, HIT_SCALE)
            preTranslate(-REGION_MAP_VIEW_X, -REGION_MAP_VIEW_Y)
        }
        val clip = GraphicsRegion(0, 0, (REGION_MAP_VIEW_WIDTH * HIT_SCALE).toInt(), (REGION_MAP_VIEW_HEIGHT * HIT_SCALE).toInt())
        fills.flatMap { (region, ps) ->
            ps.map { region to GraphicsRegion().apply { setPath(Path(it).apply { transform(toHit) }, clip) } }
        }
    }

    /** 지도 칸 안의 비율 좌표(0~1) → 그 자리 지역. 광역시 면은 자기 묶음 지역이다. 나중에 그린(위에 있는) 면부터 본다. */
    fun hit(fx: Float, fy: Float): Region? {
        val x = (fx * REGION_MAP_VIEW_WIDTH * HIT_SCALE).toInt()
        val y = (fy * REGION_MAP_VIEW_HEIGHT * HIT_SCALE).toInt()
        return hitAreas.lastOrNull { (_, area) -> area.contains(x, y) }?.first
    }

    private companion object {
        const val HIT_SCALE = 4f
    }
}

/**
 * 지도 면 + 연결선 + 칩 10개. 면은 지역 묶음마다 잉크 윤곽(시안 filter `feMorphology` 1.3 팽창)을 먼저 긋고 그 위를 칠하며,
 * 전체 아래에 종이 그림자(시안 `drop-shadow(3px 4px 0 #cfc5aa)`)를 깐다. 고른 지역 면은 벽돌로 150ms에 바뀐다(움직임 줄이기면 바로).
 *
 * 스크린 리더는 칩만 읽는다 — 지도 면은 장식이라 의미를 지운다. 칩 10개가 한 라디오 그룹이다.
 */
@Composable
private fun RegionMap(selected: Region?, onSelect: (Region) -> Unit, enabled: Boolean, modifier: Modifier) {
    val context = LocalContext.current
    val shapes = remember {
        RegionMapShapes(parseRegionMap(context.assets.open("region-map.svg").bufferedReader().use { it.readText() }))
    }
    val view = LocalView.current
    val pick: (Region) -> Unit = {
        // 고를 때 가벼운 탭 (KAN-258) — 객관식 선택지(ChoiceButton)와 같은 규칙이다
        view.performHaptic(Haptic.Tap)
        onSelect(it)
    }

    val duration = motionDuration(Motion.FAST)
    val fillOf: Map<Region, State<Color>> = Region.entries.associateWith { region ->
        animateColorAsState(
            targetValue = if (region == selected) LightPoint else LightPaper,
            animationSpec = tween(duration, easing = Motion.easeOut),
            label = "regionFill",
        )
    }
    val ink = MaterialTheme.colorScheme.primary
    val shadow = MaterialTheme.accenturyColors.primaryDim
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    Box(modifier = modifier.selectableGroup()) {
        Box(
            Modifier
                .matchParentSize()
                .clearAndSetSemantics {}
                .pointerInput(shapes, enabled) {
                    if (!enabled) return@pointerInput
                    detectTapGestures { at ->
                        shapes.hit(at.x / size.width, at.y / size.height)?.let(pick)
                    }
                }
                .drawWithCache {
                    val toView = Matrix().apply {
                        setScale(size.width / REGION_MAP_VIEW_WIDTH, size.height / REGION_MAP_VIEW_HEIGHT)
                        preTranslate(-REGION_MAP_VIEW_X, -REGION_MAP_VIEW_Y)
                    }
                    val fills = shapes.fills.map { (region, ps) ->
                        region to ps.map { Path(it).apply { transform(toView) }.asComposePath() }
                    }
                    val metro = shapes.metroLines.map { Path(it).apply { transform(toView) }.asComposePath() }
                    // 팽창 1.3(viewBox 단위)은 화면에서 약 1.5dp 바깥 윤곽이다 — 경계 가운데에 긋는 선이라 굵기는 그 두 배.
                    val outline = Stroke(width = 3.dp.toPx(), join = StrokeJoin.Round)
                    val metroStroke = Stroke(width = 0.75.dp.toPx())
                    val sx = size.width / DESIGN_WIDTH
                    val sy = size.height / DESIGN_HEIGHT
                    onDrawBehind {
                        translate(3.dp.toPx(), 4.dp.toPx()) {
                            fills.forEach { (_, ps) ->
                                ps.forEach {
                                    drawPath(it, shadow, style = outline)
                                    drawPath(it, shadow)
                                }
                            }
                        }
                        fills.forEach { (region, ps) ->
                            ps.forEach { drawPath(it, ink, style = outline) }
                            val fill = fillOf.getValue(region).value
                            ps.forEach { drawPath(it, fill) }
                        }
                        // 시안 `.metro-lines` — 묶음 안 광역시 경계를 그림자색 가는 선으로
                        metro.forEach { drawPath(it, shadow, style = metroStroke) }
                        drawLine(
                            muted,
                            Offset(CONNECTOR_START.x * sx, CONNECTOR_START.y * sy),
                            Offset(CONNECTOR_END.x * sx, CONNECTOR_END.y * sy),
                            strokeWidth = 1.dp.toPx(),
                        )
                    }
                },
        )

        // 칩 순서 = 스크린 리더 순서 = [Region] 선언 순서(시안 마크업 순서와 같다)
        Region.entries.forEach { region ->
            val point = chipPoint(region)
            RegionChip(
                region = region,
                selected = region == selected,
                enabled = enabled,
                onClick = { pick(region) },
                modifier = Modifier.align { size, space, _ ->
                    // 칩 가운데를 시안 좌표에 둔다(`translate(-50%, -50%)`). 폭이 342가 아닌 화면은 가로로 비례해 옮긴다.
                    IntOffset(
                        (space.width * point.x / DESIGN_WIDTH).roundToInt() - size.width / 2,
                        (space.height * point.y / DESIGN_HEIGHT).roundToInt() - size.height / 2,
                    )
                },
            )
        }
    }
}

/**
 * 지역 칩 (시안 `.region-chip`). 누르는 칸은 48(터치 최소) 높이이고 그 가운데에 28 높이 이름표가 선다 — 잉크 1 테두리·모서리 4·paper 면,
 * 고르면 벽돌 면·paper 글자(테두리는 잉크 그대로). 라디오 버튼으로 이름과 선택 상태를 말한다.
 */
@Composable
private fun RegionChip(region: Region, selected: Boolean, enabled: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val shape = RoundedCornerShape(Radius.sm)
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = 60.dp, minHeight = Dimens.touchTargetMin)
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = regionChipDescription(region) }
            .padding(horizontal = Spacing.x2),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .heightIn(min = 28.dp)
                .border(1.dp, MaterialTheme.colorScheme.primary, shape)
                .background(if (selected) LightPoint else LightPaper, shape)
                .padding(horizontal = Spacing.x2),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                region.label,
                style = TextStyle(fontFamily = Jua, fontSize = 14.sp, lineHeight = 14.sp),
                color = if (selected) LightPaper else MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}
