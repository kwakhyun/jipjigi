# 성능 관측성과 품질 예산

## 실제 사용자 성능 측정

루트 레이아웃의 경량 로더가 hydration 이후 Web Vitals 수집기를 불러옵니다. 수집기는 `LCP`, `INP`, `CLS`, `FCP`, `FID`, `TTFB`를 `/api/vitals`로 전송합니다. Beacon API를 우선 사용하고 지원되지 않으면 `keepalive` 요청으로 대체합니다. 실패는 사용자의 주 작업에 영향을 주지 않습니다.

서버는 런타임 스키마, 동일 출처, 분당 요청 한도, 미래 시각을 검증한 뒤 `web_vitals` 테이블에 저장합니다. 이름, 이메일, 연락처는 성능 이벤트에 포함하지 않습니다. 그로스 관제의 사용자 체감 성능 영역은 최근 7일 `LCP`, `INP`, `CLS` p75와 양호 비율을 표시합니다.

| 지표 | p75 목표 |
|---|---:|
| LCP | 2,500ms 이하 |
| INP | 200ms 이하 |
| CLS | 0.1 이하 |

로컬에서는 화면을 한 번 연 뒤 `/app/growth`를 새로고침하면 적재된 표본을 확인할 수 있습니다. 실제 운영 판단은 충분한 표본이 쌓인 뒤 경로, 기기, 네트워크 조건을 함께 나눠서 수행해야 합니다.

## 전송량 예산

`pnpm bundle:check`는 Next.js가 생성한 경로별 첫 로드 청크를 gzip으로 압축해 합산합니다. 공개 경로는 170KiB, 일반 앱 경로는 170KiB, 클라이언트 상태와 질의 런타임이 필요한 `/app`은 185KiB를 상한으로 둡니다. 이 검사는 `pnpm verify`와 GitHub Actions에 포함됩니다.

2026년 8월 31일 전체 검증 빌드 기준 결과입니다.

| 경로 | gzip 합산 | 예산 |
|---|---:|---:|
| `/` | 152.6KiB | 170KiB |
| `/login` | 149.1KiB | 170KiB |
| `/rental-management/[district]` | 147.7KiB | 170KiB |
| `/app` | 174.2KiB | 185KiB |
| `/app/contracts` | 153.2KiB | 170KiB |
| `/app/growth` | 150.8KiB | 170KiB |
| `/app/ledger` | 153.0KiB | 170KiB |
| `/app/maintenance` | 153.4KiB | 170KiB |
| `/app/messages` | 154.1KiB | 170KiB |
| `/app/settings` | 152.7KiB | 170KiB |

이 수치는 CDN의 실제 Brotli 전송량이 아니라 재현 가능한 CI 회귀 지표입니다. 실제 사용자 경험은 RUM p75를 최종 기준으로 판단합니다.

## 접근성 자동 검사

Vitest는 Testing Library로 실제 React 컴포넌트를 jsdom에 렌더링하고 axe-core 규칙을 실행합니다. 설정 화면은 스위치 조작, 저장 결과 안내, 자동 접근성 검사를 함께 검증합니다. jsdom에서 계산할 수 없는 색상 대비는 자동 검사에서 제외되므로 디자인 QA와 실제 브라우저 검증에서 별도로 확인합니다.
