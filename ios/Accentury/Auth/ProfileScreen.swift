import AccenturyCore
import SwiftUI

/// 추가 정보 화면 (KAN-224, §3.10, 시안 s-02-profile). 안드로이드 `auth/ProfileScreen.kt`의 이식본이다. 로그인은 됐지만 프로필이
/// 미완료일 때 선다. 이메일·이름·생년월일이 차야 [다음]이 켜지고 건너뛸 수 없다 — 연령은 만 14세 가입 제한의 근거다. 성별은 선택이다
/// (KAN-330, App Store 빌드 15 거절 5.1.1).
///
/// 출신 지역은 KAN-355부터 다음 화면(``RegionSelectScreen``, 지도)이다. [다음]은 저장하지 않고 지역 화면으로 넘어가고, 저장은 지역
/// 화면의 [다음]에서 두 화면 값을 모아 한 번 한다 — `PUT /v0/users/me/profile`이 지역을 필수로 받는다. 두 화면이 같은 ``form``을
/// 보고 이 뷰가 둘을 갈아 끼우므로, 지역 화면에서 왼쪽 가장자리 스와이프로 돌아와도 입력값이 남는다. 지역 화면의 지역 값도 남는다.
///
/// 저장이 프로필 칸 때문에 거절되면(만 14세 미만 등, ``AccenturyCore/profileFieldFailure(_:)``) 제출이 끝날 때 프로필 화면으로
/// 되돌린다 — 생년월일 수정과 [다른 계정으로 로그인]이 거기에만 있다. 이런 실패는 지역 화면 안내로 넘기지 않는다.
struct ProfileScreen: View {

    /// 방금 실패한 제출의 안내 (``AccenturyCore/AuthGateState/needsProfile(_:error:)``)
    let error: AuthFailure?
    /// ``AccenturyCore/AuthGateController/submitProfile(_:)``
    let onSubmit: (ProfileInput) async -> Void
    /// [다른 계정으로 로그인] — 로그아웃해 로그인 화면으로 (``AccenturyCore/AuthGateController/logout(idpLogout:)``).
    /// 만 14세 미만 거절을 받았거나 계정을 잘못 고른 사용자가 이 화면에 갇히지 않게 하는 유일한 출구다(설정 화면은 KAN-247).
    /// 시안에는 없지만 유지한다 (2026-11-16 결정).
    let onSwitchAccount: () async -> Void

    /// 서버가 아는 계정 값으로 미리 채운 입력. 계정이 바뀌면 부모가 `.id(user.id)`로 이 화면을 새로 세워 앞 계정의
    /// 입력을 물려받지 않는다.
    @StateObject private var form: ProfileFormState
    @State private var pickingDate = false
    @State private var leaving = false
    /// 지역 화면을 띄웠는가. 저장 실패(``error``)로 게이트 상태가 바뀌어도 같은 `.id`라 지역 화면에 머문다.
    @State private var choosingRegion = false

    init(
        user: AuthUser,
        error: AuthFailure?,
        onSubmit: @escaping (ProfileInput) async -> Void,
        onSwitchAccount: @escaping () async -> Void
    ) {
        self.error = error
        self.onSubmit = onSubmit
        self.onSwitchAccount = onSwitchAccount
        _form = StateObject(wrappedValue: ProfileFormState(user: user))
    }

    var body: some View {
        // 같은 거절이 연달아 와도 되돌리도록 error 값이 아니라 제출 종료 시점을 본다.
        screen.onChange(of: form.submitting) { submitting in
            if !submitting, profileFieldFailure(error) { choosingRegion = false }
        }
    }

    @ViewBuilder private var screen: some View {
        if choosingRegion {
            RegionSelectScreen(
                selected: form.region,
                onSelect: { form.region = $0 },
                busy: form.submitting,
                failure: profileFieldFailure(error) ? nil : error,
                onBack: { choosingRegion = false },
                onNext: submit
            )
        } else {
            profile
        }
    }

