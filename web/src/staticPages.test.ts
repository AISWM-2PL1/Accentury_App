import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isStandaloneWeb, type AccenturyBridge } from './bridge/bridge'
import { stripSourceComments } from './build/stripSourceComments'

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

/** public/ 아래 .html 전부 (하위 디렉터리 포함) */
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

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const indexDoc = parse(readFileSync(join(process.cwd(), 'index.html'), 'utf8'))

/** 페이지 사이를 잇는 링크 — 소개·사투리 이야기(3단계)·방침·문의 */
const SITE_LINKS = ['/about.html', '/guide/index.html', '/privacy.html', '/contact.html']

describe('첫 화면의 정적 footer (KAN-275 2단계)', () => {
  it('index.html body에 소개·사투리 이야기·방침·문의 링크가 있다', () => {
    // 크롤러가 JS 없이 따라갈 수 있는 링크가 0개였다 — 이게 미승인 사유의 절반이다
    const hrefs = [...indexDoc.body.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
    for (const link of SITE_LINKS) expect(hrefs, `index.html에 ${link} 링크가 없다`).toContain(link)
  })

  it('footer가 noscript 밖에 있다', () => {
    /* noscript 안이면 JS를 켠 브라우저 사용자에게는 안 보이고 크롤러에게만 보이는 링크가 된다.
       그게 cloaking으로 읽힐 수 있고, JS를 돌리는 크롤러는 아예 못 본다. */
    const footer = indexDoc.getElementById('site-footer')
    expect(footer, '#site-footer가 없다').not.toBeNull()
    expect(footer?.closest('noscript')).toBeNull()
  })

  it('앱 WebView에서는 footer를 숨기는 규칙이 head에 있다', () => {
    /* 표식은 main.tsx의 markRuntime이 심는다(판정 테스트는 ui/runtime.test.ts). 여기서는 그 표식과
       footer를 잇는 선택자가 끊기지 않았는지만 본다 — 이름을 바꾸면 앱 하단에 웹 footer가 뜬다. */
    const css = [...indexDoc.head.querySelectorAll('style')].map((style) => style.textContent).join('\n')
    expect(css).toMatch(/:root\[data-runtime='app'\]\s+#site-footer\s*\{\s*display:\s*none/)
  })

  /* 리뷰 P1: markRuntime은 모듈(deferred)에서 돌아 첫 페인트보다 늦다. head 인라인 스크립트가 같은
     판정을 먼저 하는데, 사본이라 정본(isStandaloneWeb)과 어긋나면 앱에 footer가 뜨거나 웹에서 사라진다. */
  const inline = indexDoc.head.querySelector('script')

  it('런타임 인라인 스크립트가 style·footer보다 앞에 있고 동기로 돈다', () => {
    expect(inline, 'head에 인라인 스크립트가 없다').not.toBeNull()
    expect(inline?.hasAttribute('src')).toBe(false)
    expect(inline?.getAttribute('type')).toBeNull()
    const follows = (el: Element | null) =>
      !!el && !!(inline!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(indexDoc.head.querySelector('style'))).toBe(true)
    expect(follows(indexDoc.getElementById('site-footer'))).toBe(true)
  })

  it.each([
    [undefined, '', 'browser'],
    [{}, '', 'app'],
    [undefined, '?bridge=1', 'app'],
    [{}, '?bridge=1', 'app'],
  ])('인라인 판정이 isStandaloneWeb과 같다 (브리지 %o, 쿼리 %j → %s)', (bridge, search, expected) => {
    const root = document.createElement('html')
    new Function('window', 'location', 'document', inline!.textContent!)(
      { AccenturyBridge: bridge },
      { search },
      { documentElement: root },
    )
    expect(root.dataset.runtime).toBe(expected)
    expect(root.dataset.runtime).toBe(isStandaloneWeb(search, bridge as AccenturyBridge | undefined) ? 'browser' : 'app')
  })
})

/** 홀로 서는 페이지와 크롤러가 읽을 본문 글자 수 하한. guide/ 글은 3단계, 목차만 200자 */
const PAGES: Record<string, number> = {
  'about.html': 400,
  'contact.html': 200,
  'guide/index.html': 200,
  'guide/how-the-test-works.html': 400,
  'guide/five-tiers.html': 400,
  'guide/pitch-curve.html': 400,
  'guide/choosing-pitch-model.html': 400,
  'guide/recording-environment.html': 400,
  'guide/voice-data.html': 400,
  'guide/faq.html': 400,
  'guide/team-story.html': 400,
}

describe('소개·문의·사투리 이야기 페이지 (KAN-275 2·3단계)', () => {
  for (const [name, minText] of Object.entries(PAGES)) {
    const doc = parse(readFileSync(join(PUBLIC_DIR, name), 'utf8'))

    it(`${name}에 title·description·h1이 있고 본문이 ${minText}자 이상이다`, () => {
      expect(doc.title.trim()).not.toBe('')
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '').not.toBe('')
      expect(doc.querySelector('h1')?.textContent?.trim() ?? '').not.toBe('')
      // 공백을 빼고 센다 — 들여쓰기가 글자 수를 부풀리지 않게
      const text = (doc.querySelector('main')?.textContent ?? '').replace(/\s+/g, '')
      expect(text.length, `${name} 본문이 ${text.length}자다`).toBeGreaterThanOrEqual(minText)
    })

    it(`${name}의 하단 nav가 사이트 링크를 모두 싣는다`, () => {
      const hrefs = [...doc.querySelectorAll('nav a[href]')].map((a) => a.getAttribute('href'))
      for (const link of ['/', ...SITE_LINKS]) expect(hrefs, `${name} nav에 ${link}가 없다`).toContain(link)
    })

    it(`${name}의 내부 링크가 / 또는 .html이다`, () => {
      const internal = [...doc.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => href.startsWith('/'))
      expect(internal.length).toBeGreaterThan(0)
      for (const href of internal) {
        expect(href === '/' || href.endsWith('.html'), `${href} 는 SPA 재작성에 걸려 빈 껍데기로 간다`).toBe(true)
      }
    })
  }

  it('contact.html에 문의 메일 링크가 있다', () => {
    const doc = parse(readFileSync(join(PUBLIC_DIR, 'contact.html'), 'utf8'))
    // privacy.html 13항과 같은 주소다 (팀 결정 2026-10-07)
    expect(doc.querySelector('a[href="mailto:team2pl1@gmail.com"]')).not.toBeNull()
  })

  it('글의 내부 링크가 실제 파일을 가리킨다', () => {
    // 확장자 검사만으로는 오타(/guide/faqs.html)를 못 잡는다 — 404를 심사에 내미는 꼴이다
    for (const name of Object.keys(PAGES)) {
      const doc = parse(readFileSync(join(PUBLIC_DIR, name), 'utf8'))
      const internal = [...doc.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => href.startsWith('/') && !PUBLISHED_ELSEWHERE.has(href))
      for (const href of internal) {
        const file = join(PUBLIC_DIR, href.slice(1))
        expect(existsSync(file) && statSync(file).isFile(), `${name}의 ${href} 에 해당하는 파일이 public/에 없다`).toBe(true)
      }
    }
  })

  it('public/의 .html이 전부 sitemap에 있다', () => {
    // "sitemap이 가리키는 글이 public/에 있다"의 역방향 — 글을 올리고 sitemap을 잊으면 크롤러가 늦게 찾는다
    for (const file of htmlFiles(PUBLIC_DIR)) {
      const loc = `${ORIGIN}/${relative(PUBLIC_DIR, file).split(sep).join('/')}`
      expect(locs, `${loc} 가 sitemap.xml에 없다`).toContain(loc)
    }
  })

  it('PAGES가 public/의 .html을 전부 갖는다', () => {
    // 새 글을 올리고 PAGES를 잊으면 본문 하한·내부 링크 검사에서 조용히 빠진다
    const rel = htmlFiles(PUBLIC_DIR).map((file) => relative(PUBLIC_DIR, file).split(sep).join('/'))
    expect(Object.keys(PAGES).sort()).toEqual(rel.sort())
  })

  it('하위 디렉터리의 html 아닌 파일을 어떤 글이 가리킨다', () => {
    /* webAppMeta.test.ts의 고아 검사는 public/ 루트만 보고 guide/ 같은 디렉터리는 통째로 뺀다. 여기서
       그 안의 그림 등이 public/의 글 어디서도 src·href로 안 불리면 실패시킨다(no-cache로 계속 올라간다). */
    const referenced = new Set(
      htmlFiles(PUBLIC_DIR).flatMap((file) => {
        const base = `${ORIGIN}/${relative(PUBLIC_DIR, file).split(sep).join('/')}`
        return [...parse(readFileSync(file, 'utf8')).querySelectorAll('[src], [href]')].map(
          (el) => new URL(el.getAttribute('src') ?? el.getAttribute('href')!, base).pathname,
        )
      }),
    )
    const nested = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? nested(join(dir, name)) : [join(dir, name)]))
    const orphans = readdirSync(PUBLIC_DIR)
      .filter((name) => statSync(join(PUBLIC_DIR, name)).isDirectory())
      .flatMap((name) => nested(join(PUBLIC_DIR, name)))
      .filter((file) => !file.endsWith('.html'))
      .map((file) => `/${relative(PUBLIC_DIR, file).split(sep).join('/')}`)
      .filter((path) => !referenced.has(path))
    expect(orphans, '어느 글도 가리키지 않는 파일').toEqual([])
  })
})

describe('배포되는 index.html의 주석 제거 (KAN-275 리뷰)', () => {
  /* 소스 주석에는 내부 파일 경로·행 번호가 있다. 산출물에서는 지우되, 주석 밖의 것(인라인 스크립트,
     footer, 앱 숨김 규칙)은 하나도 잃으면 안 된다 — 이 셋이 빠지면 크롤러 링크나 앱 화면이 깨진다. */
  const source = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
  const built = stripSourceComments(source)

  it('HTML 주석과 style 안의 CSS 주석이 남지 않는다', () => {
    expect(source).toContain('<!--')
    expect(built).not.toContain('<!--')
    const css = [...built.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
    expect(css).not.toContain('/*')
  })

  it('주석 밖의 인라인 스크립트·footer·앱 숨김 규칙은 그대로다', () => {
    const doc = parse(built)
    expect(doc.head.querySelector('script:not([src])')?.textContent).toContain('dataset.runtime')
    expect(doc.getElementById('site-footer')?.querySelectorAll('a[href]').length).toBe(SITE_LINKS.length)
    expect(built).toMatch(/:root\[data-runtime='app'\]\s+#site-footer\s*\{\s*display:\s*none/)
  })
})
