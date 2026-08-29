import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  BellIcon,
  CalendarIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  GearIcon,
  GridIcon,
  HomeIcon,
  InfoCircledIcon,
  PaperPlaneIcon,
  PersonIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, MobileScroll } from "./mobile";

type TabId = "home" | "ledger" | "news" | "all";
type SheetId =
  | "building"
  | "evidence"
  | "maintenance"
  | "notifications"
  | "reminder"
  | "renewal";
type ExperimentVariant = "agenda-first" | "risk-first";
type SendState = "idle" | "sending" | "sent";

type EventName =
  | "building_changed"
  | "crm_guardrail_shown"
  | "experiment_exposure"
  | "maintenance_opened"
  | "nav_selected"
  | "overdue_reminder_sent"
  | "renewal_evidence_opened"
  | "renewal_request_sent"
  | "sheet_opened";

type AnalyticsEvent = {
  id: string;
  name: EventName;
  occurredAt: string;
  properties: Record<string, string | number | boolean>;
};

const EVENT_STORAGE_KEY = "jipjigi:analytics-events:v1";
const VARIANT_STORAGE_KEY = "jipjigi:briefing-variant:v1";
const EXPOSURE_SESSION_KEY = "jipjigi:briefing-exposure:v1";
const DEMO_CONTRACT_END_DATE = "2026-09-27";

const navItems: Array<{
  id: TabId;
  label: string;
  icon: ComponentType<{ width?: number; height?: number }>;
}> = [
  { id: "home", label: "홈", icon: HomeIcon },
  { id: "ledger", label: "임대 장부", icon: FileTextIcon },
  { id: "news", label: "소식", icon: ChatBubbleIcon },
  { id: "all", label: "전체", icon: GridIcon },
];

const buildings = [
  { name: "성수 리버하임", units: 19 },
  { name: "망원 포레", units: 8 },
];

