#!/usr/bin/env python3
"""정본 ↔ 사본 토큰 대조 (KAN-148, Papercut 팔레트 KAN-161).

`docs/wiki/design-tokens.md`의 §2 색 표와 §3 타이포 표(크기·굵기)를 정본으로 삼아, 네이티브
(`Color.kt`, `Type.kt`)와 웹(`tokens.css`)이 같은 값을 들고 있는지 확인한다. iOS(`PapercutTheme.swift`)는
팔레트 여섯 색과 타이포 슬롯의 크기, 굵기, Jua 여부를 정본과 대조한다 (KAN-361).

    python3 tools/check_tokens.py

갱신 절차(정본 §1)를 지켰는지 기계로 확인하는 자리다 - 문서에 절차만 적어 두면
한쪽만 고친 커밋이 리뷰를 통과하는 날이 온다. 어긋나면 종료 코드 1.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOC = ROOT / "docs/wiki/design-tokens.md"
KOTLIN = ROOT / "app/src/main/java/com/accentury/app/ui/theme/Color.kt"
KOTLIN_TYPE = ROOT / "app/src/main/java/com/accentury/app/ui/theme/Type.kt"
CSS = ROOT / "web/src/tokens.css"
SWIFT = ROOT / "ios/Accentury/UI/Theme/PapercutTheme.swift"

# 읽다가 해석하지 못한 값. 트레이스백으로 죽지 않고 어긋남으로 보고한다 (KAN-361 리뷰) -
# `var(--x)`나 `#rgb` 같은 표기가 들어와도 어느 토큰인지 알려 주고 종료 코드 1로 끝난다.
UNREADABLE: list[str] = []


def normalize_or_note(where: str, value: str):
    """[normalize]와 같되, 못 읽으면 [UNREADABLE]에 적고 None을 돌려준다."""
    try:
        return normalize(value)
    except ValueError:
        UNREADABLE.append(f"{where}: 색 값 {value.strip()!r}을 읽지 못했다 (#rrggbb 또는 rgb()/rgba()만 읽는다)")
        return None


def normalize(value: str) -> str:
    """`#2563eb`와 `rgba(37, 99, 235, 0.13)`를 비교 가능한 한 꼴(#rrggbbaa)로 만든다."""
    value = value.strip().lower()
    m = re.fullmatch(r"#([0-9a-f]{6})", value)
    if m:
        return f"#{m.group(1)}ff"
    m = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)", value)
    if m:
        r, g, b = (int(m.group(i)) for i in (1, 2, 3))
        a = round(float(m.group(4) or 1) * 255)
        return f"#{r:02x}{g:02x}{b:02x}{a:02x}"
    raise ValueError(f"알 수 없는 색 표기: {value!r}")


def kotlin_color(literal: str) -> str:
    """`Color(0xFF2563EB)` → `#2563ebff` (Compose는 AARRGGBB, 표준 표기는 RRGGBBAA)."""
    h = literal.lower()
    return f"#{h[2:]}{h[0:2]}"


def parse_doc():
    """§2의 라이트·다크 표를 읽는다. 반환: {'light': {토큰: 값}, 'dark': {...}}"""
    text = DOC.read_text(encoding="utf-8")
    section = text.split("## 2. 색", 1)[1].split("## 3.", 1)[0]
    light_part, dark_part = section.split("### 다크", 1)
    light_part = light_part.split("### 라이트", 1)[1]

    row = re.compile(r"^\|\s*`([a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|")

    def rows(chunk):
        out = {}
        for line in chunk.splitlines():
            m = row.match(line.strip())
            if m:
                value = normalize_or_note(f"정본 §2 `{m.group(1)}`", m.group(2))
                if value is not None:
                    out[m.group(1)] = value
        return out

    return {"light": rows(light_part), "dark": rows(dark_part)}


