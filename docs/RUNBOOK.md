# 운영 런북

## 로컬 실행

```bash
corepack enable
pnpm install
pnpm db:reset
pnpm dev
```

기본 주소는 `http://localhost:3108`이며 데모 계정은 `demo@rentflow.kr / demo1234!`입니다.

## 필수 환경 변수

| 변수 | 목적 |
|---|---|
| `AUTH_SECRET` | 세션 JWT 서명. 프로덕션에서 32자 이상 필수 |
| `DB_FILE` | SQLite 파일 경로. 컨테이너 기본값 `/data/rentflow.db` |
| `MESSAGE_WEBHOOK_SECRET` | 메시지 공급자 웹훅 HMAC 검증 |
| `NEXT_PUBLIC_APP_URL` | 메타데이터, 사이트맵의 정식 URL |
| `ALLOW_DEMO_AUTH` | 명시적으로 `true`일 때만 프로덕션 데모 시드 허용 |
| `UPSTASH_REDIS_REST_URL` | 선택 항목. Redis 기반 분산 요청 제한 URL |
| `UPSTASH_REDIS_REST_TOKEN` | 선택 항목. Redis REST 인증 토큰 |

Upstash 변수 두 개를 모두 설정하면 로그인, 행동 이벤트, Core Web Vitals, API와 Server Action 요청 제한이 Redis sliding window를 공유합니다. 둘 중 하나라도 없으면 단일 인스턴스 개발을 위한 bounded 메모리 저장소를 사용합니다. `/api/health`의 `rateLimitStore`로 현재 모드를 확인할 수 있습니다. Redis가 일시적으로 응답하지 않으면 1.5초 후 인메모리 제한으로 전환하고 구조화 경고 로그를 남깁니다.

`NEXT_PUBLIC_APP_URL`은 메타데이터와 사이트맵에 포함되므로 Docker 이미지 빌드 시에도 같은 값을 전달합니다.

```bash
docker build --build-arg NEXT_PUBLIC_APP_URL=https://rentflow.example -t rentflow .
```

HTTPS 주소로 빌드한 프로덕션 이미지에서만 HSTS 헤더를 활성화합니다. 로컬 HTTP 검증 환경에는 HSTS를 보내지 않습니다.

## 상태 확인

`GET /api/health`가 HTTP 200과 `database: ready`를 반환해야 합니다. 503이면 파일 볼륨 권한, `DB_FILE`, 디스크 용량을 먼저 확인합니다.

## 성능과 접근성 게이트

`pnpm verify`는 타입 검사, 단위 및 컴포넌트 테스트, 프로덕션 빌드, 경로별 gzip 전송량 예산을 순서대로 실행합니다. 실제 사용자 성능은 `/app/growth`의 최근 7일 p75에서 확인합니다. 상세 기준은 [성능 관측성과 품질 예산](OBSERVABILITY.md)에 정리했습니다.

## CRM 장애 대응

1. `message_dispatches`에서 `failed`, `scheduled` 수를 확인합니다.
2. 공급자 장애 중에는 새로운 요청을 `scheduled`로 유지합니다.
3. 동일한 `idempotency_key`로 재시도해 중복 발송을 막습니다.
4. 복구 후 공급자 메시지 ID로 웹훅 누락분을 대조합니다.

## 데이터 복구

데모 초기화 명령은 개발 환경에서만 동작합니다. 운영 환경에서는 `db:reset`을 실행하지 않습니다. 운영 백업은 쓰기 중지 없이 생성 가능한 데이터베이스 공급자의 스냅샷 기능을 사용합니다.
