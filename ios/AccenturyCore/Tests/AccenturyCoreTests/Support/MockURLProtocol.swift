import Foundation

/// 서버 없이 HTTP 계약을 검증하기 위한 가짜 전송 계층.
/// 안드로이드 테스트의 `MockWebServer` 자리이고, 다른 점은 소켓조차 열지 않는다는 것뿐이다.
///
/// `URLSessionConfiguration.ephemeral`에 이 프로토콜을 심으면 그 세션의 모든 요청이 여기로 온다.
/// 진짜 ``URLSessionUploadClient``·``URLSessionSessionClient``를 그대로 겨눠 경로·헤더·본문을
/// 들여다볼 수 있어, 검증 대상이 "테스트용 우회 경로"가 아니라 실제로 나가는 요청 그것이다.
final class MockURLProtocol: URLProtocol {

    /// 실제로 나간 요청 한 건. `URLSession`은 `httpBody`를 스트림으로 바꿔 넘기므로
    /// 본문은 여기서 미리 다 읽어 둔다 — 테스트가 `recorded.body`를 그냥 쓸 수 있게.
    struct Recorded {
        let url: URL?
        let method: String?
        let headers: [String: String]
        let body: Data

        func header(_ name: String) -> String? {
            headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
        }
    }

    typealias Handler = (URLRequest) throws -> (HTTPURLResponse, Data)

    private static let lock = NSLock()
    private static var handler: Handler?
    private static var recorded: [Recorded] = []
    private static var hangs = false

    /// 이 세션의 요청은 전부 가짜 서버로 간다. 테스트마다 새로 만들어 쓴다.
    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    static func reset() {
        lock.lock()
        handler = nil
        recorded = []
        hangs = false
        lock.unlock()
    }

    /// 응답 한 건을 예약한다. `MockWebServer.enqueue(MockResponse()...)` 자리.
    static func respond(status: Int, body: String, headers: [String: String] = [:]) {
        respond(status: status, body: Data(body.utf8), headers: headers)
    }

    static func respond(status: Int, body: Data, headers: [String: String] = [:]) {
        setHandler { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            return (response, body)
        }
    }

    /// 응답 여러 건을 차례로 예약한다. `MockWebServer.enqueue`를 여러 번 부르는 자리 (KAN-224).
    /// 예약이 떨어진 뒤의 요청은 전송 실패다 — 테스트가 예상보다 많이 부른 것을 조용히 넘기지 않는다.
    static func respondInOrder(_ responses: [(status: Int, body: String)]) {
        let queue = ResponseQueue(responses)
        setHandler { request in
            guard let next = queue.pop() else { throw URLError(.cannotConnectToHost) }
            let response = HTTPURLResponse(url: request.url!, statusCode: next.status, httpVersion: "HTTP/1.1", headerFields: nil)!
            return (response, Data(next.body.utf8))
        }
    }

    /// 나간 요청 전부, 나간 순서대로. `server.takeRequest()`를 여러 번 부르는 자리.
    static func requests() -> [Recorded] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    /// 응답 대신 전송 실패를 낸다. `server.shutdown()` 뒤에 요청을 던지는 자리다.
    static func fail(with error: Error) {
        setHandler { _ in throw error }
    }

    /// 요청을 받고 끝내 답하지 않는다 — 서버가 매달린 경우 (KAN-247, 로그아웃 시간 상한).
    static func hang() {
        lock.lock()
        hangs = true
        lock.unlock()
    }

    static func setHandler(_ handler: @escaping Handler) {
        lock.lock()
        self.handler = handler
        lock.unlock()
    }

    /// 마지막으로 나간 요청. `server.takeRequest()` 자리.
    static func lastRequest() -> Recorded? {
        lock.lock()
        defer { lock.unlock() }
        return recorded.last
    }

    static var requestCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return recorded.count
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let request = self.request
        Self.lock.lock()
        Self.recorded.append(
            Recorded(
                url: request.url,
                method: request.httpMethod,
                headers: request.allHTTPHeaderFields ?? [:],
                body: Self.bodyOf(request)
            )
        )
        let handler = Self.handler
        let hangs = Self.hangs
        Self.lock.unlock()

        if hangs { return }

        guard let handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    /// `URLSession`은 `httpBody`를 `httpBodyStream`으로 바꿔 프로토콜에 넘긴다.
    /// 둘 다 보는 이유가 그것이다 — 스트림 쪽만 오는 경우가 실제 경로다.
    private static func bodyOf(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 4096
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

/// ``MockURLProtocol/respondInOrder(_:)``의 줄. URLProtocol 스레드에서 꺼내므로 잠근다.
private final class ResponseQueue: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [(status: Int, body: String)]

    init(_ items: [(status: Int, body: String)]) {
        self.items = items
    }

    func pop() -> (status: Int, body: String)? {
        lock.lock()
        defer { lock.unlock() }
        return items.isEmpty ? nil : items.removeFirst()
    }
}
