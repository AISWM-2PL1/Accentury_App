import AccenturyCore
import SwiftUI

/// 추가 정보 화면 (KAN-224, §3.10). 안드로이드 `auth/ProfileScreen.kt`의 이식본이다. 로그인은 됐지만 프로필이
/// 미완료일 때 선다. 다섯 칸이 모두 차야 [완료]가 켜지고 건너뛸 수 없다 — 출신지역은 학습 데이터 라벨이고(KAN-201),
/// 연령은 만 14세 가입 제한의 근거다.
struct ProfileScreen: View {

    /// 방금 실패한 제출의 안내 (``AccenturyCore/AuthGateState/needsProfile(_:error:)``)
    let error: AuthFailure?
    /// ``AccenturyCore/AuthGateController/submitProfile(_:)``
    let onSubmit: (ProfileInput) async -> Void
    /// [다른 계정으로 로그인] — 로그아웃해 로그인 화면으로 (``AccenturyCore/AuthGateController/logout(idpLogout:)``).
    /// 만 14세 미만 거절을 받았거나 계정을 잘못 고른 사용자가 이 화면에 갇히지 않게 하는 유일한 출구다(설정 화면은 KAN-247).
    let onSwitchAccount: () async -> Void

    /// 서버가 아는 계정 값으로 미리 채운 입력. 계정이 바뀌면 부모가 `.id(user.id)`로 이 화면을 새로 세워 앞 계정의
    /// 입력을 물려받지 않는다.
    @StateObject private var form: ProfileFormState
    @State private var pickingDate = false
    @State private var leaving = false

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

                ChoiceGroup(title: "성별") {
                    HStack(spacing: Papercut.space3) {
                        ForEach(Gender.allCases, id: \.self) { gender in
                            ChoiceButton(label: gender.label, selected: form.gender == gender) { form.gender = gender }
                        }
                    }
                }

                // 질문은 웹 지역 선택 화면(RegionSelectScreen)과 같은 문장이다 — 같은 값을 묻는 두 화면이 다르게 묻지 않게.
                ChoiceGroup(title: "어느 지역 말씨가 몸에 배어 있나요?") {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: Papercut.space3), GridItem(.flexible(), spacing: Papercut.space3)],
                              spacing: Papercut.space3) {
                        ForEach(Region.allCases, id: \.self) { region in
                            ChoiceButton(label: region.label, selected: form.region == region) { form.region = region }
                        }
                    }
                }

                if let error { AuthFailureBlock(failure: error, verb: "저장") }

                AccenturyButton(text: "완료", enabled: form.isComplete && !form.submitting && !leaving, fillsWidth: true) {
                    guard let input = form.toInput() else { return }
                    form.submitting = true
                    Task {
                        await onSubmit(input)
                        form.submitting = false
                    }
                }

                AccenturyButton(text: "다른 계정으로 로그인", variant: .text, enabled: !form.submitting && !leaving, fillsWidth: true) {
                    leaving = true
                    Task {
                        await onSwitchAccount()
                        leaving = false
                    }
                }
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.top, Papercut.screenPaddingTop)
            .padding(.bottom, Papercut.space8)
        }
        .background(Papercut.cream.ignoresSafeArea())
        .sheet(isPresented: $pickingDate) {
            BirthDatePicker(initial: form.birthDate) { form.birthDate = $0 }
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
