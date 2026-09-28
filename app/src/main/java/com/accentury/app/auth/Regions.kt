package com.accentury.app.auth

/**
 * 출신지역 (KAN-224 추가 정보, KAN-202 표). `web/src/region/regions.ts`의 REGIONS와 서버
 * `session/Region.java`의 거울이다 — [name]이 그대로 요청 본문의 코드이고, 선언 순서가 화면의 나열
 * 순서다(기획표 순서). 코드나 순서를 바꾸면 웹·서버와 함께 바꾼다. 서버 저장 전용 `UNKNOWN`은 없다.
 */
enum class Region(val label: String) {
    SEOUL("서울"),
    GYEONGGI("경기"),
    GANGWON("강원"),
    CHUNGBUK("충북"),
    CHUNGNAM("충남"),
    JEONBUK("전북"),
    JEONNAM("전남"),
    GYEONGBUK("경북"),
    GYEONGNAM("경남"),

    // 지라 표는 '제주도'였다 - 2026-09-11 다른 지역과 표기를 통일해 '제주'로 (웹 regions.ts와 같은 결정).
    JEJU("제주"),
}

/** 성별 (§3.10). [name]이 요청 본문의 값이다. */
enum class Gender(val label: String) {
    MALE("남성"),
    FEMALE("여성"),
}