def parse_kotlin():
    text = KOTLIN.read_text(encoding="utf-8")
    found = {"light": {}, "dark": {}}
    for name, literal in re.findall(r"^val\s+(\w+)\s*=\s*Color\(0x([0-9A-Fa-f]{8})\)", text, re.M):
        if name.startswith("Light"):
            scheme, rest = "light", name[len("Light"):]
        elif name.startswith("Dark"):
            scheme, rest = "dark", name[len("Dark"):]
        else:
            continue
        # PascalCase → kebab-case (PromptCardStart → prompt-card-start)
        token = re.sub(r"(?<!^)(?=[A-Z])", "-", rest).lower()
        found[scheme][token] = kotlin_color(literal)
    return found


def parse_css():
    """웹 색 토큰을 라이트·다크로 나눠 읽는다.

    KAN-161에서 웹의 `@media (prefers-color-scheme: dark)` 블록이 사라졌다 - 시스템이
    다크여도 크림 화면 그대로 간다. 블록이 없으면 `:root` 값이 곧 다크에서 쓰이는 값이므로
    라이트와 같은 사전을 다크로도 돌려준다. 정본 §2의 다크 표가 라이트와 같은 값을 들고
    있는지가 이 대조로 확인된다 - 나중에 한쪽만 되살려 두 런타임이 갈라지는 것을 막는다.
    """
    text = CSS.read_text(encoding="utf-8")
    decl = re.compile(r"--color-([a-z0-9-]+)\s*:\s*([^;]+);")

    def rows(chunk):
        out = {}
        for name, value in decl.findall(chunk):
            got = normalize_or_note(f"tokens.css --color-{name}", value)
            if got is not None:
                out[name] = got
        return out

    marker = "prefers-color-scheme: dark"
    if marker not in text:
        light = rows(text)
        return {"light": light, "dark": dict(light)}

    dark_start = text.index(marker)
    return {"light": rows(text[:dark_start]), "dark": rows(text[dark_start:])}


# 정본 §3의 스타일 이름 → (Type.kt의 M3 슬롯, tokens.css의 변수 접미사)
TYPE_SLOTS = {
    "display": ("displayLarge", "display"),
    "headline": ("headlineMedium", "headline"),
    "title": ("titleLarge", "title"),
    "titleSmall": ("titleMedium", "title-sm"),
    # 녹음 타이머·경고 캡슐 (KAN-161 4단계). M3에 "타이머" 슬롯이 없어 남아 있던 titleSmall에
    # 얹었다 - 이름은 M3 것이고 뜻은 정본 §3의 `timer`다. 이 표가 그 대응의 정본이다.
    "timer": ("titleSmall", "timer"),
    "body": ("bodyLarge", "body"),
    "bodySmall": ("bodyMedium", "body-sm"),
    "label": ("labelLarge", "label"),
    "caption": ("labelSmall", "caption"),
}


def parse_doc_type_rows():
    """§3 표에서 스타일별 (크기 sp, 웹 rem, 굵기)를 읽는다.

    표는 `| 토큰 | 크기 | 웹 | 굵기 | ...` 꼴이다. 웹 열은 KAN-313에서 rem으로 바뀌며 더해졌다
    (16px = 1rem). 이 열을 모르는 옛 정규식은 표를 한 줄도 읽지 못해 타이포 대조가 통째로 꺼져 있었다 (KAN-361).
    """
    text = DOC.read_text(encoding="utf-8")
    section = text.split("## 3. 타이포", 1)[1].split("## 4.", 1)[0]
    row = re.compile(r"^\|\s*`(\w+)`\s*\|\s*(\d+)sp\s*\|\s*`([\d.]+)rem`\s*\|\s*(\d+)\s*\|")
    out = {}
    for line in section.splitlines():
        m = row.match(line.strip())
        if m:
            out[m.group(1)] = (int(m.group(2)), float(m.group(3)), int(m.group(4)))
    return out


# Compose의 이름 있는 굵기 → 숫자. Jua는 400 하나뿐이라 그 위를 요청하면 합성 볼드가 된다
FONT_WEIGHTS = {
    "Thin": 100,
    "ExtraLight": 200,
    "Light": 300,
    "Normal": 400,
    "Medium": 500,
    "SemiBold": 600,
    "Bold": 700,
    "ExtraBold": 800,
    "Black": 900,
}


