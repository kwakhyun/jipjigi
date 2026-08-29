# 렌트플로우 디자인 QA

## 비교 대상

- source visual truth path: `/Users/kwakhyun/Documents/ChatGPT/자리톡 프론트엔드 포트폴리오 프로젝트/prototype/design-reference.png`
- implementation URL: `http://localhost:4173/`
- implementation screenshot path: `/Users/kwakhyun/Documents/ChatGPT/자리톡 프론트엔드 포트폴리오 프로젝트/prototype/.design-qa/implementation-home-passed.png`
- full-view comparison evidence: `/Users/kwakhyun/Documents/ChatGPT/자리톡 프론트엔드 포트폴리오 프로젝트/prototype/.design-qa/comparison-home-passed.png`
- focused hero comparison evidence: `/Users/kwakhyun/Documents/ChatGPT/자리톡 프론트엔드 포트폴리오 프로젝트/prototype/.design-qa/comparison-hero-passed.png`
- focused core-content comparison evidence: `/Users/kwakhyun/Documents/ChatGPT/자리톡 프론트엔드 포트폴리오 프로젝트/prototype/.design-qa/comparison-core-passed.png`

## 정규화와 상태

- source pixels: 853 × 1844 px
- normalized source: 393 × 850 px로 다운샘플한 뒤 위아래 1px씩 흰색 패딩을 적용해 393 × 852 px로 비교
- implementation pixels: 393 × 852 px
- CSS phone viewport: 393 × 852 CSS px
- browser viewport during iPhone capture: 1400 × 1200 CSS px
- deviceScaleFactor: 1
- rendered phone-screen measurement: 393 × 852 CSS px, scale 1
- state: iPhone, 홈, 위험 우선안, 성수 리버하임, 갱신/미납/유지보수 액션 실행 전
- theme: dark hero with light content surface

## Findings

- P0/P1/P2: 없음. 최종 비교에서 핵심 정보 구조, 주요 영역 비율, 첫 화면 밀도, 색상 역할, 이미지 주제와 배율, 문구가 목표 시안과 같은 수준으로 정렬됐다.
- P3, 운영체제 크롬: 목표 시안에는 상태 표시줄과 홈 인디케이터가 없지만 구현은 보호된 iOS 런타임을 사용한다. 콘텐츠를 가리지 않도록 34px 안전 영역을 반영했으며 의도된 플랫폼 차이로 분류한다.
- P3, 유지보수 행 affordance: 구현에는 302호 행 오른쪽에 화살표가 있다. 실제로 열리는 상세 시트가 있다는 점을 알리기 위한 의도된 제품 보완이다.

## 필수 충실도 점검

- Fonts and typography: Apple SD Gothic Neo 계열 폴백, 700~850 굵기, 제목과 숫자의 위계, 작은 상태 문구의 줄 높이를 확인했다. 핵심 문구의 줄바꿈과 잘림은 없다.
- Spacing and layout rhythm: 히어로 306px, 본문 좌우 24px, CTA와 일정, 수납 카드, 하단 탐색의 수직 리듬을 맞췄다. 첫 화면에서 핵심 기능이 모두 보인다.
- Colors and visual tokens: 야간 남보라, 라벤더 CTA, 코랄 위험, 녹색 안정/수납 토큰이 시안의 의미 체계와 대응한다. 텍스트 대비도 유지된다.
- Image quality and asset fidelity: 별도 생성한 1024 × 657 야간 건물 이미지를 90KB JPEG로 최적화하고 목표 배율에 맞춰 배치했다. 로고와 위험 아이콘은 시각 원본에서 추출한 실제 래스터 자산을 사용했으며 로고 배경은 투명 처리했다.
- Copy and content: 건물명, 계약 만료 30일, 오늘 일정 2건, 17/19건 수납 등 앱 고유 문구와 수치가 목표 시안과 일치한다.

## Full-view comparison evidence

`comparison-home-passed.png`에서 히어로, 위험 카드, CTA, 일정, 수납 요약, 하단 탐색까지 전체 구성을 한 화면에서 대조했다. 상태 표시줄과 iOS 안전 영역을 제외하면 주요 영역 시작점과 높이가 허용 가능한 범위로 일치한다.

## Focused region comparison evidence

