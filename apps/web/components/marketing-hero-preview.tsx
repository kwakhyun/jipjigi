import Image from "next/image";
import { CheckCircledIcon, ClockIcon, GearIcon, PaperPlaneIcon } from "@radix-ui/react-icons";

const previewTasks = [
  { title: "501호 계약 만료", description: "공실이 생기기 전에 갱신 의사를 확인하세요.", status: "27일 남음", tone: "coral", Icon: ClockIcon },
  { title: "203호 월세 미납", description: "미납 금액 98만원, 납부 안내가 필요해요.", status: "6일 지남", tone: "purple", Icon: PaperPlaneIcon },
  { title: "302호 수리 요청", description: "욕실 수전 누수, 방문 일정을 잡아주세요.", status: "일정 대기", tone: "neutral", Icon: GearIcon },
] as const;

export function MarketingHeroPreview() {
  return (
    <figure className="marketing-visual" aria-label="집지기 오늘의 브리핑 미리보기">
      <div className="marketing-preview-card">
        <div className="preview-building">
          <div>
            <span className="preview-eyebrow">오늘의 운영 브리핑</span>
            <h2>성수 리버하임</h2>
            <p>서울 성동구 <span aria-hidden="true">/</span> 총 19세대</p>
          </div>
          <Image className="preview-building-image" src="/assets/jipjigi/hero-night-building.jpg" width={72} height={72} sizes="72px" alt="" />
        </div>

        <dl className="preview-metrics" aria-label="샘플 건물 운영 지표">
          <div><dt>이달 수납률</dt><dd>95.1<span>%</span></dd></div>
          <div><dt>입주 현황</dt><dd>18<span>/ 19세대</span></dd></div>
          <div><dt>진행 중 수리</dt><dd>1<span>건</span></dd></div>
        </dl>

        <div className="preview-tasks">
          <div className="preview-tasks-heading"><h3>오늘 챙길 일</h3><span>{previewTasks.length}건</span></div>
          <ul aria-label="확인이 필요한 일">
            {previewTasks.map(({ title, description, status, tone, Icon }) => (
              <li className={`preview-task preview-task-${tone}`} key={title}>
                <span className="preview-task-icon" aria-hidden="true"><Icon width={18} height={18} /></span>
                <div className="preview-task-copy"><strong>{title}</strong><p>{description}</p></div>
                <span className="preview-task-status">{status}</span>
              </li>
            ))}
          </ul>
          <p className="preview-safety-note"><CheckCircledIcon width={15} height={15} aria-hidden="true" />발송 전 수신 동의와 시간을 먼저 확인해요.</p>
        </div>
      </div>
      <figcaption>가상 건물과 샘플 데이터로 구성한 미리보기입니다.</figcaption>
    </figure>
  );
}
