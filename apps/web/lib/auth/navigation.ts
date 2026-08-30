export type UserRole = "owner" | "operator";

export const roleLabels: Record<UserRole, string> = {
  owner: "임대인",
  operator: "그로스 운영자",
};

export const demoLabels: Record<UserRole, string> = {
  owner: "임대인 데모",
  operator: "그로스 데모",
};

export const demoDescriptions: Record<UserRole, string> = {
  owner: "건물주 관점에서 임대 장부, 계약 관리, 수리 요청과 메시지 발송을 확인합니다.",
  operator: "서비스 운영자 관점에서 A/B 테스트, 사용자 행동, CRM 성과와 웹 성능 지표를 확인합니다. 개별 임대 계약은 열람할 수 없습니다.",
};

const allowedPaths: Record<UserRole, readonly string[]> = {
  owner: ["/app", "/app/ledger", "/app/contracts", "/app/maintenance", "/app/messages", "/app/settings"],
  operator: ["/app/growth", "/app/settings"],
};

export function roleHome(role: UserRole) {
  return role === "operator" ? "/app/growth" : "/app";
}

// Both the form and the server action use this policy; the role itself always
// comes from the authenticated database user, never a submitted demo selection.
export function postLoginPath(role: UserRole, requestedPath?: string) {
  if (!requestedPath?.startsWith("/") || requestedPath.startsWith("//") || requestedPath.includes("\\")) return roleHome(role);
  try {
    const url = new URL(requestedPath, "https://jipjigi.invalid");
    if (url.origin !== "https://jipjigi.invalid" || !allowedPaths[role].includes(url.pathname)) return roleHome(role);
    return `${url.pathname}${url.search}`;
  } catch {
    return roleHome(role);
  }
}
