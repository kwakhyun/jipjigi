# 집지기 | 임대 운영 그로스 포트폴리오

집지기는 1~20개 호실을 직접 관리하는 임대인이 오늘 처리할 일을 놓치지 않도록 돕는 모바일 중심 임대 운영 서비스입니다. 계약 만료, 월세 수납, 민원 대응을 한곳에 모으고, 기능을 출시할 때 행동 로그와 A/B 테스트까지 함께 설계했습니다.

자리톡과 같은 임대 관리 도메인을 다루되 브랜드, 정보 구조, 문구와 화면은 독립적으로 만들었습니다. 시각 시안에 머물지 않고 인증, 권한, 데이터 저장, API, 실험 배정, 이벤트 검증, 관제, 테스트와 배포를 하나의 실행 가능한 제품으로 연결했습니다.

| 구분 | 내용 |
| --- | --- |
| 진행 시점 | 2026년 8월 |
| 프로젝트 형태 | 공개 포트폴리오 데모 |
| 수행 범위 | 제품 문제 정의와 요구사항 우선순위, UI/UX 방향 결정, React와 Next.js 구현, 테스트와 배포 검증 |
| 현재 상태 | Vercel 공개 배포, 알림톡은 샌드박스 공급자를 사용하고 금융 정보는 데모 데이터로 제공 |
| AI 활용 | 시안 탐색, 구현 보조와 반복 검토에 사용하고 제품 정책과 최종 검증은 별도 기준으로 관리 |

