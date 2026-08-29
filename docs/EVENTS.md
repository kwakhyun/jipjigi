# 이벤트 택소노미

## 1. 이벤트 공통 봉투

모든 이벤트는 다음 공통 필드를 갖습니다.

```ts
type ProductEvent<TName extends EventName, TProperties> = {
  eventId: string;
  name: TName;
  occurredAt: string;
  anonymousId: string;
  sessionId: string;
  path: string;
  properties: TProperties;
};
```

`eventId`는 클라이언트에서 만들고 서버의 기본 키와 `INSERT OR IGNORE`로 중복 제거합니다. 인증 사용자 ID와 수신 시각은 서버가 덧붙입니다. 개인정보 원문, 주소, 전화번호, 메시지 본문은 이벤트에 넣지 않습니다.

## 2. 이름 규칙

- 완료된 사실을 과거형으로 기록합니다. 예: `renewal_request_sent`
- 화면 노출과 사용자 클릭을 구분합니다.
- 의미가 다른 이벤트를 하나의 `button_clicked`로 합치지 않습니다.
- 속성 이름은 `snake_case`를 사용합니다.
- 금액은 통화와 최소 단위를 명시합니다. 예: `amount_krw`

## 3. 핵심 이벤트

| 이벤트 | 발생 시점 | 필수 속성 | 중복 방지 |
|---|---|---|---|
| `page_viewed` | 인증 화면의 경로가 바뀐 뒤 | 없음 | 1.5초 내 같은 경로 클라이언트 중복 억제 |
| `experiment_exposed` | 배정된 브리핑 UI가 실제 렌더된 직후 | experiment_key, variant | 세션 저장소 + eventId |
| `briefing_opened` | 사용자가 관리 건물을 바꾼 뒤 | building_id, source | eventId |
| `renewal_started` | 서버가 갱신 확인 요청을 수락한 뒤 | lease_id, channel | 메시지 idempotencyKey + eventId |
| `overdue_notice_requested` | 서버가 미납 안내를 수락한 뒤 | charge_id, channel | 메시지 idempotencyKey + eventId |
| `payment_marked` | 청구가 납부 완료로 바뀐 뒤 | charge_id, unit_id, outcome | 서버 상태 + eventId |
| `maintenance_updated` | 수리 처리 단계가 바뀐 뒤 | request_id, outcome | 서버 상태 + eventId |
| `crm_message_dispatched` | 메시지 센터에서 요청 결과를 받은 뒤 | channel, outcome, entity id | 메시지 idempotencyKey + eventId |
| `crm_guardrail_blocked` | 동의 또는 빈도 제한으로 발송이 차단된 뒤 | channel, reason, entity id | 메시지 idempotencyKey + eventId |
| `seo_cta_clicked` | 지역 랜딩의 전환 CTA를 누른 뒤 | source | eventId |

## 4. 구현 위치

프로덕션 웹앱은 `packages/analytics`의 Zod 스키마를 공유하고, `POST /api/events`에서 인증 사용자, 시간 유효성, 요청 제한을 확인합니다. 서버는 아래 속성만 보존합니다.

```text
building_id, unit_id, lease_id, charge_id, request_id,
experiment_key, variant, source, channel, outcome, reason
```

그 밖의 키는 값과 함께 버립니다. 보호된 `prototype`은 시각 검증을 위해 별도 로컬 이벤트를 유지하지만 프로덕션 지표에는 합치지 않습니다.

## 5. 속성 사전

| 속성 | 형식 | 설명 |
|---|---|---|
| `building_id` | string | 내부 무작위 식별자 |
| `lease_id` | string | 계약 내부 식별자 |
| `charge_id` | string | 청구월 단위 식별자 |
| `risk_signal_id` | string | 위험 신호 식별자 |
| `reason_code` | enum | `lease_expiring`, `payment_overdue`, `maintenance_urgent` |
| `channel` | enum | `push`, `alimtalk`, `in_app` |
| `template_version` | string | 승인된 메시지 템플릿 버전 |
| `consent_checked` | boolean | 발송 시점 동의 스냅샷 확인 여부 |
| `quiet_hours_applied` | boolean | 야간 제한 적용 여부 |
| `source` | enum | `home_priority`, `home_agenda`, `notification`, `ledger` |

## 6. 퍼널 쿼리 기준

브리핑 실험의 기본 퍼널은 사용자 단위로 계산합니다.

```text
experiment_exposed
  → briefing_opened
  → renewal_started or overdue_notice_requested or maintenance_updated
  → provider delivery webhook or payment_marked
```

- 첫 노출 뒤 24시간 안의 첫 행동만 핵심 전환으로 인정합니다.
- 여러 기기에서 발생한 이벤트는 `actor_id`로 합칩니다.
- 실험 배정 뒤 변형이 바뀐 사용자는 분석에서 제외하고 배정 오류로 별도 집계합니다.
- 발송 요청과 실제 전달 성공을 같은 이벤트로 합치지 않습니다.

## 7. CRM 가드레일 쿼리

```text
delivery rate = delivered dispatches / accepted dispatches
opt-out rate = users opted out within 7d / users delivered
duplicate rate = duplicate provider deliveries / delivered dispatches
complaint rate = CRM-related support cases / users delivered
```

클릭률과 수납률은 위 가드레일과 함께 표시합니다.

## 8. QA 체크리스트

1. 동일 세션에서 실험 노출이 한 번만 기록됩니다.
2. 화면을 실제로 보지 않은 사용자는 노출로 기록되지 않습니다.
3. 발송 실패를 `sent`로 기록하지 않습니다.
4. 멱등 키 재시도는 분석 이벤트를 중복 생성하지 않습니다.
5. 이벤트 속성에 주소, 전화번호, 메시지 본문이 포함되지 않습니다.
6. 웹과 앱이 같은 스키마 버전을 사용합니다.
7. 릴리스 전에 스테이징 이벤트가 별도 데이터셋으로 들어갑니다.

## 9. 보존과 변경

- 원시 이벤트는 접근 권한을 제한하고 보존 기간을 명시합니다.
- 스키마 변경은 버전을 올리고 소비자 쿼리 호환성을 확인합니다.
- 실험 종료 뒤 필요 없는 고카디널리티 속성은 제거합니다.
- 대시보드 정의와 코드의 이벤트 타입을 같은 PR에서 변경합니다.
