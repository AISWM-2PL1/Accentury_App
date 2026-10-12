import Foundation

// 서버 계약(명세 §3.19, 서버 KAN-267 IntonationScoringController)에 묶인 값들.
private let pathIntonationCards = "v0/learning/intonation-cards"
private let pathRecordings = "recordings"
private let headerIdempotencyKey = "Idempotency-Key"
private let headerCorrelationId = "X-Correlation-Id"
private let headerContentType = "Content-Type"

/// 억양 녹음 업로드 한 번의 결말 (KAN-253, webview-bridge.md §12). 안드로이드 `learning/IntonationUploadClient.kt`의 이식본이다.
public enum IntonationUploadResult: Equatable, Sendable {

    /// 202. 웹에는 `attemptId`만 넘긴다 — 폴링은 웹(KAN-254)이 한다.
    case accepted(attemptId: String)

    /// 서버가 답했지만 접수가 아니다. 401은 ``AuthorizedSession``의 갱신 1회·재시도 1회를 거친 뒤에도 401인 경우다.
    case rejected(status: Int, code: String?, message: String?, retryable: Bool)

    /// 응답 없는 전송 실패. 늘 재시도 가능하다.
    case transportError(TransportFailure)
}

/// `POST /v0/learning/intonation-cards/{cardId}/recordings` (KAN-253).
///
/// `send`는 ``AuthClients/intonationUploadClient(session:)``가 만든 ``AuthorizedSession``이다 — 계정 Access Bearer와
/// 401 → TokenRefresher 갱신 1회 → 같은 요청 재시도 1회가 이미 거기 있다(§11과 같은 규칙). 레벨테스트 업로드처럼 세션
/// 토큰을 손으로 싣지 않는다 — 학습 API는 세션 토큰을 받으면 401이다. 재시도는 같은 `URLRequest`(같은 키·같은 본문)를
/// 다시 보낸다.
public struct IntonationUploadClient: Sendable {

    private let baseURL: URL
    private let send: HTTPSend
    private let makeBoundary: @Sendable () -> String

    public init(
        baseURL: String,
        send: @escaping HTTPSend,
        makeBoundary: @escaping @Sendable () -> String = { "Boundary-\(UUID().uuidString)" }
    ) {
        guard let url = URL(string: baseURL) else {
            preconditionFailure("업로드 baseUrl을 URL로 읽지 못했다: \(baseURL)")
        }
        self.baseURL = url
        self.send = send
        self.makeBoundary = makeBoundary
    }

    public func upload(
        cardId: String,
        idempotencyKey: String,
        wavBytes: Data,
        durationMs: Int64,
        clientQuality: ClientQuality
    ) async -> IntonationUploadResult {
        do {
            let boundary = makeBoundary()
            var request = URLRequest(
                url: baseURL
                    .appendingPathComponent(pathIntonationCards)
                    .appendingPathComponent(cardId)
                    .appendingPathComponent(pathRecordings)
            )
            request.httpMethod = "POST"
            // 레벨테스트와 같은 조립 함수 — 바이트가 한 글자도 갈라지지 않게 한 벌만 둔다.
            request.httpBody = try recordingMultipartBody(
                wavBytes: wavBytes,
                durationMs: durationMs,
                clientQuality: clientQuality,
                boundary: boundary
            )
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: headerContentType)
            request.setValue(idempotencyKey, forHTTPHeaderField: headerIdempotencyKey)
            request.setValue(UUID().uuidString, forHTTPHeaderField: headerCorrelationId)
            let (data, response) = try await send(request)
            return Self.toResult(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: data)
        } catch {
            return .transportError(TransportFailure.from(error))
        }
    }

    static func toResult(status: Int, body: Data) -> IntonationUploadResult {
        if (200...299).contains(status) {
            // 접수됐는데 id를 못 읽었다 — 같은 키로 다시 보내면 서버가 같은 시도를 돌려주므로 재시도로 회수된다.
            guard let attemptId = (try? JSONDecoder().decode(AcceptedBody.self, from: body))?.attemptId.nonBlank else {
                return .rejected(status: status, code: nil, message: nil, retryable: true)
            }
            return .accepted(attemptId: attemptId)
        }
        let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: body)
        return .rejected(
            status: status,
            code: envelope?.code,
            message: envelope?.message,
            retryable: envelope?.retryable ?? URLSessionUploadClient.isRetryableStatus(status)
        )
    }

    /// 202 본문 `{attemptId, contentVersion, cardId, status, pollAfterMs}` 중 읽는 것 (서버 IntonationUploadResponse).
    private struct AcceptedBody: Decodable {
        let attemptId: String
    }
}

extension AuthClients {
    /// 억양 녹음 업로드 클라이언트 (KAN-253). 안드로이드 `IntonationUploadClient(API_BASE_URL, clients.authedClient)` 자리 —
    /// 60초 상한 업로드 세션(``defaultUploadSession()``) 위에 같은 저장소·같은 갱신 관문을 얹는다(``sessionClient(session:)``와 같은 모양).
    public func intonationUploadClient(session: URLSession = defaultUploadSession()) -> IntonationUploadClient {
        IntonationUploadClient(
            baseURL: baseURL,
            send: AuthorizedSession(send: session.send, store: store, refresher: refresher).send
        )
    }
}