**바로 확인하기:** [라이브 데모](https://jipjigi-khyun.vercel.app), [GitHub Actions](https://github.com/kwakhyun/jipjigi/actions/workflows/ci.yml), [현재 및 목표 아키텍처](docs/ARCHITECTURE.md)

## 데모 계정

| 역할 | 이메일 | 비밀번호 | 확인할 수 있는 경험 |
| --- | --- | --- | --- |
| 임대인 | `demo@jipjigi.kr` | `demo1234!` | 오늘의 브리핑, 임대 장부, 갱신 연락, 민원 관리 |
| 그로스 운영자 | `growth@jipjigi.kr` | `demo1234!` | 실험 현황, 퍼널과 가드레일 지표, 성능 관제 |

두 역할의 메뉴와 API 접근 권한은 분리되어 있습니다.

로그인 화면의 **그로스 데모**는 서비스 운영자용 계정입니다. 개별 임대 계약을 관리하려면 **임대인 데모**를 선택하세요. 업무 화면 상단의 반대쪽 데모 전환 버튼을 누르면 현재 계정에서 로그아웃한 뒤 해당 데모가 선택된 로그인 화면으로 이동합니다. 일반 로그아웃 버튼도 두 역할에 공통으로 제공됩니다.

계약 조회와 데모 전환은 [회귀 검증 기록](docs/audits/2026-08-31-contracts-and-demo-sessions.md), 이벤트 검증은 [신뢰 경계 개선 기록](docs/audits/2026-08-31-trust-and-consistency.md), 운영 데이터 동기화는 [Query 적용 결정과 검증](docs/QUERY-STATE.md)에 정리했습니다. 기능 설명은 이 저장소 버전을 기준으로 하며, 라이브 반영 여부는 해당 커밋의 GitHub Actions와 Vercel 배포 결과로 확인합니다.

## 제품 화면

| 임대인 홈 | 그로스 관제 |
| --- | --- |
| ![계약 만료 위험과 오늘 할 일을 보여주는 집지기 모바일 홈](.design-qa/mobile-home-final.jpg) | ![A/B 테스트와 사용자 행동 지표를 보여주는 집지기 그로스 관제 화면](.design-qa/operator-growth-final.jpg) |

그로스 관제의 제품 이벤트는 데모 시나리오에서 생성됩니다. Core Web Vitals는 데모를 실제로 연 브라우저에서 수집하지만, 외부 사용자 트래픽의 성과를 뜻하지 않습니다.

## 해결하려는 문제

소규모 임대인은 계약, 입금, 민원을 서로 다른 메신저와 문서에서 관리하는 경우가 많습니다. 그 결과 중요한 후속 조치가 사람의 기억에 의존하고, 어떤 안내가 실제 행동으로 이어졌는지 측정하기도 어렵습니다.

집지기는 홈에서 우선순위와 근거를 함께 보여주고, 확인과 연락, 상태 변경을 하나의 흐름으로 연결합니다. 계약 갱신, 미납 안내와 수리 요청은 서버에 저장되며 이후 상태와 수납 지표에 반영됩니다. 기능별 완료 조건과 성공 지표는 [제품 요구사항](docs/PRD.md)에 정리했습니다.

## 핵심 설계 판단

### 실제 노출을 기준으로 실험을 해석할 수 있게 했습니다

사용자가 실험군에 배정됐더라도 화면을 보지 않았다면 전환율의 분모에 포함하지 않아야 합니다. 사용자 ID를 안정적으로 해시해 실험안을 고정하고, 브리핑 UI가 렌더된 뒤 세션당 한 번만 노출 이벤트를 기록했습니다.

노출 이벤트의 실험 문맥은 클라이언트 입력 대신 서버 배정으로 확정합니다. 납부 완료와 메시지 전달 같은 서버 전용 이벤트는 공개 수집 API에서 거부하고, 내부 저장 경로에서도 이벤트별 필수 속성을 검증합니다. 관제는 노출 후 24시간 내 같은 실험안의 조치를 집계하고, 서로 다른 실험안에 노출된 사용자는 제외합니다.

**구현 근거:** [결정적 실험 배정](packages/experiments/src/index.ts), [실제 노출 기록](apps/web/components/dashboard/dashboard-view.tsx), [이벤트 허용 목록](packages/analytics/src/index.ts), [배정 테스트](packages/experiments/src/index.test.ts), [실험 설계](docs/EXPERIMENTS.md)

### 서버 데이터와 일시적인 UI 상태의 소유권을 분리했습니다

인증과 초기 데이터는 Server Component에서 읽고 `HydrationBoundary`로 클라이언트 캐시에 전달합니다. TanStack Query는 건물별 브리핑, 계약, 장부, 수리, 메시지와 미리보기용 알림 설정의 조회를 맡습니다. 계약과 장부는 메시지 대상 선택에도 쓰이므로 화면마다 복제하지 않고 계정별 Query 키로 공유합니다.

입금 확인과 메시지 접수 등은 `useMutation`으로 Server Action을 호출하고, 관련 캐시를 무효화해 서버의 저장 결과를 다시 읽습니다. 서버 캐시 재검증도 유지합니다. 납부 완료나 발송 성공을 낙관적으로 표시하지 않으며, 변경 요청은 자동 재시도하지 않습니다. 조회 오류에는 기존 정보와 재시도 버튼을 제공하고, 계정 변경을 감지하면 기존 정보를 숨깁니다.

선택 건물은 홈 내부의 Jotai, 검색어와 필터, 작성 중인 설정은 로컬 상태로 유지합니다. 공개 페이지와 조회 전용 그로스 관제는 Server Component만으로 충분해 Query를 추가하지 않았습니다.

**구현 근거:** [SSR 데이터 인계](apps/web/components/query-hydration.tsx), [계정별 공급자](apps/web/components/providers.tsx), [변경 영향 범위](apps/web/lib/query/invalidation.ts), [동기화 회귀 테스트](apps/web/components/query-state.test.tsx), [적용 범위와 비용](docs/QUERY-STATE.md)

### CRM 요청은 발송보다 운영 안전성을 먼저 확인합니다

갱신 요청과 미납 안내는 곧바로 발송하지 않습니다. 서버에서 리소스 소유권, 연락 동의와 야간 시간을 다시 확인하고 목적에 맞는 멱등 키를 만듭니다. 갱신 요청은 계약별 24시간 1회와 최근 7일 2회로 제한하고, 미납 안내는 계약과 청구월별 한 번만 접수합니다. 전달 실패는 같은 메시지에서 재접수하며 전달 결과, 채널 수신 해제와 갱신 응답은 HMAC 웹훅을 거쳐 타임라인과 관제에 반영합니다.

홈, 계약 관리, 장부의 연락 버튼은 같은 메시지 센터로 연결됩니다. 대상과 문구를 확인한 뒤 접수하며, 설정한 발송 제한 시간도 표시합니다. 샌드박스는 예약 상태와 시각을 저장하지만 자동 발송 워커는 실행하지 않습니다.

**구현 근거:** [발송 가드레일](apps/web/lib/messaging/guardrails.ts), [메시지 서비스](apps/web/lib/messaging/service.ts), [전달 웹훅](apps/web/app/api/webhooks/messages/route.ts), [갱신 응답 웹훅](apps/web/app/api/webhooks/renewal-responses/route.ts), [CRM 통합 테스트](apps/web/app/api/webhooks/messages/route.test.ts)

## 기술 구성

```text
Browser
  └─ Next.js App Router
      ├─ Server Components / Route Handlers
      ├─ TanStack Query / Jotai
      ├─ Domain, Analytics, Experiments, UI packages
      ├─ Neon Postgres / local PGlite
      ├─ Upstash Redis rate limiting
      └─ Sandbox notification provider
```

| 영역 | 기술 |
| --- | --- |
| 프론트엔드 | Next.js 16, React 19, TypeScript, TanStack Query, Jotai |
| 서버 | Next.js Route Handler, Server Action, Server Component, Zod |
| 데이터 | Neon Postgres, 로컬 PGlite, Upstash Redis |
| 모노레포 | pnpm workspace, Turborepo |
| 테스트 | Vitest, Testing Library, axe-core, 프로토타입 Playwright |
| 운영 | GitHub Actions, Vercel, 구조화 로그, Core Web Vitals |

웹 앱과 API를 한 Next.js 프로젝트에서 운영하는 모듈형 모놀리스 구조입니다. 초기 제품의 배포 속도와 타입 공유를 우선하되 도메인, 분석, 실험과 UI를 워크스페이스 패키지로 분리했습니다.

## 품질 검증

| 대상 | 검증 결과 | 실행 근거 |
| --- | --- | --- |
| 프로덕션 웹앱 | 2026-08-31 Query 적용 후 검증: 27개 파일, 102개 테스트 통과. 공통 패키지 8개 테스트 추가 통과 | [최신 검증 기록](docs/QUERY-STATE.md) |
| 타입과 빌드 | TypeScript 검사, Next.js 프로덕션 빌드 통과 | `pnpm typecheck`, `pnpm build` |
| 성능 예산 | 주요 화면 gzip 번들 예산 통과 | `pnpm bundle:check` |
| 접근성 | 주요 내비게이션, 수리와 알림 설정에 axe-core 검사 적용 | [컴포넌트 테스트](apps/web/components/maintenance/maintenance-view.test.tsx) |
| 성능 관측 | 실제 브라우저 지표 수집과 최근 7일 p75 집계 | [수집 코드](apps/web/components/web-vitals-reporter.tsx), [집계 코드](apps/web/lib/data/repository.ts) |
| 모바일 프로토타입 | Playwright 핵심 흐름 10개 통과 | `npm --prefix prototype run test:runtime` |
| 정적 랜딩 | Node 테스트 4개 통과 | `npm --prefix prototype run test:sites` |
| 지속적 통합 | 웹앱과 프로토타입을 독립 작업으로 검증하고 Vercel도 저장소 루트의 `pnpm verify`를 실행 | [CI 워크플로](.github/workflows/ci.yml), [Vercel 설정](apps/web/vercel.json) |

웹앱 검증은 다음 명령으로 재현합니다.

```bash
pnpm verify
```

프로토타입 검증은 의존성과 Chromium을 준비한 뒤 별도로 실행합니다.

```bash
npm --prefix prototype ci
npm --prefix prototype run test:runtime:setup
npm --prefix prototype run test:runtime
npm --prefix prototype run build
npm --prefix prototype run test:sites
```

## 운영 전환 경계

현재 결과물은 프로덕션 구조와 배포 흐름을 검증한 공개 포트폴리오 데모입니다. Vercel에서는 Neon Postgres가 영속 데이터를 보관하고 Upstash Redis가 인스턴스 간 요청 제한을 공유합니다. 로컬 개발은 같은 PostgreSQL 문법을 실행하는 PGlite를 사용합니다. 외부 알림톡은 실제 공급자 계약 대신 샌드박스를 사용하고, 금융 정보는 데모 데이터로 제공합니다.

실서비스로 전환하려면 내구성 이벤트 큐와 예약 발송 워커, 실제 인증과 CRM 공급자, 중앙 비밀 값 관리와 장애 알림이 추가로 필요합니다. 구현된 범위와 후속 작업은 [프로덕션 준비 상태](docs/PRODUCTION-READINESS.md)에서 구분해 확인할 수 있습니다.

실험 결과를 과장하지 않기 위해 실제 사용자 데이터가 없는 지표는 성과로 표기하지 않았습니다. 이 프로젝트는 실험을 설계하고 측정 가능한 상태로 구현하는 역량을 보여주는 데 초점을 둡니다.

## 로컬 실행

Node.js 22 이상과 pnpm 10.29.2를 사용합니다.

```bash
corepack enable
pnpm install
pnpm db:reset
pnpm dev
```

`http://localhost:3108`에서 Next.js 웹앱을 열 수 있습니다. 초기 모바일 디자인 시안과 포트폴리오 설명용 실험 패널은 `prototype`에 별도 보존했습니다.

<details>
<summary><strong>상세 문서와 저장소 구조</strong></summary>

### 제품과 그로스

- [제품 요구사항](docs/PRD.md)
- [실험 설계](docs/EXPERIMENTS.md)
- [이벤트 택소노미](docs/EVENTS.md)
- [채용 요건 대응표](docs/REQUIREMENT-MATRIX.md)

### 엔지니어링과 운영

- [현재 및 목표 아키텍처](docs/ARCHITECTURE.md)
- [Query 적용 결정과 검증](docs/QUERY-STATE.md)
- [프로덕션 준비 상태](docs/PRODUCTION-READINESS.md)
- [디자인 시스템](docs/DESIGN-SYSTEM.md)
- [성능 관측성과 품질 예산](docs/OBSERVABILITY.md)
- [로컬 및 운영 런북](docs/RUNBOOK.md)
- [React 및 Next.js 코드 리뷰](docs/REACT-NEXT-REVIEW.md)

### 작업 과정과 품질 기록

- [AI 활용과 검증 원칙](docs/AI-WORKFLOW.md)
- [전달 계획과 완료 조건](docs/DELIVERY-PLAN.md)
- [P0·P1 제품 감사와 개선 결과](docs/audits/p0-p1-2026-08-31/README.md)
- [프로덕션 디자인 QA](design-qa.md)
- [보호된 모바일 시안 디자인 QA](prototype/design-qa.md)

```text
.
├── apps/web/             # Next.js App Router 웹앱과 API
├── packages/             # 도메인, 분석, 실험, UI 공통 패키지
├── prototype/            # 선택 디자인을 보존한 모바일 프로토타입
├── docs/                 # 제품, 실험, 아키텍처와 운영 문서
├── Dockerfile            # Next.js standalone 컨테이너
└── .github/workflows/    # 앱과 프로토타입 품질 게이트
```

</details>
