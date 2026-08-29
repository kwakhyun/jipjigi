import Link from "next/link";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { getOptionalSession } from "@/lib/auth/dal";

export default async function NotFound() {
  const session = await getOptionalSession();
  const destination = session?.role === "operator" ? "/app/growth" : session ? "/app" : "/";
  const label = session ? "운영 화면으로 돌아가기" : "홈으로 돌아가기";
  return <main className="route-state"><span className="state-symbol">404</span><h1>요청하신 화면을 찾을 수 없어요</h1><p>주소가 변경되었거나 더 이상 제공하지 않는 화면일 수 있어요.</p><Link className="button button-primary" href={destination}><ArrowLeftIcon /> {label}</Link></main>;
}
