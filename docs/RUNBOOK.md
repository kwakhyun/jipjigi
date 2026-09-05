# 운영 런북

## 로컬 실행

```bash
corepack enable
pnpm install
pnpm db:setup
pnpm dev
```

기본 주소는 `http://localhost:3108`이며 데모 계정은 `demo@jipjigi.kr / demo1234!`입니다.

그로스 데모는 `growth@jipjigi.kr / demo1234!`입니다. 업무 화면 상단에서 로그아웃하거나 반대 역할의 로그인 화면으로 전환합니다. 웹 통합 테스트는 실제 PostgreSQL 엔진인 메모리 PGlite를 사용하며 개발 서버는 파일 기반 PGlite를 사용합니다. 테스트에서는 외부 DB와 Redis 자격 증명을 비워 공유 데모를 변경하지 않습니다.

공개 이메일은 입장 계정이며 첫 로그인 때 브라우저별 전용 데이터가 생성됩니다. 역할을 바꿔도 서명된 작업공간 쿠키가 남아 있으면 같은 체험을 이어갑니다. 업무 화면의 **체험 설정**에서 홈 구성을 선택하고 초기화에 동의하면 본인의 기록을 삭제하고 새 ID로 시작합니다. 쿠키를 삭제하거나 다른 브라우저를 사용하면 이전 공간을 복구할 수 없습니다. 실제 개인정보를 입력하지 마세요.

## DB 준비와 배포

- `pnpm db:setup`: 로컬 최초 실행. 기존 데이터는 유지하며 스키마와 데모 입장 계정을 준비합니다.
- `pnpm db:migrate`: 배포 환경의 `DATABASE_URL`을 사용해 미적용 버전만 실행합니다. 프로덕션 데모 시드는 `ALLOW_DEMO_AUTH=true`일 때만 생성됩니다.
- `pnpm db:reset`: 로컬 데이터 삭제 후 재생성. 프로덕션 모드 또는 `DATABASE_URL` 설정 시 실행을 거부합니다.

현재 스키마는 v5입니다. v1~v4는 기존 호환 스키마, v5는 조회 인덱스입니다. 마이그레이션은 트랜잭션과 Neon advisory lock을 사용하고, 완료된 버전은 다시 적용하지 않습니다. 연결 실패 시 풀을 닫고 실패한 Promise를 비운 뒤 1초의 재접속 간격을 둡니다.

Vercel 빌드 명령은 루트 `pnpm verify` 성공 후 앱의 `pnpm db:migrate`를 실행합니다. 마이그레이션 실패도 배포 실패로 처리됩니다. 현재 미리보기와 운영이 같은 DB를 사용하므로 호환 가능한 추가 변경만 적용해야 합니다. 컬럼 삭제나 의미 변경은 별도 데이터 이행과 배포 순서를 설계해야 합니다.

Docker standalone 이미지는 서버만 실행합니다. 이미지 기동 전에 전체 저장소와 의존성이 있는 배포 작업에서 대상 DB에 `pnpm db:migrate`를 실행하세요. 런타임 프로세스는 DDL이나 데모 시드를 실행하지 않습니다. E2E는 임시 DB를 명시적으로 준비한 다음 서버를 시작합니다.

## 필수 환경 변수

| 변수 | 목적 |
|---|---|
| `AUTH_SECRET` | 세션 JWT 서명. 프로덕션에서 32자 이상 필수 |
| `DATABASE_URL` | Vercel 운영과 미리보기에서 사용하는 Neon Postgres 연결 문자열 |
| `DB_DIR` | 로컬 PGlite 데이터 디렉터리. 기본값 `../../.data/jipjigi-pg` |
| `MESSAGE_WEBHOOK_SECRET` | 메시지 공급자 웹훅 HMAC 검증 |
| `NEXT_PUBLIC_APP_URL` | 메타데이터, 사이트맵의 정식 URL |
| `ALLOW_DEMO_AUTH` | 프로덕션에서 데모 시드, 공개 입장 계정과 개인 데모 세션을 허용할지 결정. 명시적 `true` 필요 |
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

`ALLOW_DEMO_AUTH=true`인 공개 데모에는 실제 개인정보를 입력하지 않습니다. 방문자별 공간 안에서만 샘플 데이터가 변경되며 알림톡과 결제 등 유료 외부 공급자는 연결하지 않습니다. 미리보기와 운영은 현재 같은 DB와 요청 제한 리소스를 공유하므로 파괴적인 검증은 로컬 PGlite에서만 수행합니다. 실제 고객 서비스를 시작할 때는 환경별 DB와 인증부터 분리해야 합니다.

