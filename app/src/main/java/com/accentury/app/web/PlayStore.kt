package com.accentury.app.web

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import com.accentury.app.analytics.CrashReports

/*
 * 업데이트 필요 화면의 [업데이트하기] (KAN-288 시안 15, HIG 수정). 서버가 재시도 불가로 거절한 버전이라 같은 앱으로는
 * 풀 길이 없고, 사용자가 할 일은 스토어에서 새 버전을 받는 것 하나다.
 *
 * 근거: Android 문서 「Linking to Google Play」(developer.android.com/distribute/marketing-tools/linking-to-google-play)의
 * 앱 상세 링크 `market://details?id=<패키지>` / `https://play.google.com/store/apps/details?id=<패키지>`, 그리고
 * 「Common intents」(guide/components/intents-common)의 ACTION_VIEW — 받을 액티비티가 없으면 startActivity가
 * ActivityNotFoundException을 던진다. Play 스토어가 없는 기기(에뮬레이터·일부 제조사)는 market 스킴을 받는 앱이 없어
 * https로 한 번 더 연다. 패키지 이름은 applicationId 고정값이다 — 디버그 빌드도 스토어에는 출시 앱만 있다.
 */
private const val PLAY_PACKAGE = "com.accentury.app"
internal const val PLAY_MARKET_URL = "market://details?id=$PLAY_PACKAGE"
internal const val PLAY_WEB_URL = "https://play.google.com/store/apps/details?id=$PLAY_PACKAGE"

/** market 링크를 먼저, 받을 앱이 없으면 웹 링크로. 웹 링크마저 못 열면(브라우저도 없음) 크래시만 막고 흔적을 남긴다. */
internal fun openStoreListing(launch: (String) -> Unit) {
    try {
        launch(PLAY_MARKET_URL)
    } catch (_: ActivityNotFoundException) {
        try {
            launch(PLAY_WEB_URL)
        } catch (_: ActivityNotFoundException) {
            CrashReports.recordExternalLinkFailure("no_store")
        }
    }
}

fun openStoreListing(context: Context) = openStoreListing { url ->
    context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