function BrandLockup({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand-lockup ${small ? "brand-lockup-small" : "brand-lockup-hero"}`}>
      <svg className="brand-lockup-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="10" fill="currentColor" />
        <path d="m8.5 15.2 7.5-6.1 7.5 6.1M10.8 14.2v9h10.4v-9" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" />
        <path d="m13.1 18.3 2 2 4-4.2" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
      <span>집지기</span>
    </div>
  );
}

function initialVariant(): ExperimentVariant {
  const queryVariant = new URLSearchParams(window.location.search).get("variant");
  if (queryVariant === "agenda-first" || queryVariant === "risk-first") return queryVariant;

  try {
    const stored = window.localStorage.getItem(VARIANT_STORAGE_KEY);
    if (stored === "agenda-first" || stored === "risk-first") return stored;
  } catch {
    return "risk-first";
  }

  const assigned: ExperimentVariant = "risk-first";
  try {
    window.localStorage.setItem(VARIANT_STORAGE_KEY, assigned);
  } catch {
    // The prototype remains usable when storage is blocked or full.
  }
  return assigned;
}

function initialEvents(): AnalyticsEvent[] {
  try {
    const stored = window.localStorage.getItem(EVENT_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function showPortfolioTools() {
  return new URLSearchParams(window.location.search).get("portfolio") === "1";
}

export default function Prototype() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [activeSheet, setActiveSheet] = useState<SheetId | null>(null);
  const [building, setBuilding] = useState(buildings[0]);
  const [variant, setVariant] = useState<ExperimentVariant>(initialVariant);
  const [events, setEvents] = useState<AnalyticsEvent[]>(initialEvents);
  const [portfolioToolsVisible] = useState(showPortfolioTools);
  const [renewalState, setRenewalState] = useState<SendState>("idle");
  const [reminderState, setReminderState] = useState<SendState>("idle");
  const [maintenanceState, setMaintenanceState] = useState<"idle" | "requested">("idle");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);
  const actionTimer = useRef<number | null>(null);

  const track = useCallback((name: EventName, properties: AnalyticsEvent["properties"] = {}) => {
    const nextEvent: AnalyticsEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      occurredAt: new Date().toISOString(),
      properties,
    };

    setEvents((current) => {
      const next = [...current, nextEvent].slice(-40);
      try {
        window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Event collection is best-effort in the local prototype.
      }
      return next;
    });
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(EXPOSURE_SESSION_KEY) === variant) return;
      window.sessionStorage.setItem(EXPOSURE_SESSION_KEY, variant);
    } catch {
      // Continue with an in-memory exposure when session storage is unavailable.
    }
    track("experiment_exposure", {
      experiment: "home_briefing_priority_v1",
      variant,
    });
  }, [track, variant]);

  useEffect(() => {
    document.documentElement.dataset.jipjigiStatus = activeTab === "home" ? "dark" : "light";
    return () => {
      delete document.documentElement.dataset.jipjigiStatus;
    };
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
    };
  }, []);

  const openSheet = useCallback(
    (sheet: SheetId, source: string) => {
      setActiveSheet(sheet);
      track("sheet_opened", { sheet, source });
      if (sheet === "evidence") track("renewal_evidence_opened", { unit_id: "501" });
      if (sheet === "maintenance") track("maintenance_opened", { unit_id: "302" });
      if (sheet === "reminder") track("crm_guardrail_shown", { channel: "alimtalk", unit_id: "203" });
    },
    [track],
  );

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    track("nav_selected", { tab });
  };

  const changeVariant = (nextVariant: ExperimentVariant) => {
    setVariant(nextVariant);
    try {
      window.localStorage.setItem(VARIANT_STORAGE_KEY, nextVariant);
      window.sessionStorage.removeItem(EXPOSURE_SESSION_KEY);
    } catch {
      // The selected variant still applies to the current in-memory session.
    }
    showToast(nextVariant === "risk-first" ? "위험 우선 브리핑을 적용했어요" : "일정 우선 브리핑을 적용했어요");
  };

  const sendRenewalRequest = () => {
    setRenewalState("sending");
    if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
    actionTimer.current = window.setTimeout(() => {
      setRenewalState("sent");
      track("renewal_request_sent", {
        channel: "alimtalk",
        consent_checked: true,
        unit_id: "501",
      });
      showToast("501호 임차인에게 갱신 의사 확인을 요청했어요");
    }, 650);
  };

  const sendOverdueReminder = () => {
    setReminderState("sending");
    if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
    actionTimer.current = window.setTimeout(() => {
      setReminderState("sent");
      track("overdue_reminder_sent", {
        channel: "alimtalk",
        consent_checked: true,
        quiet_hours_applied: true,
        unit_id: "203",
      });
      showToast("203호 임차인에게 정중한 미납 안내를 보냈어요");
    }, 650);
  };

  const homeSections = useMemo(() => {
    const priority = (
      <PrioritySection
        key="priority"
        renewalState={renewalState}
        onEvidence={() => openSheet("evidence", "home_priority")}
        onRenewal={() => openSheet("renewal", "home_priority")}
      />
    );
    const agenda = (
      <AgendaSection
        key="agenda"
        maintenanceState={maintenanceState}
        reminderState={reminderState}
        onMaintenance={() => openSheet("maintenance", "home_agenda")}
        onReminder={() => openSheet("reminder", "home_agenda")}
      />
    );

    return variant === "risk-first" ? [priority, agenda] : [agenda, priority];
  }, [maintenanceState, openSheet, reminderState, renewalState, variant]);

  return (
    <div className="jipjigi-app">
      <MobileScroll key={activeTab} className="app-screen">
        <main className={`screen-content screen-${activeTab}`} aria-label="집지기 임대 관리 앱">
          {activeTab === "home" ? (
            <>
              <section className="home-hero" aria-labelledby="briefing-title">
                <div className="hero-topbar">
                  <BrandLockup />
                  <div className="hero-actions">
                    <button
                      className="icon-button icon-button-dark jj-focus"
                      type="button"
                      aria-label="알림 보기"
                      onClick={() => openSheet("notifications", "hero")}
                    >
                      <BellIcon width={23} height={23} />
                      <span className="notification-dot" aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button icon-button-dark jj-focus"
                      type="button"
                      aria-label="전체 메뉴 보기"
                      onClick={() => selectTab("all")}
                    >
                      <PersonIcon width={24} height={24} />
                    </button>
                  </div>
                </div>

                <p className="hero-date">{formatCurrentDate()}</p>
                <button
                  className="building-selector jj-focus"
                  type="button"
                  aria-label={`현재 건물 ${building.name}. 건물 바꾸기`}
                  onClick={() => openSheet("building", "hero")}
                >
                  <HomeIcon width={20} height={20} aria-hidden="true" />
                  <span>{building.name}</span>
                  <ChevronDownIcon width={19} height={19} aria-hidden="true" />
                </button>

                <div className="hero-copy">
                  <p>오늘의 운영 브리핑</p>
                  <h1 id="briefing-title">
                    먼저 확인할 일 <strong>1건</strong>
                  </h1>
                  <div className="stable-message">
                    <span className="stable-icon"><CheckIcon width={15} height={15} /></span>
                    <span>그 밖의 계약 만료 위험은 없어요</span>
                  </div>
                </div>
              </section>

              <div className="home-main">
                {homeSections}
                <button
                  className="collection-summary jj-focus"
                  type="button"
                  onClick={() => selectTab("ledger")}
                  aria-label="8월 임대료 수납 상세 보기"
                >
                  <span className="won-icon" aria-hidden="true">₩</span>
                  <span>8월 임대료</span>
                  <strong><em>17</em> / 18건 수납</strong>
                  <ChevronRightIcon width={20} height={20} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : null}

          {activeTab === "ledger" ? <LedgerScreen /> : null}
          {activeTab === "news" ? <NewsScreen onNotifications={() => openSheet("notifications", "news")} /> : null}
          {activeTab === "all" ? (
            <AllScreen
              events={events}
              variant={variant}
              showExperimentTools={portfolioToolsVisible}
              onVariantChange={changeVariant}
              onBuilding={() => openSheet("building", "settings")}
            />
          ) : null}
        </main>
      </MobileScroll>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = activeTab === item.id;
          return (
            <button
              key={item.id}
              className="nav-item jj-focus"
              type="button"
              data-selected={selected ? "true" : "false"}
              aria-current={selected ? "page" : undefined}
              onClick={() => selectTab(item.id)}
            >
              <Icon width={22} height={22} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <BottomSheet
        open={activeSheet !== null}
        onOpenChange={(open) => {
          if (!open) setActiveSheet(null);
        }}
        title={sheetTitle(activeSheet)}
        description={sheetDescription(activeSheet)}
        snap={activeSheet === "renewal" || activeSheet === "reminder" ? 0.72 : 0.62}
      >
        {activeSheet === "renewal" ? (
          <RenewalSheet state={renewalState} onSend={sendRenewalRequest} onDone={() => setActiveSheet(null)} />
        ) : null}
        {activeSheet === "evidence" ? <EvidenceSheet /> : null}
        {activeSheet === "reminder" ? (
          <ReminderSheet state={reminderState} onSend={sendOverdueReminder} onDone={() => setActiveSheet(null)} />
        ) : null}
        {activeSheet === "maintenance" ? (
          <MaintenanceSheet
            requested={maintenanceState === "requested"}
            onRequest={() => {
              setMaintenanceState("requested");
              showToast("누수 수리 요청을 접수했어요");
            }}
          />
        ) : null}
        {activeSheet === "building" ? (
          <BuildingSheet
            selected={building.name}
            onSelect={(nextBuilding) => {
              setBuilding(nextBuilding);
              setActiveSheet(null);
              track("building_changed", { building_name: nextBuilding.name });
              showToast(`${nextBuilding.name}으로 바꿨어요`);
            }}
          />
        ) : null}
        {activeSheet === "notifications" ? <NotificationsSheet /> : null}
      </BottomSheet>

      <div className="app-toast" data-visible={toast ? "true" : "false"} role="status" aria-live="polite">
        <CheckCircledIcon width={18} height={18} aria-hidden="true" />
        <span>{toast}</span>
      </div>
    </div>
  );
}

function PrioritySection({
  renewalState,
  onEvidence,
  onRenewal,
}: {
  renewalState: SendState;
  onEvidence: () => void;
  onRenewal: () => void;
}) {
  return (
    <section className="priority-section" aria-labelledby="priority-title">
      <h2 id="priority-title">먼저 확인할 일</h2>
      <div className="risk-row">
        <span className="risk-icon" aria-hidden="true">
          <img src="/assets/jipjigi/priority-renewal-icon.png" width="88" height="88" alt="" />
        </span>
        <div className="risk-copy">
          <h3>501호 계약 만료까지 <strong>{contractDaysLeft()}일</strong> 남았어요</h3>
          <span className="risk-badge">{renewalState === "sent" ? "응답 대기" : "확인 필요"}</span>
          <p>{renewalState === "sent" ? "임차인의 답변을 기다리고 있어요" : "갱신 의사를 아직 확인하지 않았어요"}</p>
          <button className="text-action jj-focus" type="button" onClick={onEvidence}>
            먼저 확인하는 이유 <ChevronRightIcon width={16} height={16} />
          </button>
        </div>
      </div>
      <button className="primary-action jj-focus" type="button" onClick={onRenewal}>
        {renewalState === "sent" ? <CheckCircledIcon width={20} height={20} /> : null}
        {renewalState === "sent" ? "요청 상태 보기" : "갱신 의사 확인하기"}
      </button>
    </section>
  );
}

function AgendaSection({
  maintenanceState,
  reminderState,
  onMaintenance,
  onReminder,
}: {
  maintenanceState: "idle" | "requested";
  reminderState: SendState;
  onMaintenance: () => void;
  onReminder: () => void;
}) {
  return (
    <section className="agenda-section" aria-labelledby="agenda-title">
      <h2 id="agenda-title">오늘 일정</h2>
      <div className="timeline">
        <button className="timeline-row jj-focus" type="button" onClick={onMaintenance}>
          <span className="timeline-time timeline-time-alert">오전<strong>9:30</strong></span>
          <span className="timeline-marker timeline-marker-alert" aria-hidden="true" />
          <span className="timeline-label">
            302호 세면대 누수 점검
            {maintenanceState === "requested" ? <small>수리 요청 접수 완료</small> : null}
          </span>
          <ChevronRightIcon width={18} height={18} aria-hidden="true" />
        </button>
        <button className="timeline-row jj-focus" type="button" onClick={onReminder}>
          <span className="timeline-time timeline-time-safe">오후<strong>6:00</strong></span>
          <span className="timeline-marker timeline-marker-safe" aria-hidden="true" />
          <span className="timeline-label">
            203호 월세 5일 연체
            {reminderState === "sent" ? <small>안내 발송 완료</small> : null}
          </span>
          <span className="timeline-action">{reminderState === "sent" ? "발송 완료" : "안내 보내기"}</span>
        </button>
      </div>
    </section>
  );
}

function LedgerScreen() {
  const rows = [
    { unit: "101호", amount: "720,000원", status: "납부 완료", tone: "paid" },
    { unit: "203호", amount: "780,000원", status: "5일 연체", tone: "late" },
    { unit: "302호", amount: "850,000원", status: "납부 완료", tone: "paid" },
  ];

  return (
    <section className="secondary-screen" aria-labelledby="ledger-title">
      <SecondaryHeader eyebrow="2026년 8월" title="임대 장부" />
      <div className="ledger-hero">
        <span>이번 달 수납</span>
        <strong>12,840,000원</strong>
        <p>19건 중 17건이 수납됐어요</p>
      </div>
      <div className="secondary-section">
        <div className="section-title-row"><h2 id="ledger-title">호실별 현황</h2><span>최근 업데이트 18:02</span></div>
        <div className="ledger-list">
          {rows.map((row) => (
            <button className="ledger-row jj-focus" type="button" key={row.unit}>
              <span><strong>{row.unit}</strong><small>{row.amount}</small></span>
              <em data-tone={row.tone}>{row.status}</em>
              <ChevronRightIcon width={18} height={18} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsScreen({ onNotifications }: { onNotifications: () => void }) {
  return (
    <section className="secondary-screen" aria-labelledby="news-title">
      <SecondaryHeader eyebrow="임대 운영 알림" title="소식" />
      <div className="secondary-section">
        <h2 id="news-title">새 소식 2건</h2>
        <button className="news-card jj-focus" type="button" onClick={onNotifications}>
          <span className="news-icon"><BellIcon width={20} height={20} /></span>
          <span><strong>501호 계약 만료 알림</strong><small>갱신 의사 확인이 필요한 시점이에요</small></span>
          <ChevronRightIcon width={18} height={18} />
        </button>
        <button className="news-card jj-focus" type="button">
          <span className="news-icon news-icon-green"><CheckCircledIcon width={20} height={20} /></span>
          <span><strong>8월 수납률 89%</strong><small>지난달 같은 날보다 6%p 높아요</small></span>
          <ChevronRightIcon width={18} height={18} />
        </button>
      </div>
      <div className="guardrail-note">
        <InfoCircledIcon width={18} height={18} />
        <p><strong>원하는 알림만 보내드려요</strong> 수신 동의와 야간 발송 제한, 채널별 수신 해제 설정을 모두 반영합니다.</p>
      </div>
    </section>
  );
}

function AllScreen({
  events,
  variant,
  showExperimentTools,
  onVariantChange,
  onBuilding,
}: {
  events: AnalyticsEvent[];
  variant: ExperimentVariant;
  showExperimentTools: boolean;
  onVariantChange: (variant: ExperimentVariant) => void;
  onBuilding: () => void;
}) {
  return (
    <section className="secondary-screen" aria-labelledby="settings-title">
      <SecondaryHeader eyebrow="설정과 실험" title="전체" />
      <div className="secondary-section">
        <h2 id="settings-title">관리 설정</h2>
        <button className="settings-row jj-focus" type="button" onClick={onBuilding}>
          <HomeIcon width={20} height={20} /><span><strong>관리 건물</strong><small>성수 리버하임 외 1개</small></span><ChevronRightIcon width={18} height={18} />
        </button>
        <button className="settings-row jj-focus" type="button">
          <BellIcon width={20} height={20} /><span><strong>알림 설정</strong><small>수신 동의 확인, 야간 발송 제한 사용</small></span><ChevronRightIcon width={18} height={18} />
        </button>
      </div>
      {showExperimentTools ? <div className="experiment-panel">
        <div className="experiment-heading">
          <span><GearIcon width={18} height={18} /> 포트폴리오 실험 모드</span>
          <small>노출 이벤트 {events.filter((event) => event.name === "experiment_exposure").length}회</small>
        </div>
        <p>홈 브리핑의 정보 순서가 행동 완료율에 미치는 영향을 확인합니다.</p>
        <div className="variant-control" role="group" aria-label="홈 브리핑 실험안">
          <button className="jj-focus" type="button" data-selected={variant === "risk-first"} onClick={() => onVariantChange("risk-first")}>위험 우선</button>
          <button className="jj-focus" type="button" data-selected={variant === "agenda-first"} onClick={() => onVariantChange("agenda-first")}>일정 우선</button>
        </div>
        <small>실제 서비스에서는 사용자별로 같은 실험안을 유지하고 서버에 노출 기록을 남깁니다.</small>
      </div> : null}
    </section>
  );
}

function SecondaryHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="secondary-header">
      <BrandLockup small />
      <p>{eyebrow}</p>
      <h1>{title}</h1>
    </header>
  );
}

function RenewalSheet({ state, onSend, onDone }: { state: SendState; onSend: () => void; onDone: () => void }) {
  if (state === "sent") {
    return <SuccessState title="확인 요청을 보냈어요" description="임차인의 답변이 오면 바로 알려드릴게요." onDone={onDone} />;
  }

  return (
    <div className="sheet-stack">
      <dl className="detail-list">
        <div><dt>계약 만료일</dt><dd>2026년 9월 27일</dd></div>
        <div><dt>현재 월세</dt><dd>1,250,000원</dd></div>
      </dl>
      <div className="message-preview">
        <span>임차인에게 보낼 내용</span>
        <p>안녕하세요. 501호 계약 만료일이 다가와 갱신 의사를 여쭙습니다. 편하실 때 답변해 주세요.</p>
      </div>
      <div className="guardrail-inline"><CheckIcon width={16} height={16} /><span>수신 동의와 야간 발송 제한을 확인했어요</span></div>
      <button className="sheet-primary jj-focus" type="button" disabled={state === "sending"} onClick={onSend}>
        {state === "sending" ? <ReloadIcon className="spin-icon" width={18} height={18} /> : <PaperPlaneIcon width={18} height={18} />}
        {state === "sending" ? "보내는 중" : "확인 요청 보내기"}
      </button>
    </div>
  );
}

function ReminderSheet({ state, onSend, onDone }: { state: SendState; onSend: () => void; onDone: () => void }) {
  if (state === "sent") {
    return <SuccessState title="미납 안내를 보냈어요" description="정중한 기본 문구로 한 차례만 보냈어요." onDone={onDone} />;
  }

  return (
    <div className="sheet-stack">
      <div className="message-preview">
        <span>알림톡 미리보기</span>
        <p>안녕하세요. 8월 월세 입금 내역이 아직 확인되지 않아 안내드립니다. 이미 납부하셨다면 별도로 답변하지 않으셔도 됩니다.</p>
      </div>
      <dl className="detail-list">
        <div><dt>연체 기간</dt><dd>5일</dd></div>
        <div><dt>안내 횟수</dt><dd>이번 달 0회</dd></div>
      </dl>
      <div className="guardrail-inline"><CheckIcon width={16} height={16} /><span>수신을 거부한 임차인은 제외하고 오후 9시 이후에는 예약 발송해요</span></div>
      <button className="sheet-primary jj-focus" type="button" disabled={state === "sending"} onClick={onSend}>
        {state === "sending" ? <ReloadIcon className="spin-icon" width={18} height={18} /> : <PaperPlaneIcon width={18} height={18} />}
        {state === "sending" ? "보내는 중" : "정중한 안내 보내기"}
      </button>
    </div>
  );
}

function EvidenceSheet() {
  return (
    <div className="evidence-list">
      <div><CalendarIcon width={18} height={18} /><span><strong>계약 만료까지 {contractDaysLeft()}일</strong><small>갱신 협의를 시작하기 좋은 시점이에요</small></span></div>
      <div><ClockIcon width={18} height={18} /><span><strong>최근 대화 79일 전</strong><small>갱신 의사에 관한 기록이 없어요</small></span></div>
      <div><InfoCircledIcon width={18} height={18} /><span><strong>확률 점수는 사용하지 않아요</strong><small>확인 가능한 운영 사실만 근거로 보여드려요</small></span></div>
    </div>
  );
}

function MaintenanceSheet({ requested, onRequest }: { requested: boolean; onRequest: () => void }) {
  return (
    <div className="sheet-stack">
      <div className="maintenance-note"><span>임차인 메모</span><p>세면대 아래로 물이 계속 떨어져요. 수도 밸브는 잠가두었습니다.</p></div>
      <dl className="detail-list"><div><dt>접수 시각</dt><dd>오늘 오전 9:12</dd></div><div><dt>권장 대응</dt><dd>24시간 이내 점검</dd></div></dl>
      <button className="sheet-primary jj-focus" type="button" disabled={requested} onClick={onRequest}>
        {requested ? <CheckCircledIcon width={18} height={18} /> : <CalendarIcon width={18} height={18} />}
        {requested ? "수리 요청 접수 완료" : "수리 업체 연결 요청"}
      </button>
    </div>
  );
}

function BuildingSheet({ selected, onSelect }: { selected: string; onSelect: (building: typeof buildings[number]) => void }) {
  return (
    <div className="building-list">
      {buildings.map((item) => (
        <button className="building-option jj-focus" type="button" key={item.name} onClick={() => onSelect(item)}>
          <span className="building-option-icon"><HomeIcon width={19} height={19} /></span>
          <span><strong>{item.name}</strong><small>{item.units}개 호실 관리 중</small></span>
          {selected === item.name ? <CheckCircledIcon width={20} height={20} /> : <ChevronRightIcon width={18} height={18} />}
        </button>
      ))}
    </div>
  );
}

function NotificationsSheet() {
  return (
    <div className="notification-list">
      <div><span className="notification-mark" /><p><strong>501호 계약 만료까지 {contractDaysLeft()}일</strong><small>오늘 갱신 의사를 확인해 보세요</small></p></div>
      <div><span className="notification-mark notification-mark-green" /><p><strong>302호 누수 요청 접수</strong><small>12분 전에 임차인 메모가 도착했어요</small></p></div>
    </div>
  );
}

function SuccessState({ title, description, onDone }: { title: string; description: string; onDone: () => void }) {
  return (
    <div className="success-state">
      <CheckCircledIcon width={42} height={42} />
      <strong>{title}</strong>
      <p>{description}</p>
      <button className="sheet-primary jj-focus" type="button" onClick={onDone}>완료</button>
    </div>
  );
}

function sheetTitle(sheet: SheetId | null) {
  switch (sheet) {
    case "building": return "관리 건물 선택";
    case "evidence": return "먼저 확인하는 이유";
    case "maintenance": return "302호 누수 접수";
    case "notifications": return "알림";
    case "reminder": return "203호 미납 안내";
    case "renewal": return "501호 갱신 의사 확인";
    default: return "집지기";
  }
}

function sheetDescription(sheet: SheetId | null) {
  switch (sheet) {
    case "building": return "브리핑에서 확인할 건물을 바꿀 수 있어요.";
    case "evidence": return "예측값이 아닌 확인 가능한 운영 데이터만 사용합니다.";
    case "maintenance": return "임차인의 요청 내용과 권장 대응을 확인하세요.";
    case "notifications": return "꼭 필요한 운영 소식만 모아봤어요.";
    case "reminder": return "발송 전 문구와 발송 조건을 확인하세요.";
    case "renewal": return "임차인에게 보낼 내용을 확인하세요.";
    default: return undefined;
  }
}

function formatCurrentDate() {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

function contractDaysLeft() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const dayInMilliseconds = 86_400_000;
  return Math.max(0, Math.round((Date.parse(`${DEMO_CONTRACT_END_DATE}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayInMilliseconds));
}
