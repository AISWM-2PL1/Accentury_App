#!/usr/bin/env python3
"""디자인 토큰 대비 검증 (KAN-148, Papercut 팔레트 KAN-161).

`docs/wiki/design-tokens.md` §6 표를 생성하고, 문서가 낡았는지 검사한다.

    python3 tools/check_contrast.py            # 검사 - 미달이 있거나 문서가 낡았으면 종료 코드 1
    python3 tools/check_contrast.py --write     # §6 표를 다시 쓴다

기준: 텍스트 4.5:1(1.4.3), 그래픽 오브젝트 3:1(1.4.11).

색 값은 정본 §2 표에서 읽는다 (KAN-361). 아래 조합 목록은 토큰 이름만 들고, 표시 이름의 백틱 안 두 토큰이
곧 전경과 배경이다 - 이름과 값이 따로 놀 수 없다. 예전에는 팔레트를 이 파일 상수로 따로 들고 있어서, 정본과
두 사본(check_tokens.py가 대조)을 함께 바꾸면 대비 회귀를 이 검사가 보지 못했다.

표는 손으로 고치지 않는다 - 문서의 `check_contrast:begin`/`end` 사이를 이 스크립트가
통째로 갈아 끼운다. 손으로 고치면 다음 실행에서 "문서가 낡았다"로 걸린다.
"""
import pathlib
import re
import sys

# 같은 폴더의 check_tokens.py가 정본 §2 표를 읽는다 - 파서를 둘로 두지 않는다
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_tokens import UNREADABLE, parse_doc  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOC = ROOT / "docs/wiki/design-tokens.md"
BEGIN = "<!-- check_contrast:begin -->"
END = "<!-- check_contrast:end -->"

# WCAG 2.1 AA - 일반 텍스트 1.4.3, 그래픽 오브젝트 1.4.11
MIN_TEXT_RATIO = 4.5
MIN_GRAPHIC_RATIO = 3.0

# 기준 미달을 감수한 항목 (정본 §7).
# KAN-148에서 여덟 자리를 감수했는데 Papercut 팔레트(KAN-161)가 전부 해소했다 -
# 잉크와 크림만 남으니 미달이 나올 조합 자체가 사라졌다. 비워 둔 채로 유지한다:
# 여기에 이름을 하나 넣는 순간 그 화면은 검사에서 빠지는 것과 같다.
WAIVED: set[str] = set()

TOKEN = re.compile(r"`([a-z0-9-]+)`")


def resolve(name: str, palette) -> tuple[str, str]:
    """표시 이름의 앞 두 토큰을 정본 §2 값으로 바꾼다. `(다크)`가 붙으면 다크 표, 아니면 라이트 표다."""
    scheme = "dark" if "(다크)" in name else "light"
    tokens = TOKEN.findall(name)[:2]
    values = []
    for token in tokens:
        value = palette[scheme].get(token)
        if value is None:
            raise KeyError(f"{name}: 정본 §2 {scheme} 표에 `{token}`이 없다")
        if not value.endswith("ff"):
            raise ValueError(f"{name}: `{token}`={value}가 반투명이다 - 합성 배경 없이 대비를 잴 수 없다")
        values.append(value[:7])
    return values[0], values[1]


