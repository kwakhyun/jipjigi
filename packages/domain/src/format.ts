export const formatWon = (amount: number) =>
  `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(amount)}원`;

export const formatCompactWon = (amount: number) => {
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(1).replace(".0", "")}억원`;
  if (amount >= 10_000) return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만원`;
  return `${amount.toLocaleString("ko-KR")}원`;
};
