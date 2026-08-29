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

`(marketing)`은 Server Component를 기본으로 사용합니다. 지역별 임대관리 가이드, 공실 등록 안내, 월세 관리 체크리스트는 정적 생성 또는 ISR로 제공합니다. 메타데이터와 구조화 데이터는 서버에서 생성하고, 상호작용이 필요한 계산기나 CTA만 작은 Client Component로 분리합니다.

### 인증된 제품 화면

브리핑 초기 데이터는 Server Component에서 병렬로 읽어 직렬화 가능한 DTO로 전달합니다. 사용자가 직접 조작하는 바텀시트, 탭, 낙관적 상태만 Client Component가 맡습니다. Client Component는 비동기 함수가 되지 않으며 `Date`, `Map`, 클래스 인스턴스를 서버 경계에서 전달하지 않습니다.

```text
Server Component
  ├── 사용자와 건물 권한 확인
  ├── 계약 위험, 수납, 일정 병렬 조회
  └── ISO 문자열과 평범한 객체로 직렬화
        ↓
Client Briefing Island
  ├── Jotai: 열린 시트, 선택 건물, 임시 입력
  ├── TanStack Query: 후속 갱신, 재시도, 낙관적 업데이트
  └── analytics: 노출과 행동 이벤트
```

## 4. 데이터 접근

| 요구 | 선택 | 이유 |
|---|---|---|
| 웹 최초 읽기 | Server Component 직접 조회 | API 왕복과 클라이언트 폭포를 줄임 |
| 웹 내부 변경 | Server Action | 타입 안전, 전환 상태, 점진적 향상 |
| 모바일 읽기와 변경 | Route Handler | React Native가 사용할 명시적 HTTP 계약 필요 |
| 알림톡과 광고 웹훅 | Route Handler | 외부 시스템의 서명 검증과 재시도 처리 |
| 클라이언트 재조회 | TanStack Query | 캐시, 중복 요청 제거, 오류와 재시도 상태 관리 |
| 일시적 UI 상태 | Jotai | 서버 상태와 분리된 작은 원자 단위 상태 관리 |

기본 런타임은 Node.js입니다. Edge 런타임은 지리적 지연 요구와 의존성 호환성이 확인된 경로에만 제한합니다.

## 5. 상태 관리 규칙

- TanStack Query에는 계약, 청구, 수리 요청처럼 서버가 원본인 데이터만 둡니다.
- Jotai에는 현재 건물, 열린 바텀시트, 작성 중인 문구처럼 폐기 가능한 UI 상태만 둡니다.
- 같은 서버 데이터를 Query와 Jotai에 중복 저장하지 않습니다.
- Server Component가 가져온 초기 데이터는 Query의 `initialData`와 `dataUpdatedAt`으로 전달합니다.
- 발송 성공은 서버 응답을 받은 뒤 캐시를 갱신하며, 중복 발송 방지는 서버 멱등 키가 책임집니다.

## 6. 스타일과 디자인 시스템

Panda CSS의 semantic token을 `packages/ui`에 둡니다. 웹과 React Native는 원시 색 이름이 아니라 `surface.canvas`, `text.primary`, `status.risk`, `action.primary` 같은 의미 토큰을 공유합니다.

컴포넌트 계층은 다음처럼 나눕니다.

```text
tokens → primitives → domain components → feature composition
```

- primitives: Button, IconButton, Sheet, Badge, ListRow, Timeline
- domain components: RiskCard, CollectionSummary, LeaseStatus, MessagePreview
- feature composition: DailyBriefing, RenewalFlow, OverdueReminderFlow

컴포넌트는 키보드, 포커스, 로딩, 빈 상태, 성공, 오류 상태를 Storybook에서 함께 문서화합니다.

## 7. 실험 배정

- 배정 단위는 로그인 사용자 ID입니다.
- 서버에서 안정적인 해시로 변형을 고정하고 쿠키에는 실험 ID와 변형만 저장합니다.
- 변형 배정과 노출 기록을 분리합니다. UI가 실제로 렌더된 뒤에만 노출로 인정합니다.
- `proxy.ts`는 인증과 최소한의 헤더 전달만 담당합니다. 비즈니스 배정 규칙은 `packages/experiments`에 둡니다.
- 종료된 실험은 변형 타입, 분기, 전용 스타일, 이벤트 속성을 제거하는 정리 PR을 만듭니다.

## 8. 이벤트 수집

클라이언트는 타입이 고정된 이벤트만 전송합니다. 서버는 스키마 검증, 중복 제거, PII 필터링 후 큐에 적재합니다. 제품 요청 경로는 분석 시스템 장애 때문에 실패하지 않도록 분리합니다.

```text
Web / Mobile
  → POST /api/events
  → schema validation + PII filter
  → durable queue
  → warehouse
  → experiment and CRM dashboards
```

## 9. SEO와 유입

- `app/layout.tsx`의 Metadata API로 기본 제목 템플릿을 정의합니다.
- 지역과 주제별 페이지에는 `generateMetadata`를 사용하되 본문 조회와 `cache()`로 중복 요청을 막습니다.
- `robots.ts`, `sitemap.ts`, 정적 Open Graph 이미지를 기본으로 둡니다.
- 헤더 이미지는 `next/image`와 정확한 `sizes`를 사용하고 LCP 이미지에만 우선순위를 줍니다.
- Pretendard 또는 검토된 한글 로컬 폰트는 `next/font/local`로 한 번만 등록합니다.
- 검색 페이지와 제품 앱을 route group으로 분리해 제품용 클라이언트 코드가 랜딩 번들에 섞이지 않게 합니다.

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

```text
pull request
  → typecheck
  → lint
  → unit and component tests
  → accessibility checks
  → production build
  → visual regression
  → preview environment

main
  → container build
  → staging deploy
  → smoke test
  → production blue/green deploy
  → metric guardrail check
```

TurboRepo는 패키지 입력과 환경 변수를 명시해 캐시 오염을 막습니다. 생성물과 테스트 결과는 작업별로 캐시하며, 배포 작업은 빌드 산출물의 해시를 그대로 승격합니다.

## 13. 성능 예산

| 항목 | 예산 |
|---|---:|
| 제품 홈 초기 JavaScript gzip | 170KB 이하 |
| 마케팅 랜딩 초기 JavaScript gzip | 90KB 이하 |
| LCP 이미지 전송량 | 120KB 이하 |
| 모바일 LCP p75 | 2.5초 이하 |
| INP p75 | 200ms 이하 |
| CLS p75 | 0.1 이하 |

현재 프로토타입은 JavaScript 151KB gzip, CSS 5.9KB gzip, 헤더 이미지 90KB로 예산 안에 들어옵니다. 프로덕션에서는 번들 분석과 실제 사용자 성능 측정을 CI 및 관측 대시보드에 연결합니다.

## 14. 오류와 복구

- 각 주요 route segment에 `loading.tsx`, `error.tsx`, `not-found.tsx`를 둡니다.
- 발송 요청은 클라이언트 재시도와 서버 멱등성을 함께 사용합니다.
- 채널 장애 시 사용자에게 `실패`와 `예약 대기`를 구분해 보여줍니다.
- 실험 시스템 장애 시 기본안으로 안전하게 폴백하고 제품 행동은 계속 가능해야 합니다.