공간의 유효 시간은 생성 후 12시간이고 전체 저장 개수는 50개입니다. 만료 즉시 접근은 차단하지만 물리 삭제는 다음 공간 생성 때 최대 하나씩 수행합니다. 새 방문자를 위해 아직 유효한 다른 공간을 지우지는 않습니다. 상한에 도달하면 새 로그인에 대기 안내를 표시합니다. 기존 공간으로의 로그인과 본인 초기화는 가능합니다. 새 데모를 악용해 무한히 저장하지 않도록 로그인 요청 제한과 공간 생성 잠금을 함께 사용합니다.

Vercel의 Root Directory는 `apps/web`이며 설정 파일도 `apps/web/vercel.json`에 둡니다. 함수, Neon과 Redis는 `sin1` 리전으로 맞춥니다. Turbo 웹 빌드에만 운영 환경 변수를 전달하고 테스트에는 전달하지 않습니다. Sensitive 환경 변수는 CLI로 내려받으면 빈 문자열로 표시될 수 있으므로 누락으로 단정하거나 비밀 값을 출력하지 말고 실행 결과로 확인합니다.

## 성능과 접근성 게이트

`pnpm verify`는 타입 검사, 단위 및 컴포넌트 테스트, 프로덕션 빌드, 경로별 gzip 전송량 예산을 순서대로 실행합니다. 이후 `pnpm test:e2e:setup`과 `pnpm test:e2e`로 실제 Next.js 여정을 검사합니다. E2E는 고정된 로컬 주소와 매 실행 새로 만든 임시 DB만 사용합니다. [실행 범위와 현재 검증 상태](E2E.md)를 확인하세요.

개인 데모의 `/app/growth` p75는 해당 공간의 두 역할로 수집한 최근 7일 데이터만 표시합니다. 12시간 만료 때문에 그보다 짧은 표본이며 충분한 외부 사용자 통계가 아닙니다. 상세 기준은 [성능 관측성과 품질 예산](OBSERVABILITY.md)에 정리했습니다.

## CRM 장애 대응

현재 샌드박스에는 실제 공급자, 자동 예약 처리와 공급자 장애 전환 스위치가 없습니다. `scheduled`는 상태와 다음 발송 가능 시각을 저장한 것이며 시간이 지나도 자동 발송하지 않습니다. 같은 예약 요청을 다시 접수해도 기존 기록을 반환합니다.

1. 메시지 센터에서 접수, 예약, 차단, 실패를 구분합니다. 발송 제한은 기본 21:00~08:00이며 저장된 임대인 설정이 우선합니다.
2. 서명 웹훅은 로컬 테스트에서만 가상 공급자 응답으로 검증합니다. 공유 운영 DB를 테스트 목적으로 직접 갱신하지 않습니다.
3. 납부가 완료된 청구는 최초 안내와 실패 재접수를 모두 거부합니다. 그 외 실패 건은 메시지 센터에서 같은 메시지 ID로 재접수해 `retry_count`를 올립니다. 예약 상태 자체는 실패 재접수 대상이 아닙니다.
4. `/api/webhooks/messages`는 전달·실패·수신 해제를, `/api/webhooks/renewal-responses`는 갱신 응답을 처리합니다. 타임라인과 이벤트를 함께 확인합니다.
5. 실제 운영 전에는 예약 워커의 실행 명령·주기, 발송 중지 스위치, 공급자 메시지 ID 대조와 복구 재처리 절차를 별도로 구현해야 합니다.

## 데이터 복구

데모 초기화 명령은 개발 환경에서만 동작합니다. 운영 환경에서는 `db:reset`을 실행하지 않습니다. 운영 백업은 쓰기 중지 없이 생성 가능한 데이터베이스 공급자의 스냅샷 기능을 사용합니다.

화면의 개인 데모 초기화는 `db:reset`과 다릅니다. 서명 쿠키와 현재 세션으로 소유권을 검사하고 해당 공간만 교체합니다. 삭제된 체험 기록은 UI에서 복구할 수 없으며 활성 상태의 다른 방문자 데이터는 유지합니다. 기존 공유 계정 세션은 이번 변경 후 로그인을 다시 해야 합니다.