    private var profile: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Papercut.space6) {
                    Text("몇 가지만 알려 주세요")
                        .papercutType(.headline)
                        .foregroundColor(Papercut.ink)
                        .accessibilityAddTraits(.isHeader)

                    AccenturyTextField(label: "이메일", text: $form.email, keyboard: .emailAddress, contentType: .emailAddress)
                    AccenturyTextField(label: "이름", text: $form.name, contentType: .name)
                    AccenturyTextField(
                        label: "생년월일",
                        text: Binding(get: { form.birthDate ?? "" }, set: { _ in }),
                        placeholder: "눌러서 고르기",
                        onTap: { pickingDate = true }
                    )

                    // 「선택 안 함」은 nil이다 — 고르지 않은 것과 같은 값이라 처음부터 골라져 있다. 선택 항목임이 칸을 보자마자 읽힌다 (KAN-330).
                    ChoiceGroup(title: "성별 (선택)") {
                        HStack(spacing: Papercut.space3) {
                            ForEach(Gender.allCases, id: \.self) { gender in
                                ChoiceButton(label: gender.label, selected: form.gender == gender) { form.gender = gender }
                            }
                            ChoiceButton(label: "선택 안 함", selected: form.gender == nil) { form.gender = nil }
                        }
                    }

                    if let error { AuthFailureBlock(failure: error, verb: "저장") }
                }
                .padding(.horizontal, Papercut.space6)
                .padding(.top, Papercut.space2)
                .padding(.bottom, Papercut.space4)
            }

            // 하단 고정 (``ExceptionScreen``의 footer 자리와 같은 좌우 24·아래 32)
            VStack(spacing: Papercut.space2) {
                AccenturyButton(
                    text: "다음", enabled: form.basicsComplete && !leaving, fillsWidth: true, trailingIcon: "arrow.right"
                ) { choosingRegion = true }

                AccenturyButton(text: "다른 계정으로 로그인", variant: .text, enabled: !leaving, fillsWidth: true) {
                    leaving = true
                    Task {
                        await onSwitchAccount()
                        leaving = false
                    }
                }
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.top, Papercut.space4)
            .padding(.bottom, Papercut.space8)
        }
        // 워드마크 앱바 (KAN-288 디자인 3). 위 8 + 앱바 48 + 8 = 예전 위 여백 64라 본문 시작 높이는 그대로다.
        .paperAppBar()
        .sheet(isPresented: $pickingDate) {
            BirthDatePicker(initial: form.birthDate) { form.birthDate = $0 }
        }
    }

    /// 지역 화면 [다음] — 두 화면 값을 모아 한 번 저장한다. 성공하면 게이트가 다음 상태(음성 저장 동의)로 넘어가 이 화면째 내려간다.
    private func submit() {
        guard let input = form.toInput() else { return }
        form.submitting = true
        Task {
            await onSubmit(input)
            form.submitting = false
        }
    }
}

/// 선택지 묶음. 제목 아래 칸들이 스크린 리더에 한 그룹으로 읽힌다.
private struct ChoiceGroup<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: Papercut.space2) {
            Text(title).papercutType(.label).foregroundColor(Papercut.ink)
            content()
        }
        .accessibilityElement(children: .contain)
    }
}

/// 생년월일 달력. 안드로이드 Material3 DatePickerDialog 자리이고 버튼도 같은 둘([취소]·[확인])이다. 미래 날짜는 고를 수
/// 없다 — 만 14세 판정은 서버가 한다(400 `AUTH_UNDER_AGE`). 아무것도 고르지 않았으면 2000년 1월에서 펼친다: 오늘부터
/// 수십 년을 거슬러 넘기지 않게.
private struct BirthDatePicker: View {

    let initial: String?
    let onPicked: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var date: Date

    /// 달력과 문자열 풀이가 같은 달력을 써야 날짜가 밀리지 않는다 (``AccenturyCore/birthDateString(of:calendar:)``).
    private static let calendar = Calendar(identifier: .gregorian)

    init(initial: String?, onPicked: @escaping (String) -> Void) {
        self.initial = initial
        self.onPicked = onPicked
        let start = initial.flatMap { birthDate(from: $0, calendar: Self.calendar) }
            ?? birthDate(from: "2000-01-01", calendar: Self.calendar) ?? Date()
        _date = State(initialValue: start)
    }

    var body: some View {
        VStack(spacing: Papercut.space4) {
            DatePicker(
                "생년월일",
                selection: $date,
                in: (birthDate(from: "1900-01-01", calendar: Self.calendar) ?? .distantPast)...Date(),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .environment(\.calendar, Self.calendar)
            .environment(\.locale, Locale(identifier: "ko_KR"))
            .tint(Papercut.ink)

            HStack {
                Spacer()
                AccenturyButton(text: "취소", variant: .text) { dismiss() }
                AccenturyButton(text: "확인", variant: .text) {
                    onPicked(birthDateString(of: date, calendar: Self.calendar))
                    dismiss()
                }
            }
        }
        .padding(Papercut.space4)
        .background(Papercut.cream.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }
}