- `comparison-hero-passed.png`: 로고, 날짜, 건물 선택, 브리핑 문구, 건물 이미지 크롭, 비대칭 하단 곡선을 확인했다.
- `comparison-core-passed.png`: 위험 아이콘과 본문 시작선, CTA 너비, 타임라인 마커와 라벨, 수납 카드 정렬을 확인했다.

## Comparison history

1. `comparison-home-v1.png`
   - Earlier P2 findings: 히어로가 339px로 과도하게 높았고, 로고와 위험 아이콘이 라이브러리 아이콘으로 대체돼 있었다. 수납 카드와 하단 탐색이 겹치며 홈 인디케이터가 메뉴 글자를 가렸다.
   - Fixes: 히어로를 306px로 압축하고 원본 기반 로고/위험 자산을 적용했다. 첫 화면 밀도를 줄여 수납 카드를 노출했다.
2. `comparison-home-v2.png` → `comparison-home-v3.png`
   - Earlier P2 findings: iOS 안전 영역 변수가 앱 루트에 전달되지 않아 탭 바 높이가 55px로 축소됐다. 타임라인 마커가 목표보다 오른쪽에 있었다.
   - Fixes: `--rf-safe-bottom` 폴백을 추가해 탭 바를 50px + 34px로 구성했다. 타임라인 열과 구분선 시작점을 재정렬했다.
   - Post-fix evidence: `comparison-home-v3.png`에서 메뉴 라벨과 홈 인디케이터가 분리되고 일정 정렬이 목표와 일치했다.
3. `comparison-home-v3.png` → `comparison-home-v4.png`
   - Earlier P2 finding: 히어로 건물 이미지가 목표보다 약 25% 크게 보여 상단 영역의 균형이 달랐다.
   - Fix: 배경 이미지를 `auto 74%`로 조정하고 오른쪽 아래에 고정했다. 비대칭 곡선 반경도 목표에 맞췄다.
   - Post-fix evidence: `comparison-home-v4.png`에서 건물 높이와 좌우 여백이 목표 시안과 같은 범위로 정렬됐다.
4. `comparison-home-v4.png` → `comparison-home-passed.png`
   - Earlier P2 findings: 래스터 로고의 어두운 직사각형 배경 경계가 보였고 위험 아이콘/본문 시작점이 목표보다 7px 왼쪽이었다.
   - Fixes: 로고를 투명 PNG로 변환하고 위험 자산을 88px로 렌더링해 본문 시작선을 맞췄다.
   - Post-fix evidence: `comparison-hero-passed.png`, `comparison-core-passed.png`에서 두 차이가 해소됐다.

## 기능 및 브라우저 검증

- 갱신 의사 확인: 시트 열림, 알림톡 문구/동의 가드레일 노출, 로딩, 성공 상태를 확인했다.
- 미납 안내: 미리보기, 수신 해제 제외와 야간 예약 가드레일, 로딩, 성공 상태를 확인했다.
- 유지보수: 임차인 메모 확인, 업체 배정 요청, 접수 완료 상태를 확인했다.
- 탐색: 홈, 임대장부, 소식, 전체 탭과 밝은 화면의 상태 표시줄 색상 전환을 확인했다.
- 실험: 위험 우선안과 일정 우선안 전환 후 홈 섹션 순서가 바뀌고 사용자 단위 선택값이 유지되는 것을 확인했다.
- 건물 전환: 성수 리버하임과 망원 포레 선택 흐름을 확인했다.
- clean browser load: 의미 있는 본문 렌더링, Vite/React 오류 오버레이 0건, console error/warn 0건을 확인했다.
- Pixel 10: 427 × 952 CSS px, scale 1에서 핵심 콘텐츠와 48px Android 시스템 안전 영역을 확인했다. 시각 원본이 iPhone만 제공되어 Pixel은 레이아웃/기능 검사로 한정했다.

## Implementation Checklist

- [x] 393 × 852 1:1 캡처
- [x] 전체 화면과 핵심 영역 나란히 비교
- [x] P2 이상 이슈 수정 후 재비교
- [x] 핵심 CTA와 CRM 가드레일 실제 클릭 검증
- [x] A/B 실험 전환 검증
- [x] 콘솔 및 오류 오버레이 확인
- [x] iOS/Android 안전 영역 확인

## Follow-up Polish

- 실제 제품 단계에서는 Pretendard 가변 폰트를 자체 호스팅해 기기별 한글 렌더링 편차를 더 줄일 수 있다.

final result: passed
