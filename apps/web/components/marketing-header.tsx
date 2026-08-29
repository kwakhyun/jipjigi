import Link from "next/link";
import { BrandLockup } from "@/components/brand-lockup";

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <Link href="/" aria-label="집지기 홈"><BrandLockup /></Link>
      <nav aria-label="소개 메뉴"><Link href="/#capabilities">기능</Link><Link href="/rental-management/seongsu">지역 가이드</Link><Link className="button button-primary button-small" href="/login?mode=owner">운영 데모 열기</Link></nav>
    </header>
  );
}
