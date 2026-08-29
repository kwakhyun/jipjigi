import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRightIcon, CheckCircledIcon, HomeIcon, ReaderIcon } from "@radix-ui/react-icons";
import { MarketingHeader } from "@/components/marketing-header";
import { TrackedLink } from "@/components/tracked-link";

const districts = {
  seongsu: { name: "성수동", city: "서울 성동구", description: "오피스와 주거 수요가 함께 움직이는 성수동에서는 계약 만료와 공실 전환 시점을 미리 관리하는 것이 중요합니다." },
  mangwon: { name: "망원동", city: "서울 마포구", description: "소규모 다가구 주택이 많은 망원동에서는 입금 확인, 생활 수리, 계약 일정을 한곳에 모으면 반복 업무를 크게 줄일 수 있습니다." },
  yeonnam: { name: "연남동", city: "서울 마포구", description: "주거와 상권이 가까운 연남동에서는 임차인 경험을 해치지 않는 정중하고 일관된 운영 연락이 중요합니다." },
} as const;

type DistrictKey = keyof typeof districts;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(districts).map((district) => ({ district }));
}

export async function generateMetadata({ params }: { params: Promise<{ district: string }> }): Promise<Metadata> {
  const { district } = await params;
  const data = districts[district as DistrictKey];
  if (!data) notFound();
  return { title: `${data.name} 임대 관리 가이드`, description: `${data.city} 임대인을 위한 월세, 계약, 수리 운영 가이드` };
}

export default async function DistrictPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = await params;
  const data = districts[district as DistrictKey];
  if (!data) notFound();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${data.name} 임대 관리 가이드`,
    description: data.description,
    author: { "@type": "Organization", name: "렌트플로우" },
  };
  return (
    <main className="seo-page">
      <MarketingHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <section className="seo-hero"><span className="eyebrow">{data.city} 임대 운영 가이드</span><h1>{data.name} 건물 관리,<br />놓치기 쉬운 일부터 정리하세요.</h1><p>{data.description}</p><TrackedLink className="button button-primary button-large" href="/login?mode=owner" source={`district_${district}_hero`}>운영 데모 열기 <ArrowRightIcon /></TrackedLink></section>
      <section className="seo-guide-grid">
        <article><i><HomeIcon /></i><h2>입금 내역을 정확하게 확인하세요</h2><p>통장 메모 대신 호실과 계약별로 청구액, 납부일, 미납 여부를 기록합니다.</p><ul><li><CheckCircledIcon /> 월별 수납률</li><li><CheckCircledIcon /> 정중한 미납 안내</li></ul></article>
        <article><i><ReaderIcon /></i><h2>계약 만료 전에 미리 협의하세요</h2><p>만료가 가까운 계약을 순서대로 확인하고 현재 조건과 제안 근거를 함께 살펴봅니다.</p><ul><li><CheckCircledIcon /> 계약 만료일까지 남은 기간</li><li><CheckCircledIcon /> 갱신 의사 확인</li></ul></article>
      </section>
      <section className="seo-cta"><span>{data.name} 임대 운영을 시작할 준비가 됐나요?</span><h2>오늘 처리할 세 가지부터 확인해 보세요.</h2><TrackedLink className="button button-dark" href="/login?mode=owner" source={`district_${district}_footer`}>운영 데모 열기 <ArrowRightIcon /></TrackedLink></section>
    </main>
  );
}