def parse_kotlin_type_rows():
    """Type.kt의 슬롯별 (fontSize, fontWeight)."""
    text = KOTLIN_TYPE.read_text(encoding="utf-8")
    out = {}
    for slot, body in re.findall(r"(\w+) = TextStyle\((.*?)\n    \)", text, re.S):
        size = re.search(r"fontSize = (\d+)\.sp", body)
        weight = re.search(r"fontWeight = FontWeight\.(\w+)", body)
        if size and weight:
            out[slot] = (int(size.group(1)), FONT_WEIGHTS.get(weight.group(1), 0))
    return out


def parse_css_type_rows():
    """tokens.css의 `--text-*` 값(rem, KAN-313)과 `.type-*` 클래스가 고른 굵기.

    굵기는 두 단계를 거친다 - 클래스가 `var(--weight-medium)`을 고르고 그 변수가 숫자를
    갖는다. 클래스만 보면 이름이, 변수만 보면 숫자가 어느 스타일 것인지 알 수 없어
    둘을 이어 붙여야 정본의 굵기 열과 비교할 수 있다.
    """
    text = CSS.read_text(encoding="utf-8")
    sizes = {
        name: float(value)
        for name, value in re.findall(r"--text-([a-z-]+)\s*:\s*([\d.]+)rem;", text)
    }
    scale = {
        name: int(value)
        for name, value in re.findall(r"--weight-([a-z-]+)\s*:\s*(\d+);", text)
    }
    weights = {}
    rule = re.compile(
        r"\.type-([a-z-]+)\s*\{[^}]*?font-weight:\s*var\(--weight-([a-z-]+)\)",
        re.S,
    )
    for name, weight_name in rule.findall(text):
        weights[name] = scale.get(weight_name, 0)
    return sizes, weights


# Jua를 쓰는 스타일. 번들 폰트에 굵기가 400 하나뿐이라 그 위를 요청하면 합성 볼드가 된다
JUA_STYLES = {"display", "headline", "title", "titleSmall", "timer"}
JUA_WEIGHT = 400


def check_typography():
    """정본 §3 · Type.kt · tokens.css의 글자 크기와 굵기가 같은지."""
    doc = parse_doc_type_rows()
    kotlin = parse_kotlin_type_rows()
    css_sizes, css_weights = parse_css_type_rows()

    problems = []
    if set(doc) != set(TYPE_SLOTS):
        problems.append(f"정본 §3의 스타일 목록이 스크립트의 TYPE_SLOTS와 다르다: {sorted(set(doc) ^ set(TYPE_SLOTS))}")
        return problems, 0

    for style, (size, rem, weight) in sorted(doc.items()):
        slot, css_name = TYPE_SLOTS[style]
        if kotlin.get(slot) != (size, weight):
            problems.append(f"타이포/{style}: Type.kt {slot}={kotlin.get(slot)} ≠ 정본={(size, weight)}")
        if rem * 16 != size:
            problems.append(f"타이포/{style}: 정본의 웹 열 {rem}rem이 크기 {size}sp와 다르다 (16px = 1rem)")
        if css_sizes.get(css_name) != rem:
            problems.append(f"타이포/{style}: tokens.css --text-{css_name}={css_sizes.get(css_name)}rem ≠ 정본={rem}rem")
        if css_weights.get(css_name) != weight:
            problems.append(f"타이포/{style}: tokens.css .type-{css_name} 굵기={css_weights.get(css_name)} ≠ 정본={weight}")
        if style in JUA_STYLES and weight != JUA_WEIGHT:
            problems.append(
                f"타이포/{style}: Jua 슬롯이 {weight} - 번들 폰트는 400뿐이라 합성 볼드가 된다 (정본 §3)"
            )

    # 대사 카드는 ux-ui.md §5가 24 이상을 요구한다 - 값이 바뀌어도 이 선은 지켜야 한다
    headline = doc.get("headline", (0, 0.0, 0))[0]
    if headline < 24:
        problems.append(f"타이포/headline: 대사 카드가 {headline}sp - ux-ui.md §5의 24sp 최소선 미달")

    return problems, len(doc)


