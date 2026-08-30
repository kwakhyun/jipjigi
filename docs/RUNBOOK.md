# 운영 런북

## 로컬 실행

```bash
corepack enable
pnpm install
pnpm db:reset
pnpm dev
```

기본 주소는 `http://localhost:3108`이며 데모 계정은 `demo@jipjigi.kr / demo1234!`입니다.

## 필수 환경 변수

| 변수 | 목적 |
|---|---|
| `AUTH_SECRET` | 세션 JWT 서명. 프로덕션에서 32자 이상 필수 |
| `DATABASE_URL` | Vercel 운영과 미리보기에서 사용하는 Neon Postgres 연결 문자열 |
| `DB_DIR` | 로컬 PGlite 데이터 디렉터리. 기본값 `../../.data/jipjigi-pg` |
| `MESSAGE_WEBHOOK_SECRET` | 메시지 공급자 웹훅 HMAC 검증 |
| `NEXT_PUBLIC_APP_URL` | 메타데이터, 사이트맵의 정식 URL |
| `ALLOW_DEMO_AUTH` | 명시적으로 `true`일 때만 프로덕션 데모 시드 허용 |
| `UPSTASH_REDIS_REST_URL` | 운영에서 필수인 Redis 기반 분산 요청 제한 URL |
| `UPSTASH_REDIS_REST_TOKEN` | 운영에서 필수인 Redis REST 인증 토큰 |
| `KV_REST_API_URL` | Vercel Marketplace가 KV 이름으로 제공하는 Redis REST URL. Upstash URL이 없을 때 사용 |
| `KV_REST_API_TOKEN` | Vercel Marketplace가 KV 이름으로 제공하는 Redis REST 토큰. Upstash 토큰이 없을 때 사용 |

Upstash 변수 두 개를 모두 설정하면 로그인, 행동 이벤트, Core Web Vitals, API와 Server Action 요청 제한이 Redis sliding window를 공유합니다. 로컬에서만 자격 증명이 없을 때 bounded 메모리 저장소를 사용합니다. 운영에서는 Redis가 없거나 1.5초 안에 응답하지 않으면 요청 제한 대상 작업을 차단하고 구조화 경고 로그를 남깁니다. `/api/health`에서 `rateLimitStore: redis`, `rateLimitReady: true`를 확인해야 합니다.

`NEXT_PUBLIC_APP_URL`은 메타데이터와 사이트맵에 포함되므로 Docker 이미지 빌드 시에도 같은 값을 전달합니다.

```bash
docker build --build-arg NEXT_PUBLIC_APP_URL=https://jipjigi.example -t jipjigi .
```

HTTPS 주소로 빌드한 프로덕션 이미지에서만 HSTS 헤더를 활성화합니다. 로컬 HTTP 검증 환경에는 HSTS를 보내지 않습니다.

## 상태 확인

`GET /api/health`가 HTTP 200과 `database: ready`, `databaseStore: neon`, `rateLimitStore: redis`, `rateLimitReady: true`를 반환해야 합니다. 503이면 Neon과 Upstash 리소스 연결, 환경 변수 범위, 공급자 상태를 순서대로 확인합니다.

## 무료 공개 데모 운영

2026년 8월 31일 실제 계정과 리소스 설정을 확인했습니다.

| 서비스 | 확인된 플랜 | 비용 제한 |
| --- | --- | --- |
| Vercel | Hobby, 활성 상태 | 개인 비상업 포트폴리오용 무료 플랜. 한도 초과 시 기능 제한 가능 |
| Neon `jipjigi-postgres` | Free (`free_v3`) | 프로젝트당 100 CU-hours, 0.5 GB. 무료 초과 사용료 없음 |
| Upstash `jipjigi-rate-limit` | Free (`free`) | 월 500,000 명령. `autoUpgrade=false`, `prodPack=false` |

현재 구성은 유료 플랜으로 자동 전환하지 않습니다. 한도에 도달하면 자동 결제 대신 요청이나 서비스가 제한될 수 있습니다. 유료 플랜, 자동 업그레이드, 유료 부가 기능은 별도 승인 없이 켜지 않습니다. 무료 정책의 근거는 [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Neon Free 한도](https://neon.com/docs/introduction/plans), [Upstash 자동 업그레이드](https://upstash.com/docs/redis/features/auto-upgrade)입니다.

`ALLOW_DEMO_AUTH=true`인 공개 데모에는 실제 개인정보를 입력하지 않습니다. 공개 계정으로 샘플 데이터가 변경되며, 알림톡과 결제 등 유료 외부 공급자는 연결하지 않습니다. 미리보기와 운영은 현재 같은 데모 리소스를 공유하므로 파괴적인 검증은 로컬 PGlite에서만 수행합니다. 실제 고객 서비스를 시작할 때는 환경별 DB와 인증부터 분리해야 합니다.

Vercel의 Root Directory는 `apps/web`이며 설정 파일도 `apps/web/vercel.json`에 둡니다. 함수, Neon과 Redis는 `sin1` 리전으로 맞춥니다. Turbo 웹 빌드에만 운영 환경 변수를 전달하고 테스트에는 전달하지 않습니다. Sensitive 환경 변수는 CLI로 내려받으면 빈 문자열로 표시될 수 있으므로 누락으로 단정하거나 비밀 값을 출력하지 말고 실행 결과로 확인합니다.

## 성능과 접근성 게이트

`pnpm verify`는 타입 검사, 단위 및 컴포넌트 테스트, 프로덕션 빌드, 경로별 gzip 전송량 예산을 순서대로 실행합니다. 실제 사용자 성능은 `/app/growth`의 최근 7일 p75에서 확인합니다. 상세 기준은 [성능 관측성과 품질 예산](OBSERVABILITY.md)에 정리했습니다.

## CRM 장애 대응

1. `message_dispatches`에서 `failed`, `scheduled` 수를 확인합니다.
2. 공급자 장애 중에는 새로운 요청을 `scheduled`로 유지합니다.
3. 실패 건은 메시지 센터에서 같은 메시지 ID로 재접수해 `retry_count`를 올립니다. 새 논리 요청을 만들지 않으므로 기존 멱등 키가 유지됩니다.
4. 복구 후 공급자 메시지 ID로 `/api/webhooks/messages` 전달 상태 누락분을 대조합니다.
5. 갱신 답변은 `/api/webhooks/renewal-responses`와 `renewal_response_events`를 대조합니다.
6. `opted_out` 웹훅은 계약의 연락 동의를 해제하므로 오탐이 의심되면 원본 공급자 기록을 먼저 확인합니다.

## 데이터 복구

데모 초기화 명령은 개발 환경에서만 동작합니다. 운영 환경에서는 `db:reset`을 실행하지 않습니다. 운영 백업은 쓰기 중지 없이 생성 가능한 데이터베이스 공급자의 스냅샷 기능을 사용합니다.