def _luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    channels = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

    def linear(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (linear(c) for c in channels)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg: str, bg: str) -> float:
    lighter, darker = sorted((_luminance(fg), _luminance(bg)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


# 표시 이름의 백틱 안 두 토큰이 (전경, 배경)이다. `paper`(카드, 입력 칸, 선택지, 시트 면, KAN-354)
# 위 조합은 KAN-361 리뷰에서 더했다 - 정본 갱신 절차 4번(색을 더하면 조합도 더한다).
# 다크 행은 라이트와 값이 같다 (KAN-161: 다크 분기를 라이트로 고정). 그래도 남겨 둔다 -
# 정본 §2의 다크 표가 살아 있는 한 그 표의 조합도 검사한 적이 있어야 한다.
PAIRS = [
    "`foreground` / `background` (라이트)",
    "`foreground` / `card` (라이트)",
    "`muted-foreground` / `background` (라이트)",
    "`muted-foreground` / `card` (라이트)",
    "`primary-foreground` / `primary` (라이트)",
    "`secondary-foreground` / `secondary` (라이트)",
    "`accent-foreground` / `accent` (라이트)",
    "`destructive-foreground` / `destructive`",
    "`destructive-on-surface` / `destructive-surface` (라이트)",
    "`success-foreground` / `success`",
    "`success-on-surface` / `success-surface` (라이트)",
    "`prompt-card-foreground` / `prompt-card-start`",
    "`prompt-card-muted` / `prompt-card-start`",
    "`prompt-card-foreground` / `prompt-card-end`",
    "`prompt-card-muted` / `prompt-card-end`",
    "`point-foreground` / `point` (라이트)",
    "`point` / `background` (라이트)",
    "`foreground` / `background` (다크)",
    "`foreground` / `card` (다크)",
    "`muted-foreground` / `background` (다크)",
    "`muted-foreground` / `card` (다크)",
    "`primary-foreground` / `primary` (다크)",
    "`secondary-foreground` / `secondary` (다크)",
    "`accent-foreground` / `accent` (다크)",
    "`success-on-surface` / `success-surface` (다크)",
    "`destructive-on-surface` / `destructive-surface` (다크)",
    "`prompt-card-muted` / `prompt-card-start` (다크)",
    "`prompt-card-muted` / `prompt-card-end` (다크)",
    "`point-foreground` / `point` (다크)",
    "`point` / `background` (다크)",
    "`foreground` / `paper` (라이트)",
    "`muted-foreground` / `paper` (라이트)",
    "`point` / `paper` (라이트)",
    "`foreground` / `paper` (다크)",
    "`muted-foreground` / `paper` (다크)",
    "`point` / `paper` (다크)",
]

# F0 곡선과 레인 테두리는 텍스트가 아니라 3:1이 기준이다 (WCAG 1.4.11).
# 반투명 합성값을 쓰던 자리가 없어졌다. 반투명 토큰은 누름 덧칠 `press-dim`(검정 5%, KAN-367) 하나뿐이고 아래 조합에는 없다.
# resolve()는 반투명 토큰이 조합에 들어오면 예외를 던지므로 덧칠 위 대비는 이 스크립트로 잴 수 없다 - 정본 §7 결정 D에 손으로 적었다.
GRAPHIC_PAIRS = [
    # 곡선은 레인 안쪽 면(curve-lane-surface) 위에 그려진다 - 카드가 아니다
    "`guide-curve` / `curve-lane-surface` (라이트)",
    "`user-curve` / `curve-lane-surface` (라이트)",
    "`guide-curve` / `curve-lane-surface` (다크)",
    "`user-curve` / `curve-lane-surface` (다크)",
    # 결과 도넛의 내 점수 호. 트랙(잉크 파선)과 배경 둘 다 위에 서므로 낮은 쪽을 본다
    "`point`(점수 호) / `background`",
    "`control-border` / `background` (라이트)",
    "`control-border` / `card` (라이트)",
    "`control-border` / `background` (다크)",
    "`control-border` / `card` (다크)",
    # paper 면 위 경계 - 선택지와 입력 칸 테두리 (KAN-361 리뷰)
    "`control-border` / `paper` (라이트)",
    "`muted-foreground` / `paper` 선택지 테두리 (라이트)",
    "`control-border` / `paper` (다크)",
]

# 상태를 나르지 않는 장식 면. 기준을 재는 대상이 아니라, 왜 기준 대상이 아닌지를
# 문서에 남기려고 값만 재 둔다 (정본 §7).
DECORATIVE = [
    "`muted` / `background`",
]


def _table(pairs, minimum, out, palette):
    """표를 out에 찍고 (미달 항목, 감수 항목)을 돌려준다."""
    failures = []
    waived = []
    out.append("| 조합 | 비율 | |")
    out.append("|---|---|---|")
    for name in pairs:
        fg, bg = resolve(name, palette)
        r = ratio(fg, bg)
        if r >= minimum:
            note = ""
        elif name in WAIVED:
            note = f"기준 {minimum} 미달, 감수 (§7)"
            waived.append((name, fg, bg, r, minimum))
        else:
            note = f"**기준 {minimum} 미달**"
            failures.append((name, fg, bg, r, minimum))
        out.append(f"| {name} | {r:.2f} | {note} |")
    return failures, waived


def render():
    """§6 블록 본문을 만든다. 반환: (본문, 미달 항목, 감수 항목)"""
    palette = parse_doc()
    out = []
    failures, waived = _table(PAIRS, MIN_TEXT_RATIO, out, palette)

    total = len(PAIRS) + len(GRAPHIC_PAIRS)
    passed = total - len(waived) - len(failures)
    if waived:
        lead = f"{passed}건이 기준을 넘고 {len(waived)}건은 감수한다 (§7)."
    else:
        lead = f"{total}건 전부 기준을 넘는다. 감수한 자리는 없다."
    head = [
        "WCAG 2.1 AA 일반 텍스트 기준 4.5:1. `python3 tools/check_contrast.py --write`가 쓴 표이고,",
        lead,
        "",
    ]

    out += ["", "### 그래픽 오브젝트 (3:1)", ""]
    out += [
        "F0 곡선·컨트롤 경계는 텍스트가 아니라 WCAG 2.1 **1.4.11 비텍스트 대비 3:1**이 기준이다.",
        "",
    ]
    more_failures, more_waived = _table(GRAPHIC_PAIRS, MIN_GRAPHIC_RATIO, out, palette)

    out += ["", "### 기준 대상이 아닌 장식 면", ""]
    out += [
        "`muted`는 진척도의 남은 구간처럼 \"없는 것\"을 그리는 면이다. 여기에 상태를 실으면",
        "아래 비율 그대로 안 보이게 되므로, 상태는 잉크로만 알린다 (정본 §7).",
        "",
    ]
    _table(DECORATIVE, 0.0, out, palette)

    return "\n".join(head + out), failures + more_failures, waived + more_waived


def main(argv) -> int:
    try:
        block, failures, waived = render()
        if UNREADABLE:
            raise ValueError("; ".join(UNREADABLE))
    except (KeyError, ValueError) as e:
        print(f"정본 §2에서 색을 읽지 못했다: {e.args[0]}", file=sys.stderr)
        return 1
    write = "--write" in argv[1:]

    text = DOC.read_text(encoding="utf-8")
    head, rest = text.split(BEGIN, 1)
    _stale, tail = rest.split(END, 1)
    fresh = f"{head}{BEGIN}\n{block}\n{END}{tail}"

    if write:
        DOC.write_text(fresh, encoding="utf-8")
        print(f"{DOC.relative_to(ROOT)} §6 표를 다시 썼다.")

    if failures:
        print(f"{len(failures)}건 미달:", file=sys.stderr)
        for name, fg, bg, r, minimum in failures:
            print(f"  {r:.2f} < {minimum}  {name}  ({fg} on {bg})", file=sys.stderr)
        return 1

    if not write and fresh != text:
        print("문서 §6 표가 낡았다 - `python3 tools/check_contrast.py --write`로 다시 쓴다.",
              file=sys.stderr)
        return 1

    total = len(PAIRS) + len(GRAPHIC_PAIRS)
    print(f"{total - len(waived)}건 통과, {len(waived)}건 감수 (총 {total}건).")
    if waived:
        print("감수 항목 (정본 §7):")
        for name, fg, bg, r, minimum in waived:
            print(f"  {r:.2f} < {minimum}  {name}  ({fg} on {bg})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
