# 현재 및 목표 아키텍처

## 1. 현재 구현과 목표

현재 `prototype`은 선택 디자인과 핵심 상호작용을 빠르게 검증하기 위한 모바일 런타임입니다. `apps/web`에는 웹 유입, 인증된 운영 화면, 모바일 API, 실험과 이벤트 수집이 pnpm 모노레포로 구현되어 있습니다. React Native 클라이언트와 실제 외부 공급자는 다음 단계입니다.

| 구분 | 범위 |
|---|---|
| 현재 구현 | `apps/web`, `prototype`, `packages/domain`, `analytics`, `experiments`, `ui`, GitHub Actions와 Vercel 배포 |
| 후속 설계 | React Native 앱, `api-client`, `native-ui`, Panda CSS 전환, 실제 CRM 공급자와 AWS Elastic Beanstalk 운영 |

아래 구조와 운영 항목에는 현재 코드와 후속 목표가 함께 포함됩니다. 구현 여부가 중요한 항목은 [프로덕션 준비 상태](PRODUCTION-READINESS.md)와 [채용 요건 대응표](REQUIREMENT-MATRIX.md)에서 다시 구분합니다.

## 2. 목표 저장소 구조와 후속 경계

```text
jipjigi/
├── apps/
│   ├── web/                         # Next.js App Router
│   │   ├── app/
│   │   │   ├── (marketing)/         # 검색 유입용 서버 렌더링 페이지
│   │   │   ├── (product)/app/       # 인증된 임대 운영 화면
│   │   │   ├── api/mobile/v1/       # React Native용 Route Handlers
│   │   │   ├── api/events/          # 이벤트 수집
│   │   │   ├── api/health/          # 로드밸런서 상태 확인
│   │   │   ├── error.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── not-found.tsx
│   │   │   ├── robots.ts
│   │   │   └── sitemap.ts
│   │   ├── proxy.ts                 # 인증 확인과 최소한의 요청 전처리
│   │   └── next.config.ts
│   └── mobile/                      # React Native 앱
├── packages/
│   ├── domain/                      # 계약, 청구, 위험 신호 순수 로직
│   ├── api-client/                  # 생성된 타입 안전 API 클라이언트
│   ├── analytics/                   # 이벤트 이름, 공통 필드, 전송 어댑터
│   ├── experiments/                 # 배정, 노출, 종료 정책
│   ├── ui/                          # Panda CSS 토큰과 웹 컴포넌트
│   ├── native-ui/                   # 동일 토큰을 쓰는 React Native 컴포넌트
│   ├── config-eslint/
│   └── config-typescript/
├── turbo.json
├── pnpm-workspace.yaml
└── .github/workflows/
```

## 3. 렌더링 경계

### 검색 유입 페이지

현재 검색 유입 페이지는 `app/page.tsx`와 `app/rental-management/[district]`에서 Server Component를 기본으로 사용합니다. 지역 가이드에 `generateStaticParams`와 `dynamicParams = false`를 선언하고 메타데이터와 구조화 데이터를 서버에서 만듭니다. 다만 2026-08-31 Next.js 16.3.3 빌드에서는 공개 페이지가 동적 렌더링으로 분류되고 prerender manifest에도 지역 HTML이 등록되지 않아, 정적 생성 완료로 간주하지 않습니다. 정적 HTML 산출과 CDN 캐시 검증은 후속 최적화입니다.

### 인증된 제품 화면

브리핑과 운영 목록의 초기 데이터는 Server Component에서 직접 읽고, 요청마다 생성한 QueryClient에서 `dehydrate`한 뒤 `HydrationBoundary`로 전달합니다. 클라이언트는 같은 Query 키로 이를 이어받아 재조회와 변경 후 동기화를 처리합니다. `Date`, `Map`, 클래스 인스턴스는 데이터 DTO로 전달하지 않습니다. 바텀시트는 현재 보호된 프로토타입에서 사용합니다.

현재 `app/app/(management)`에는 홈, 계약, 장부, 수리, 메시지와 설정을 묶었습니다. 이 레이아웃의 임대인 분기만 계정별 Query 공급자를 사용합니다. `/app/growth`는 그룹 밖에 있어 Query 런타임을 받지 않으며, 그룹 이름은 URL에 나타나지 않습니다. Jotai 공급자는 선택 건물을 사용하는 홈 내부에만 둡니다.

```text
Server Component
  ├── 사용자와 건물 권한 확인
  ├── 계약 위험, 수납, 일정 병렬 조회
  └── ISO 문자열과 평범한 객체로 직렬화
        ↓
Client Management Views
  ├── Jotai: 홈의 선택 건물
  ├── TanStack Query: 브리핑, 계약, 장부, 수리, 메시지, 미리보기 설정
  ├── 로컬 상태: 검색, 필터, 일정 입력, 설정 초안
  └── analytics: 노출과 행동 이벤트
```

## 4. 데이터 접근

