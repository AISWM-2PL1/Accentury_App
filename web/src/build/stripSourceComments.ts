/*
 * 배포되는 index.html에서 주석을 걷어낸다 (KAN-275 리뷰). index.html은 앱 소스이자 공개 문서라,
 * 소스의 "왜·근거·티켓" 주석(내부 파일 경로·행 번호 포함)이 그대로 나가면 누구나 페이지 소스 보기로
 * 읽는다. 소스 주석은 남기고 산출물에서만 지운다 — HTML 주석과 <style> 안의 CSS 주석 둘 다.
 * web/public/의 정적 페이지는 Vite가 손대지 않고 복사하므로 대상이 아니다(그쪽은 주석 한 줄 규칙,
 * docs/wiki/ads-web-adsense.md §11.1).
 */
export function stripSourceComments(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_, open, css, close) => open + css.replace(/\/\*[\s\S]*?\*\/\s*/g, '') + close)
}
