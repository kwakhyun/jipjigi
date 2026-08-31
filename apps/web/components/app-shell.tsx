"use client";

import type { ReactNode, ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChartIcon,
  ChatBubbleIcon,
  ClipboardIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  MixerHorizontalIcon,
} from "@radix-ui/react-icons";
import { cx } from "@jipjigi/ui";
import { BrandLockup } from "./brand-lockup";
import { PageAnalytics } from "./page-analytics";
import { SessionActions } from "./session-actions";
import type { BriefingVariant } from "@jipjigi/experiments";
import { demoLabels, roleLabels } from "@/lib/auth/navigation";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: ComponentType<{ width?: number; height?: number; "aria-hidden"?: boolean | "true" | "false" }>;
};

const primaryNavigation: NavItem[] = [
  { href: "/app", label: "오늘의 브리핑", mobileLabel: "홈", icon: HomeIcon },
  { href: "/app/ledger", label: "임대 장부", mobileLabel: "장부", icon: FileTextIcon },
  { href: "/app/contracts", label: "계약 관리", mobileLabel: "계약", icon: ClipboardIcon },
  { href: "/app/maintenance", label: "수리 요청", mobileLabel: "수리", icon: MixerHorizontalIcon },
  { href: "/app/messages", label: "메시지 센터", mobileLabel: "메시지", icon: ChatBubbleIcon },
];

const operatorNavigation: NavItem[] = [
  { href: "/app/growth", label: "그로스 관제", icon: BarChartIcon },
  { href: "/app/settings", label: "운영 설정", mobileLabel: "설정", icon: GearIcon },
];

const ownerSecondaryNavigation: NavItem[] = [
  { href: "/app/settings", label: "설정", icon: GearIcon },
];

function activePath(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname.startsWith(href);
}

export function AppShell({ children, user, demoEnabled = false, demoVariant }: { children: ReactNode; user: { name: string; email: string; role: "owner" | "operator" }; demoEnabled?: boolean; demoVariant?: BriefingVariant | null }) {
  const pathname = usePathname();
  const mainNavigation = user.role === "owner" ? primaryNavigation : operatorNavigation;
  const secondaryNavigation = user.role === "owner" ? ownerSecondaryNavigation : [];
  const homeHref = user.role === "owner" ? "/app" : "/app/growth";
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <PageAnalytics />
      <aside className="side-navigation" aria-label="주요 메뉴">
        <Link className="side-brand" href={homeHref} aria-label="집지기 홈">
          <BrandLockup />
        </Link>
        <nav className="side-nav-list">
          {mainNavigation.map((item) => (
            <NavLink key={item.href} item={item} active={activePath(pathname, item.href)} />
          ))}
        </nav>
        {secondaryNavigation.length ? <><div className="side-nav-divider" /><nav className="side-nav-list side-nav-secondary" aria-label="운영 메뉴">
          {secondaryNavigation.map((item) => <NavLink key={item.href} item={item} active={activePath(pathname, item.href)} />)}
        </nav></> : <div className="side-nav-secondary" />}
        <div className="side-profile">
          <span className="avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
          <span><strong>{user.name}</strong><small>{user.email}</small></span>
        </div>
      </aside>
      <div className="workspace-main-column">
        <header className="mobile-app-header">
          <Link href={homeHref} aria-label="집지기 홈">
            <BrandLockup tone="dark" />
          </Link>
          {user.role === "owner" ? (
            <Link className="header-icon-button" href="/app/settings" aria-label="설정 및 계정 열기">
              <GearIcon width={20} height={20} aria-hidden="true" />
            </Link>
          ) : (
            <Link className="header-icon-button" href="/app/settings" aria-label="운영 설정 열기">
              <GearIcon width={20} height={20} aria-hidden="true" />
            </Link>
          )}
        </header>
        <div className="workspace-account-bar" aria-label="현재 계정과 데모 전환">
          <span className="workspace-role-label">{demoEnabled ? demoLabels[user.role] : roleLabels[user.role]}{demoVariant ? <Link className="demo-settings-link" href="/app/settings#demo-reset">체험 설정</Link> : null}</span>
          <SessionActions role={user.role} demoEnabled={demoEnabled} />
        </div>
        <main id="main-content" className="workspace-content" tabIndex={-1}>{children}</main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="모바일 주요 메뉴">
        {mainNavigation.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = activePath(pathname, item.href);
          return (
            <Link key={item.href} className={cx("mobile-nav-link", active && "is-active")} href={item.href} aria-current={active ? "page" : undefined}>
              <Icon width={20} height={20} aria-hidden="true" />
              <span>{item.mobileLabel ?? item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link className={cx("side-nav-link", active && "is-active")} href={item.href} aria-current={active ? "page" : undefined}>
      <Icon width={19} height={19} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}