# iOS 팔레트 이름 → 정본 §2 라이트 토큰. iOS는 토큰 표 대신 팔레트 여섯 색을 든다 (PapercutTheme.swift 머리 주석)
SWIFT_COLORS = {
    "ink": "foreground",
    "cream": "background",
    "paper": "paper",
    "paperShadow": "primary-dim",
    "muted": "muted-foreground",
    "point": "point",
}

# iOS TextStyle 슬롯 → 정본 §3 스타일. 버튼 라벨 둘(button, textButton)은 §3 표 밖 규칙이라 대조하지 않는다
SWIFT_TYPE_SLOTS = {
    "display": "display",
    "headline": "headline",
    "titleLarge": "title",
    "title": "titleSmall",
    "timer": "timer",
    "body": "body",
    "bodySmall": "bodySmall",
    "label": "label",
    "caption": "caption",
}


# SwiftUI `Font.Weight` 이름 → 숫자
SWIFT_WEIGHTS = {
    "ultraLight": 100,
    "thin": 200,
    "light": 300,
    "regular": 400,
    "medium": 500,
    "semibold": 600,
    "bold": 700,
    "heavy": 800,
    "black": 900,
}


def _swift_switch(block: str, what: str, problems: list) -> dict:
    """`switch self` 블록을 슬롯 → 반환식(문자열)으로 편다. `case .a, .b: return X`와 `default: return X`를 읽는다.

    반환식은 해석하지 않고 줄 끝까지 그대로 돌려준다 - 부르는 쪽이 숫자나 이름으로 정확히 읽히는지 본다. 앞자리만
    잘라 읽으면 `16.5`가 16으로, 산술식이 첫 숫자로 통과한다 (KAN-361 Codex 리뷰).
    """
    out = {}
    default = None
    for line in block.splitlines():
        line = line.strip()
        m = re.fullmatch(r"case ([.\w, ]+): return (.+)", line)
        if m:
            # Swift의 switch는 먼저 맞는 case를 쓴다 - 같은 슬롯이 뒤에 또 나와도 첫 값을 지킨다
            for slot in re.findall(r"\.(\w+)", m.group(1)):
                out.setdefault(slot, m.group(2).strip())
            continue
        m = re.fullmatch(r"default: return (.+)", line)
        if m:
            default = m.group(1).strip()
    if default is not None:
        for slot in SWIFT_TYPE_SLOTS:
            out.setdefault(slot, default)
    missing = [slot for slot in SWIFT_TYPE_SLOTS if slot not in out]
    if missing:
        problems.append(f"iOS/타이포: PapercutTheme.swift {what} switch에서 {', '.join(missing)}를 못 찾았다")
    return out


def _swift_block(text: str, header: str) -> str:
    """`var size: CGFloat {`처럼 header로 시작하는 블록의 본문(다음 `var ` 전까지)."""
    start = text.index(header)
    rest = text[start + len(header):]
    end = rest.find("\n        var ")
    return rest if end < 0 else rest[:end]


