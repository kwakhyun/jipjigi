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
  context: {
    releaseVersion: string;
    experimentKey: string | null;
    variant: string | null;
    userSegment: string;
  };
  properties: TProperties;
};
```

브라우저 이벤트의 `eventId`는 클라이언트에서 만들고 서버의 기본 키와 `INSERT OR IGNORE`로 중복 제거합니다. 변경 작업과 웹훅 이벤트는 서버가 ID를 만듭니다. 릴리스 버전은 서버 환경에서 확정하고, 인증 사용자 ID, 사용자 세그먼트와 실험 배정도 서버가 다시 확인한 뒤 수신 시각을 덧붙입니다. 개인정보 원문, 주소, 전화번호, 메시지 본문은 이벤트에 넣지 않습니다.

`POST /api/events`는 `page_viewed`, `experiment_exposed`, `briefing_opened`, `risk_evidence_opened`, `seo_cta_clicked`만 허용합니다. 익명 접근은 SEO 클릭만 허용하며, 나머지는 인증이 필요합니다. 완료와 전달 이벤트는 내부 서버 저장 경로에서만 기록합니다. 실험 키와 실험안은 봉투와 노출 속성 모두 서버 배정으로 확정하며 배정 없는 노출은 거부합니다. 브라우저 이벤트는 24시간보다 오래됐거나 5분 이상 미래이면 거부합니다.

## 2. 이름 규칙

- 완료된 사실을 과거형으로 기록합니다. 예: `renewal_started`
- 화면 노출과 사용자 클릭을 구분합니다.
- 의미가 다른 이벤트를 하나의 `button_clicked`로 합치지 않습니다.
- 속성 이름은 `snake_case`를 사용합니다.
- 금액은 통화와 최소 단위를 명시합니다. 예: `amount_krw`

## 3. 핵심 이벤트

| 이벤트 | 발생 시점 | 필수 속성 | 중복 방지 |
|---|---|---|---|
| `page_viewed` | 인증 화면의 경로가 바뀐 뒤 | 없음 | 1.5초 내 같은 경로 클라이언트 중복 억제 |
| `experiment_exposed` | 배정된 브리핑 UI가 실제 렌더된 직후 | experiment_key, variant, risk_type, risk_signal_id | 세션 저장소 + eventId |
| `briefing_opened` | 사용자가 관리 건물을 바꾼 뒤 | building_id, source | eventId |
| `risk_evidence_opened` | 위험 카드의 판단 근거를 펼친 뒤 | risk_type, entity id, source | eventId |
| `renewal_started` | 서버가 갱신 확인 요청을 수락한 뒤 | lease_id, channel | 메시지 idempotencyKey + eventId |
| `overdue_notice_requested` | 서버가 미납 안내를 수락한 뒤 | charge_id, channel | 메시지 idempotencyKey + eventId |
| `payment_marked` | 청구가 납부 완료로 바뀐 뒤 | charge_id, outcome=paid | 서버 상태 + eventId |
| `maintenance_updated` | 수리 처리 단계가 바뀐 뒤 | request_id, outcome | 서버 상태 + eventId |
| `notification_preferences_updated` | 서버가 알림 설정 변경을 저장한 뒤 | outcome, source | 서버 상태 + eventId |
| `crm_message_requested` | 서버가 메시지 요청을 접수, 예약 또는 차단한 뒤 | message_id, channel, outcome, entity id | 서버 멱등 키 + eventId |
| `crm_guardrail_blocked` | 동의 또는 빈도 제한으로 발송이 차단된 뒤 | channel, reason, entity id | 메시지 idempotencyKey + eventId |
| `crm_message_delivery_updated` | 서명된 공급자 웹훅으로 전달 또는 실패 상태가 바뀐 뒤 | message_id, provider_status, retry_count | 공급자 상태 + eventId |
| `crm_message_retry_requested` | 실패한 메시지를 같은 기록에서 다시 접수한 뒤 | message_id, retry_count, outcome | 메시지 ID + retry_count |
| `crm_opted_out` | 공급자 웹훅으로 임차인의 채널 수신 해제를 확인한 뒤 | lease_id, channel | lease_id + channel |
| `renewal_response_recorded` | 갱신 요청에 대한 임차인 응답 웹훅을 저장한 뒤 | lease_id, response | dispatch + response + provider time |
| `seo_cta_clicked` | 지역 랜딩의 전환 CTA를 누른 뒤 | source | eventId |

## 4. 구현 위치

프로덕션 웹앱은 `packages/analytics`의 Zod 스키마를 공유하고, `POST /api/events`에서 인증 사용자, 시간 유효성, 요청 제한을 확인합니다. 서버는 아래 속성만 보존합니다.

```text
building_id, unit_id, lease_id, charge_id, request_id,
message_id, risk_signal_id, risk_type, reason_code,
experiment_key, variant, source, channel, outcome, reason,
template_version, consent_checked, quiet_hours_applied,
provider_status, retry_count, billing_period, response
```

그 밖의 키는 값과 함께 버립니다. 보호된 `prototype`은 시각 검증을 위해 별도 로컬 이벤트를 유지하지만 프로덕션 지표에는 합치지 않습니다.

이벤트별 필수 속성과 상태 열거형도 Zod로 검사합니다. 키 허용 목록은 개인정보 내용을 판별하는 범용 마스킹 도구가 아니므로, 앱은 식별자와 범주형 값만 생성하고 자유 입력 내용을 분석 속성에 전달하지 않습니다.

## 5. 속성 사전

| 속성 | 형식 | 설명 |
|---|---|---|
| `building_id` | string | 내부 무작위 식별자 |
| `lease_id` | string | 계약 내부 식별자 |
| `charge_id` | string | 청구월 단위 식별자 |
| `risk_signal_id` | string | 위험 신호 식별자 |
| `reason_code` | enum | `lease_expiring`, `payment_overdue`, `maintenance_urgent` |
| `risk_type` | enum | `lease_expiring`, `payment_overdue`, `maintenance_urgent`, 표시할 위험이 없으면 `none` |
| `channel` | enum | 스키마는 `sandbox_alimtalk`, `push`를 허용. 현재 발송 요청은 샌드박스만 사용하며 실제 채널은 미연동 |
| `template_version` | string | 승인된 메시지 템플릿 버전 |
| `consent_checked` | boolean | 발송 시점 동의 스냅샷 확인 여부 |
| `quiet_hours_applied` | boolean | 야간 제한 적용 여부 |
| `source` | string | 1~80자. `home_priority`, `building_switcher`, `settings`, `district_seongsu_hero` 등 호출 위치 |

## 6. 퍼널 쿼리 기준

브리핑 실험의 기본 퍼널은 사용자 단위로 계산합니다.

```text
experiment_exposed
  → renewal_started or overdue_notice_requested or maintenance_updated or payment_marked