| 요구 | 선택 | 이유 |
|---|---|---|
| 웹 최초 읽기 | Server Component 직접 조회 | API 왕복과 클라이언트 폭포를 줄임 |
| 웹 내부 변경 | Server Action + useMutation | 서버 인증과 검증을 유지하면서 진행 상태와 관련 캐시 무효화 관리. 설정 폼은 useTransition 유지 |
| 모바일 읽기와 변경 | Route Handler | React Native가 사용할 명시적 HTTP 계약 필요 |
| 알림톡과 광고 웹훅 | Route Handler | 외부 시스템의 서명 검증과 재시도 처리 |
| 클라이언트 재조회 | TanStack Query | 캐시, 중복 요청 제거, 오류와 재시도 상태 관리 |
| 일시적 UI 상태 | Jotai / useState | 선택 건물과 화면 내부 입력을 서버 상태와 분리 |

기본 런타임은 Node.js입니다. Edge 런타임은 지리적 지연 요구와 의존성 호환성이 확인된 경로에만 제한합니다.

## 5. 상태 관리 규칙

- Query 키는 `owner / userId / resource`이고 브리핑에는 건물 ID를 추가합니다. 계정 전환 시 공급자를 새로 만들고 서버 QueryClient는 요청 간 공유하지 않습니다.
- 최초 조회는 SSR hydration으로 인계합니다. 기존 캐시보다 최신인 서버 응답도 반영하므로 화면마다 `initialData`를 복제하지 않습니다.
- 입금, 수리, 메시지 변경 후 관련 활성 Query를 재조회하고 비활성 Query를 무효화합니다. 서버 응답 실패에도 일부 저장 가능성을 고려해 재조회하며, 변경 자체는 자동 재실행하지 않습니다.
- 기본 freshness는 30초입니다. 오래된 데이터는 화면 진입, 포커스 복귀와 연결 복구 시 다시 읽고 수동 새로고침도 제공합니다. `accepted` 메시지가 있는 동안만 보이는 탭에서 15초마다 조회하며 오류가 나면 폴링을 멈춥니다. 실시간 서버 푸시는 아닙니다.
- GET `/api/workspace/[resource]`는 항목 허용 목록, 현재 임대인 역할, 소유자 ID, 요청 제한과 `private, no-store`를 검사합니다. 다른 계정의 응답은 캐시에 넣지 않습니다.
- Jotai에는 홈의 선택 건물만 저장합니다. 검색어, 필터, 일정 입력과 설정 초안은 로컬 상태로 유지합니다.
- 설정 폼은 Server Action 성공 후 미리보기 설정과 홈 Query를 갱신합니다. 조회 결과로 작성 중인 폼을 덮어쓰지 않습니다.
- 공개 페이지와 그로스 관제는 SSR을 유지합니다. 선택 근거와 변경별 무효화 표는 [Query 적용 결정](QUERY-STATE.md)에 기록합니다.

## 6. 스타일과 디자인 시스템

현재 웹은 `globals.css`의 CSS 변수와 상태 클래스를 사용하고 `packages/ui`는 공통 `cx` 유틸리티를 제공합니다. Panda CSS 전환 시 semantic token을 `packages/ui`에 두고, React Native 도입 뒤에는 원시 색 이름이 아닌 `surface.canvas`, `text.primary`, `status.risk`, `action.primary` 같은 의미 토큰을 공유합니다.

컴포넌트 계층은 다음처럼 나눕니다.

```text
tokens → primitives → domain components → feature composition
```

- primitives: Button, IconButton, Sheet, Badge, ListRow, Timeline
- domain components: RiskCard, CollectionSummary, LeaseStatus, MessagePreview
- feature composition: DailyBriefing, RenewalFlow, OverdueReminderFlow

현재 컴포넌트 상태는 실행 화면, Testing Library와 디자인 QA 이미지로 검증합니다. Storybook은 공통 primitives가 늘어날 때 도입할 후속 문서화 도구입니다.

## 7. 실험 배정

- 배정 단위는 로그인 사용자 ID입니다.
- 서버에서 안정적인 해시로 변형을 고정하고 `experiment_assignments` 테이블에 저장합니다.
- 변형 배정과 노출 기록을 분리합니다. UI가 실제로 렌더된 뒤에만 노출로 인정합니다.
- `proxy.ts`는 인증과 최소한의 헤더 전달만 담당합니다. 비즈니스 배정 규칙은 `packages/experiments`에 둡니다.
- 종료된 실험은 변형 타입, 분기, 전용 스타일, 이벤트 속성을 제거하는 정리 PR을 만듭니다.

## 8. 이벤트 수집

클라이언트와 서버 변경 로직은 `packages/analytics`의 고정된 이벤트 이름을 사용합니다. 현재 서버는 스키마 검증, 중복 제거와 PII 필터링 뒤 Neon Postgres에 저장합니다. 로컬에서는 같은 PostgreSQL 쿼리를 PGlite로 실행합니다. 브라우저 전송 실패는 사용자 작업을 막지 않으며, 변경 작업과 웹훅의 핵심 이벤트는 서버가 저장합니다. 트래픽이 늘어나면 이벤트 쓰기를 내구성 큐와 웨어하우스로 분리합니다.

