const DAY = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ym(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** その日を含む週の月曜日 */
export function weekStartOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return ymd(x);
}

/** 今日から期限までの日数(今日が期限なら0、過ぎていれば負) */
export function daysUntil(deadline: string, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseYmd(deadline).getTime() - today.getTime()) / DAY);
}

export function daysBetween(a: number, b: number): number {
  return (b - a) / DAY;
}

export const HOUR = 60 * 60 * 1000;
