import Foundation

private let statusUnauthorized = 401

/// 갱신 한 번의 결말.
public enum RefreshOutcome: Equatable, Sendable {

    /// 쓸 수 있는 쌍이 저장돼 있다 — 방금 회전했거나, 다른 요청이 먼저 회전해 둔 것이다.
    case refreshed(AuthTokens)

    /// 저장된 쌍이 없거나 서버가 Refresh를 거절했다. 저장소는 비었고 다시 로그인해야 한다.
    case signedOut

    /// 서버가 판정을 못 냈다 (전송 실패·429·5xx). 토큰은 그대로다 — 나중에 다시 갱신하면 된다.
    case failed(AuthResult<AuthTokens>)
}

/// Access 토큰 갱신을 한 번에 하나만 내보내는 관문 (KAN-224). 안드로이드 `auth/TokenRefresher.kt`의 이식본이다.
///
/// **왜 한 번에 하나인가.** Refresh는 쓸 때마다 회전하고, 이미 회전된 Refresh를 다시 내면 서버가 탈취로
/// 보고 패밀리째 폐기한다(401 `AUTH_REFRESH_REUSED`). Access가 만료된 순간 요청 다섯 개가 동시에 401을
/// 받아 각자 갱신하면, 첫 갱신이 회전시킨 뒤 나머지 넷이 옛 Refresh를 내서 **정상 사용자가 로그아웃된다.**
/// 그래서 줄을 세우고, 줄 선 사이에 저장소가 이미 새 Access를 들고 있으면 서버에 묻지 않고 그 값을 쓴다 —
/// 401을 받은 요청이 실어 보냈던 토큰(`staleAccess`)과 지금 저장된 토큰이 다르면 누군가 먼저 갱신한 것이다.
///
/// **줄은 액터만으로 서지 않는다.** 액터는 `await` 지점에서 다른 호출을 들여보낸다(재진입) — 갱신 호출을
/// 기다리는 사이 두 번째 호출이 같은 옛 Refresh를 읽고 나간다. 그래서 호출마다 앞 호출의 작업이 끝나기를
/// 기다리는 사슬(``tail``)을 둔다. 코틀린 `Mutex.withLock`과 같은 FIFO 줄이다.
///
/// **토큰을 지우는 것은 서버가 Refresh를 거절(401)했을 때뿐이다.** 전송 실패·429·5xx에서 지우면 지하철에서
/// 앱을 연 사용자가 매번 로그아웃된다. 그 경우는 이번 요청만 실패시키고 토큰은 둔다.
public actor TokenRefresher {

    private let store: TokenStore
    private let refreshCall: @Sendable (String) async -> AuthResult<AuthTokens>

    /// 앞 호출의 작업. 다음 호출이 이것이 끝나기를 기다린 뒤 저장소를 읽는다.
    private var tail: Task<RefreshOutcome, Never>?

    /// 서버가 Refresh를 거절해 저장소를 비운 순간 불린다. ``AuthGateController``가 자기를 등록해 화면을
    /// 로그인으로 돌린다. 갱신을 부른 쪽이 결과를 받기 **전에** 끝까지 기다린다 — 안드로이드가 동기 콜백을
    /// 쓴 이유(신호를 놓치면 화면이 토큰 없는 로그인 상태로 남는다)를 await로 지킨다.
    private var onSignedOut: (@Sendable () async -> Void)?

    /// - Parameter refreshCall: 실제 갱신 호출 — ``AuthApi/refresh(_:)``. 함수로 받는 이유는 ``AuthClients``가
    ///   인증 전송을 만들 때 이 객체가 먼저 있어야 해서다(생성 순서의 고리를 끊는다).
    public init(store: TokenStore, refreshCall: @escaping @Sendable (String) async -> AuthResult<AuthTokens>) {
        self.store = store
        self.refreshCall = refreshCall
    }

    public func setOnSignedOut(_ callback: @escaping @Sendable () async -> Void) {
        onSignedOut = callback
    }

    /// - Parameter staleAccess: 401을 받은 요청이 실어 보냈던 Access. nil이면 저장소와 비교하지 않고 반드시
    ///   서버에 갱신을 묻는다 (앱 시작 시 Refresh가 아직 살아 있는지 확인하는 ``AuthGateController/bootstrap()``).
    public func refresh(staleAccess: String?) async -> RefreshOutcome {
        let previous = tail
        let task = Task { () -> RefreshOutcome in
            _ = await previous?.value
            return await self.refreshNow(staleAccess: staleAccess)
        }
        tail = task
        return await task.value
    }

    private func refreshNow(staleAccess: String?) async -> RefreshOutcome {
        guard let current = await store.read() else { return .signedOut }
        if let staleAccess, current.accessToken != staleAccess {
            return .refreshed(current)
        }
        let result = await refreshCall(current.refreshToken)
        switch result {
        case .success(let tokens):
            // 저장이 실패해도 새 쌍으로 진행한다(메모리 값은 이미 새 쌍) — 이번 프로세스의 요청은 성공한다. 다음 실행 때는
            // 키체인에 남은 옛 Refresh가 거절되거나(지우기만 되고 쓰기가 실패했다면 빈 저장소라) 로그인 화면으로 간다. 받아들인 열화다: 여기서 지우면 지금 당장 로그아웃된다.
            _ = await store.save(tokens)
            return .refreshed(tokens)
        case .rejected(let status, _, _, _, _) where status == statusUnauthorized:
            // AUTH_REFRESH_INVALID(만료·폐기)와 AUTH_REFRESH_REUSED(탈취 의심) 모두 이 Refresh로는 영영 못 푼다.
            await store.clear()
            await onSignedOut?()
            return .signedOut
        case .rejected, .transportError:
            return .failed(result)
        }
    }
}
