import XCTest
@testable import AccenturyCore

/// 억양 녹음 업로드 (KAN-253, webview-bridge.md §12). 안드로이드 `learning/IntonationUploadClientTest.kt`의 이식본(7건) +
/// 요청 경로·Bearer 확인을 그대로 따른다. 앱처럼 ``AuthClients/intonationUploadClient(session:)``를 태운다 — 계정 Bearer와
/// 401 갱신 1회·재시도 1회가 그 전송에 있으므로, 흉내 전송으로는 그 규칙을 검증한 것이 아니다.
final class IntonationUploadClientTests: XCTestCase {

    private let wav = Data((0..<32).map { UInt8($0) })
    private let quality = ClientQuality(rms: 0.1, peak: 0.8, silenceRatio: 0.1, clipped: false)
    private let acceptedBody = #"{"attemptId":"la_1","contentVersion":"in-gn-2026.10.1","cardId":"card_1","status":"PROCESSING","pollAfterMs":1500}"#

    /// 업로드 응답. 테스트마다 갈아끼운다. 인자는 실려 온 Authorization이다.
    private var uploadResponse: @Sendable (String?) -> (Int, String) = { _ in (0, "") }
    private let counter = Counter()

    private func envelope(_ status: Int, _ code: String, retryable: Bool) -> (Int, String) {
        (status, #"{"code":"\#(code)","message":"서버 문구","retryable":\#(retryable),"correlationId":"c"}"#)
    }

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        uploadResponse = { [acceptedBody] _ in (202, acceptedBody) }
        MockURLProtocol.setHandler { [unowned self] request in
            let path = request.url?.path ?? ""
            let (status, body): (Int, String)
            if path == "/v0/auth/refresh" {
                counter.bump()
                (status, body) = (200, #"{"accessToken":"jwt_new","refreshToken":"rt_new","accessTokenExpiresInSec":900}"#)
            } else if path.hasPrefix("/v0/learning/") {
                (status, body) = uploadResponse(request.value(forHTTPHeaderField: "Authorization"))
            } else {
                (status, body) = (404, "")
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
            return (response, Data(body.utf8))
        }
    }

    override func tearDown() {
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func send(key: String = "li_key-1") async -> IntonationUploadResult {
        let clients = AuthClients(
            baseURL: "https://api.test/",
            store: InMemoryTokenStore(AuthTokens("jwt_old", "rt_old")),
            session: MockURLProtocol.makeSession()
        )
        return await clients.intonationUploadClient(session: MockURLProtocol.makeSession())
            .upload(cardId: "card_1", idempotencyKey: key, wavBytes: wav, durationMs: 2_000, clientQuality: quality)
    }

    private var uploads: [MockURLProtocol.Recorded] {
        MockURLProtocol.requests().filter { $0.url?.path.hasPrefix("/v0/learning/") == true }
    }

    func test카드_경로로_계정_Bearer와_멱등_키를_싣고_202의_attemptId를_읽는다() async throws {
        let result = await send()

        XCTAssertEqual(.accepted(attemptId: "la_1"), result)
        let req = try XCTUnwrap(uploads.first)
        XCTAssertEqual(1, uploads.count)
        XCTAssertEqual("POST", req.method)
        XCTAssertEqual("/v0/learning/intonation-cards/card_1/recordings", req.url?.path)
        XCTAssertEqual("Bearer jwt_old", req.header("Authorization"))
        XCTAssertEqual("li_key-1", req.header("Idempotency-Key"))
        // multipart는 레벨테스트와 같다 — audio(wav) + meta(json)
        let boundary = try XCTUnwrap(MultipartParser.boundary(fromContentType: try XCTUnwrap(req.header("Content-Type"))))
        let parts = try MultipartParser.parse(body: req.body, boundary: boundary)
        XCTAssertEqual(2, parts.count)
        let audio = try XCTUnwrap(parts.first { $0.name == "audio" })
        XCTAssertEqual("recording.wav", audio.filename)
        XCTAssertEqual("audio/wav", audio.contentType)
        XCTAssertEqual(wav, audio.body)
        let meta = try XCTUnwrap(parts.first { $0.name == "meta" })
        XCTAssertEqual("application/json", meta.contentType)
        XCTAssertTrue(String(decoding: meta.body, as: UTF8.self).contains(#""durationMs":2000"#))
    }

    func test401이면_갱신_1회_뒤_같은_키_새_토큰으로_재시도_1회() async {
        uploadResponse = { [acceptedBody, envelope] auth in
            auth == "Bearer jwt_new" ? (202, acceptedBody) : envelope(401, "AUTH_TOKEN_INVALID", false)
        }

        let result = await send()

        XCTAssertEqual(.accepted(attemptId: "la_1"), result)
        XCTAssertEqual(1, counter.value)
        XCTAssertEqual(["li_key-1", "li_key-1"], uploads.map { $0.header("Idempotency-Key") })
        XCTAssertEqual("Bearer jwt_new", uploads.last?.header("Authorization"))
        // 같은 요청 재시도 — 본문도 바이트 그대로다.
        XCTAssertEqual(uploads.first?.body, uploads.last?.body)
    }

    func test재시도도_401이면_다시_갱신하지_않고_401_거절로_끝난다() async {
        uploadResponse = { [envelope] _ in envelope(401, "AUTH_TOKEN_INVALID", false) }

        let result = await send()

        XCTAssertEqual(1, counter.value)
        XCTAssertEqual(2, uploads.count)
        XCTAssertEqual(.rejected(status: 401, code: "AUTH_TOKEN_INVALID", message: "서버 문구", retryable: false), result)
    }

    func test봉투의_retryable을_그대로_옮긴다() async {
        uploadResponse = { [envelope] _ in envelope(415, "AUDIO_FORMAT_UNSUPPORTED", false) }
        let unsupported = await send()
        XCTAssertEqual(.rejected(status: 415, code: "AUDIO_FORMAT_UNSUPPORTED", message: "서버 문구", retryable: false), unsupported)

        uploadResponse = { [envelope] _ in envelope(503, "ANALYSIS_UNAVAILABLE", true) }
        let unavailable = await send()
        XCTAssertEqual(.rejected(status: 503, code: "ANALYSIS_UNAVAILABLE", message: "서버 문구", retryable: true), unavailable)
    }

    func test봉투가_없으면_상태_코드로_재시도_여부를_정한다() async {
        uploadResponse = { _ in (502, "<html>") }
        let result = await send()
        XCTAssertEqual(.rejected(status: 502, code: nil, message: nil, retryable: true), result)
    }

    func test2xx인데_attemptId가_없으면_같은_키로_재시도할_수_있는_거절이다() async {
        uploadResponse = { _ in (202, "{}") }
        let result = await send()
        XCTAssertEqual(.rejected(status: 202, code: nil, message: nil, retryable: true), result)
    }

    func test응답이_없으면_전송_실패다() async {
        MockURLProtocol.fail(with: URLError(.cannotConnectToHost))
        let result = await send()
        XCTAssertEqual(.transportError(.serverUnreachable), result)
    }
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    var value: Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }

    func bump() {
        lock.lock()
        count += 1
        lock.unlock()
    }
}
