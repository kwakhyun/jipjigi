export default function WorkspaceLoading() {
  return (
    <section className="workspace-route-state" aria-live="polite" aria-busy="true">
      <span className="loading-orbit" aria-hidden="true" />
      <h1>임대 운영 정보를 불러오고 있어요</h1>
      <p>계약, 수납과 수리 현황을 확인하고 있습니다.</p>
    </section>
  );
}