```

- 최근 7일 중 첫 노출 뒤 24시간 안에 같은 실험 키와 실험안으로 조치한 고유 사용자를 핵심 전환으로 인정합니다.
- `briefing_opened`는 건물 변경을 뜻하므로 필수 전환 단계가 아닙니다. 실제 메시지 전달은 별도 지표입니다.
- 여러 기기에서 발생한 이벤트는 서버가 저장한 `user_id`로 합칩니다.
- 서로 다른 변형에 노출된 사용자는 분석에서 제외합니다. 배정 오류를 별도 집계하는 관제는 후속입니다.
- 발송 요청과 실제 전달 성공을 같은 이벤트로 합치지 않습니다.

## 7. CRM 가드레일 쿼리

```text
delivery rate = delivered dispatches / accepted dispatches
opt-out rate = contracts opted out after delivery within 7d / delivered contracts
blocked rate = blocked dispatches / all requested dispatches
```

전달률과 차단률은 최근 7일 접수한 메시지 기준입니다. 수신 해제율은 최근 7일 전달된 계약 중 같은 채널에서 전달 이후 7일 이내 해제한 계약을 집계합니다. 전달 전 해제, 미래 시각, 다른 채널은 제외합니다. 아직 7일이 지나지 않은 계약도 포함하는 잠정 지표이며 사람 수와 구분합니다. 클릭률, 발송 후 수납률, 중복 전달률과 불만율은 후속 분석 대상입니다.

## 8. QA 체크리스트

1. 동일 세션에서 실험 노출이 한 번만 기록됩니다.
2. 화면을 실제로 보지 않은 사용자는 노출로 기록되지 않습니다.
3. 발송 실패를 `sent`로 기록하지 않습니다.
4. 멱등 키 재시도는 분석 이벤트를 중복 생성하지 않습니다.
5. 이벤트 속성에 주소, 전화번호, 메시지 본문이 포함되지 않습니다.
6. 현재 웹과 서버 이벤트가 같은 `packages/analytics` 스키마를 사용합니다.
7. React Native 도입 시 같은 스키마 버전과 호환성 테스트를 사용합니다.
8. 운영 웨어하우스 도입 시 스테이징 이벤트를 별도 데이터셋으로 분리합니다.

## 9. 보존과 변경

- 원시 이벤트는 접근 권한을 제한하고 보존 기간을 명시합니다.
- 스키마 변경은 버전을 올리고 소비자 쿼리 호환성을 확인합니다.
- 실험 종료 뒤 필요 없는 고카디널리티 속성은 제거합니다.
- 대시보드 정의와 코드의 이벤트 타입을 같은 PR에서 변경합니다.