def check_ios():
    """PapercutTheme.swift의 팔레트와 타이포 슬롯을 정본과 대조한다. 반환: (문제 목록, 대조한 색 수, 슬롯 수)"""
    problems = []
    text = SWIFT.read_text(encoding="utf-8")
    light = parse_doc()["light"]

    colors = dict(
        (name, f"#{r}{g}{b}ff".lower())
        for name, r, g, b in re.findall(
            r"static let (\w+) = Color\(red: 0x([0-9a-fA-F]{2}) / 255, green: 0x([0-9a-fA-F]{2}) / 255, "
            r"blue: 0x([0-9a-fA-F]{2}) / 255\)",
            text,
        )
    )
    for name, value in sorted(colors.items()):
        token = SWIFT_COLORS.get(name)
        if token is None:
            problems.append(f"iOS/{name}: PapercutTheme.swift에 있는 색인데 정본 대응(SWIFT_COLORS)이 없다")
        elif light.get(token) != value:
            problems.append(f"iOS/{name}: PapercutTheme.swift={value} ≠ 정본 `{token}`={light.get(token)}")
    for name in sorted(set(SWIFT_COLORS) - set(colors)):
        problems.append(f"iOS/{name}: PapercutTheme.swift에서 못 찾았다")

    doc = parse_doc_type_rows()
    sizes = _swift_switch(_swift_block(text, "var size: CGFloat {"), "크기", problems)
    weights = _swift_switch(_swift_block(text, "var weight: Font.Weight {"), "굵기", problems)
    jua = _swift_switch(_swift_block(text, "var usesJua: Bool {"), "Jua 여부", problems)

    for slot, style in sorted(SWIFT_TYPE_SLOTS.items()):
        if style not in doc:
            continue  # 정본 목록 자체가 어긋나면 check_typography가 먼저 알린다
        size, _rem, weight = doc[style]
        got_size = sizes.get(slot)
        if got_size is None or not re.fullmatch(r"\d+(?:\.\d+)?", got_size):
            problems.append(f"iOS/타이포/{style}: PapercutTheme.swift .{slot} 크기 {got_size!r}를 숫자로 읽지 못했다")
        elif float(got_size) != size:
            problems.append(f"iOS/타이포/{style}: PapercutTheme.swift .{slot} 크기={got_size} ≠ 정본={size}")
        got_weight = weights.get(slot)
        number = SWIFT_WEIGHTS.get((got_weight or "").lstrip("."))
        if number is None:
            problems.append(f"iOS/타이포/{style}: PapercutTheme.swift .{slot} 굵기 {got_weight!r}를 읽지 못했다")
        elif number != weight:
            problems.append(f"iOS/타이포/{style}: PapercutTheme.swift .{slot} 굵기={got_weight}({number}) ≠ 정본={weight}")
        got_jua = jua.get(slot)
        if got_jua not in ("true", "false"):
            problems.append(f"iOS/타이포/{style}: PapercutTheme.swift .{slot} usesJua {got_jua!r}를 읽지 못했다")
        elif (got_jua == "true") != (style in JUA_STYLES):
            problems.append(f"iOS/타이포/{style}: PapercutTheme.swift .{slot} usesJua={got_jua}가 정본(Jua 여부)과 다르다")

    return problems, len(colors), len(SWIFT_TYPE_SLOTS)


def main() -> int:
    doc = parse_doc()
    kotlin = parse_kotlin()
    css = parse_css()

    problems = []
    for scheme in ("light", "dark"):
        expected = doc[scheme]
        if not expected:
            problems.append(f"{scheme}: 정본 문서에서 색 표를 못 읽었다")
            continue
        for token, want in sorted(expected.items()):
            for label, actual in (("Color.kt", kotlin[scheme]), ("tokens.css", css[scheme])):
                got = actual.get(token)
                if got is None:
                    problems.append(f"{scheme}/{token}: {label}에 없다 (정본 {want})")
                elif got != want:
                    problems.append(f"{scheme}/{token}: {label}={got} ≠ 정본={want}")

        for label, actual in (("Color.kt", kotlin[scheme]), ("tokens.css", css[scheme])):
            for token in sorted(set(actual) - set(expected)):
                problems.append(f"{scheme}/{token}: {label}에만 있고 정본에 없다")

    type_problems, type_count = check_typography()
    problems += type_problems
    ios_problems, ios_colors, ios_slots = check_ios()
    problems += ios_problems
    problems += UNREADABLE

    if problems:
        print(f"{len(problems)}건 어긋남:", file=sys.stderr)
        for p in problems:
            print(f"  {p}", file=sys.stderr)
        print("\n정본(docs/wiki/design-tokens.md §2)을 고치고 두 사본을 함께 맞춘다.", file=sys.stderr)
        return 1

    total = len(doc["light"]) + len(doc["dark"])
    print(f"색 토큰 {total}개가 정본·Color.kt·tokens.css 세 곳에서 일치한다.")
    print(f"타이포 {type_count}개의 크기·굵기가 정본·Type.kt·tokens.css 세 곳에서 일치한다 (대사 카드 24sp 이상, Jua 400).")
    print(f"iOS PapercutTheme.swift의 팔레트 {ios_colors}색과 타이포 {ios_slots}슬롯이 정본과 일치한다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
