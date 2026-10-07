/** 12450 → "12.450" */
export function formatScore(value: number): string {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 272 → "04:32" (ou "1:04:32" acima de uma hora). */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 1234 → "1,2 mil" — contadores compactos para a tela de celular. */
export function formatCompact(value: number): string {
  if (value < 1000) return String(Math.floor(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(1).replace(".", ",")} mil`;
  return `${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
}