```text
Web / Mobile
  → POST /api/events
  → schema validation + PII filter
  → Neon Postgres product_events (현재)
  → durable queue → warehouse (트래픽 확장 후)
  → experiment and CRM dashboards
```

## 9. SEO와 유입

- `app/layout.tsx`의 Metadata API로 기본 제목 템플릿을 정의합니다.
- 지역 페이지에는 `generateMetadata`와 `generateStaticParams`를 사용합니다. 현재 콘텐츠는 정적 모듈이므로 별도 데이터 조회 캐시가 필요하지 않습니다.
- `robots.ts`, `sitemap.ts`와 최적화된 브랜드 이미지를 기본으로 둡니다.
- 헤더 이미지는 `next/image`와 정확한 `sizes`를 사용하고 LCP 이미지에만 우선순위를 줍니다.
- 현재는 운영체제 한글 폰트 스택을 사용합니다. 브랜드 폰트를 확정하면 `next/font/local`로 한 번만 등록합니다.
- 번들 예산은 경로별 초기 청크로 검사합니다. 페이지 수가 늘어나면 검색 페이지와 제품 앱을 route group으로 분리합니다.

## 10. React Native

- 웹 화면을 그대로 WebView에 넣는 방식은 단기 검증에만 사용합니다.
- 장기적으로 브리핑, 장부, 알림은 네이티브 컴포넌트로 만들고 도메인 규칙, API 타입, 이벤트 이름을 공유합니다.
- 푸시 딥링크는 `jipjigi://briefing?riskId=...` 형태로 브리핑의 정확한 상태를 엽니다.
- 광고 SDK는 별도 어댑터로 감싸 빈도 제한, 동의, eCPM, 노출 실패를 공통 이벤트로 남깁니다.

## 11. AWS Elastic Beanstalk 배포

Next.js는 `output: "standalone"`로 빌드한 Node.js 컨테이너를 사용합니다.

```text
CloudFront
  → ALB
  → Elastic Beanstalk instances
      ├── Next.js standalone server
      ├── /api/health
      └── structured logs
```

- `public`과 `.next/static`을 standalone 결과와 함께 이미지에 복사합니다.
- ALB는 `/api/health`를 확인합니다.
- 다중 인스턴스 ISR은 로컬 파일 캐시를 쓰지 않습니다. Redis 또는 S3 기반 공유 캐시와 태그 무효화를 구성합니다.
- 이미지 최적화 부하는 CloudFront와 외부 이미지 로더로 분리합니다.
- 런타임 비밀은 `NEXT_PUBLIC_*`로 노출하지 않고 환경 변수와 AWS Secrets Manager로 주입합니다.
- 배포는 immutable 환경을 만들고 헬스 체크, 오류율, 핵심 퍼널을 확인한 뒤 트래픽을 전환합니다.

## 12. CI/CD

현재 GitHub Actions는 프로덕션 웹의 타입 검사, 단위 및 컴포넌트 테스트, 빌드와 번들 예산을 검사하고, 프로토타입은 런타임과 정적 랜딩을 별도 작업으로 검증합니다. 아래 전체 승격 흐름은 실제 CRM과 AWS 운영 환경을 연결할 때의 목표입니다.

```text
pull request
  → typecheck
  → unit and component tests
  → accessibility checks
  → production build
  → route bundle budget

후속 운영 파이프라인
  → visual regression
  → preview environment

main
  → container build
  → staging deploy
  → smoke test
  → production blue/green deploy
  → metric guardrail check
```

Turborepo는 패키지 입력과 환경 변수를 명시해 캐시 오염을 막습니다. 생성물과 테스트 결과는 작업별로 캐시하며, 배포 작업은 빌드 산출물의 해시를 그대로 승격합니다.

## 13. 성능 예산

| 항목 | 예산 |
|---|---:|
| 제품 홈 초기 JavaScript gzip | 185KiB 이하 |
| 그 밖의 주요 경로 초기 JavaScript gzip | 170KiB 이하 |
| LCP 이미지 전송량 | 120KB 이하 |
| 모바일 LCP p75 | 2.5초 이하 |
| INP p75 | 200ms 이하 |
| CLS p75 | 0.1 이하 |

현재 프로덕션 웹은 경로별 gzip 예산을 GitHub Actions에서 검사하고 Core Web Vitals를 제품 내 그로스 관제에 저장합니다. 보호된 프로토타입도 별도 빌드와 브라우저 시나리오로 회귀를 확인합니다. 최신 수치는 [성능 관측성과 품질 예산](OBSERVABILITY.md)에 기록합니다.

## 14. 오류와 복구

- 각 주요 route segment에 `loading.tsx`, `error.tsx`, `not-found.tsx`를 둡니다.
- 새 발송 요청은 서버 생성 멱등 키로 중복을 막고, 공급자 전달에 실패한 메시지만 사용자가 같은 기록에서 명시적으로 재접수합니다.
- 채널 장애 시 사용자에게 `실패`와 `예약 대기`를 구분해 보여줍니다.
- 실험 시스템 장애 시 기본안으로 안전하게 폴백하고 제품 행동은 계속 가능해야 합니다.
