import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * 크롤러가 읽는 정적 파일의 계약을 지킨다 (KAN-275).
 *
 * AdSense가 「가치가 별로 없는 콘텐츠」로 두 번 미승인했다. accentury.app은 SPA라 크롤러가 받는
 * 첫 HTML이 빈 껍데기였고 robots.txt·sitemap.xml도 없었다. 그래서 `web/public/`에 정적 글과
 * 이 두 파일을 두는데, 둘 다 **틀려도 화면에는 아무 일도 없는** 함정 위에 서 있다.
 *
 * - **확장자 함정**: CloudFront SPA 재작성 Function(KAN-126)은 마지막 경로 조각에 점이 없으면
 *   `/index.html`로 돌린다. sitemap에 `/about`이라고 적으면 크롤러는 그 주소에서 빈 껍데기를
 *   받는다 — 글이 버킷에 있어도 영영 안 읽힌다. 그래서 `/` 말고는 확장자가 있어야 한다.
 * - **캐시 함정**: `web-deploy.yml`은 dist/를 1년 immutable로 올린다. 이 파일들은 거기서 빠져
 *   no-cache로 따로 가는데, 그 규칙이 `*.html`·robots.txt·sitemap.xml 이름에 걸려 있다.
 * - **링크 함정**: sitemap이 가리키는 글이 public/에 없으면 404를 심사에 내미는 꼴이다.
 */

/* vitest의 root가 web/이라 거기서 잰다 (webAppMeta.test.ts와 같은 이유) */
const PUBLIC_DIR = join(process.cwd(), 'public')

/** 배포 산출물이 환경을 모르므로 prod 주소를 박는다 — og:url과 같은 원칙이다 */
const ORIGIN = 'https://accentury.app'

/* privacy.html은 서버 레포 infra/privacy/가 같은 버킷 루트에 따로 올린다(KAN-133). 이 레포에
   파일이 없는 것이 정상이라 존재 검사에서 뺀다. */
const PUBLISHED_ELSEWHERE = new Set(['/', '/privacy.html'])

const sitemap = new DOMParser().parseFromString(readFileSync(join(PUBLIC_DIR, 'sitemap.xml'), 'utf8'), 'application/xml')
const locs = [...sitemap.getElementsByTagName('loc')].map((loc) => loc.textContent?.trim() ?? '')

/** public/ 아래 .html 전부 (하위 디렉터리 포함). 지금은 0개다 */
function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return htmlFiles(path)
    return name.endsWith('.html') ? [path] : []
  })
}

describe('크롤러용 정적 파일', () => {
  it('robots.txt가 sitemap을 가리킨다', () => {
    const robots = readFileSync(join(PUBLIC_DIR, 'robots.txt'), 'utf8')
    const sitemapLines = robots.split('\n').filter((line) => line.startsWith('Sitemap:'))
    expect(sitemapLines.map((line) => line.slice('Sitemap:'.length).trim())).toEqual([`${ORIGIN}/sitemap.xml`])
  })

  it('sitemap.xml이 파싱되고 url이 하나 이상 있다', () => {
    // DOMParser는 깨진 XML에 예외 대신 parsererror 문서를 돌려준다
    expect(sitemap.getElementsByTagName('parsererror').length, 'sitemap.xml이 XML로 읽히지 않는다').toBe(0)
    expect(sitemap.documentElement.tagName).toBe('urlset')
    expect(locs.length).toBeGreaterThan(0)
  })

  it('sitemap 주소가 prod 절대 주소이고 / 말고는 확장자가 있다', () => {
    for (const loc of locs) {
      // 정규식을 쓰지 않는다 — 오리진의 `.`이 아무 글자나 먹는다 (webAppMeta.test.ts와 같다)
      expect(loc.startsWith(`${ORIGIN}/`), `${loc} 가 ${ORIGIN}으로 시작하지 않는다`).toBe(true)
      const path = loc.slice(ORIGIN.length)
      if (path === '/') continue
      const last = path.split('/').pop() ?? ''
      expect(last.includes('.'), `${loc} 는 확장자가 없어 SPA 재작성 Function이 index.html로 돌린다`).toBe(true)
    }
  })

  it('sitemap이 가리키는 글이 public/에 있다', () => {
    for (const loc of locs) {
      const path = loc.slice(ORIGIN.length)
      if (PUBLISHED_ELSEWHERE.has(path)) continue
      const file = join(PUBLIC_DIR, path.replace(/^\//, ''))
      expect(existsSync(file) && statSync(file).isFile(), `${loc} 에 해당하는 파일이 public/에 없다`).toBe(true)
    }
  })

  it('public/의 글이 외부 스크립트를 싣지 않는다', () => {
    /* 글은 앱 번들 없이 홀로 서는 문서다. 해시 자산을 가리키면 배포 순서(자산 → index.html)의
       원자성 밖에서 옛 번들 이름이 남고, 크롤러가 볼 것은 스크립트가 아니라 글이다. */
    for (const file of htmlFiles(PUBLIC_DIR)) {
      expect(readFileSync(file, 'utf8'), `${file} 에 <script src=가 있다`).not.toMatch(/<script[^>]*\ssrc=/i)
    }
  })
})
