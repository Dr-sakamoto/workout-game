// 週間トレーニングスケジュールと、それに基づくストリーク判定。
//
// コンセプト(DESIGN.md): ストリークは「筋トレの継続」を駆動する装置。
// ただし筋トレは休養(超回復)込みで成立するので、「毎日連続」を要求すると
// 健康的な休養日で途切れてしまい逆効果。そこで本人が決めた週間スケジュール
// (例: 月・水・金)の"予定日"を基準にする。予定日にトレすれば継続、
// 予定日を飛ばすと途切れる。休養日(予定外の日)は継続に影響しない。
//
// すべて純関数。サーバー移植・テストを容易にするため副作用を持たせない。

export interface SchedulePreset {
  id: string;
  label: string;
  emoji: string;
  days: number[]; // 0=日 .. 6=土
  desc: string;
}

// 初心者にはこちらから提案する(本人にゼロから組ませない)。既定は週3。
export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: "w2", label: "週2", emoji: "🌱", days: [1, 4], desc: "月・木。まずは習慣づけから" },
  { id: "w3", label: "週3", emoji: "🔥", days: [1, 3, 5], desc: "月・水・金。初心者に一番おすすめ" },
  { id: "w4", label: "週4", emoji: "💪", days: [1, 2, 4, 5], desc: "月・火・木・金。しっかり鍛える" },
  { id: "w5", label: "週5", emoji: "🦾", days: [1, 2, 3, 4, 5], desc: "平日は毎日。本格派" },
];

export const DEFAULT_SCHEDULE = [1, 3, 5]; // 週3

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 予定日を「月・水・金」のように表示する */
export function scheduleLabel(days: number[]): string {
  if (!days || days.length === 0) return "未設定";
  return [...days].sort((a, b) => a - b).map((d) => WD[d]).join("・");
}

/** 未設定(既存プロフィール)は既定スケジュールにフォールバック */
export function effectiveSchedule(days: number[] | undefined): number[] {
  return days && days.length > 0 ? days : DEFAULT_SCHEDULE;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parse(key: string): Date {
  return new Date(key + "T00:00:00");
}

/** その日付が予定日か */
export function isScheduledDay(dateKey: string, days: number[]): boolean {
  return days.includes(parse(dateKey).getDay());
}

/** dateKey の直前(その日は含まない)の予定日。なければ null(最大14日遡る) */
export function prevScheduledBefore(dateKey: string, days: number[]): string | null {
  if (!days.length) return null;
  const base = parse(dateKey);
  for (let i = 1; i <= 14; i++) {
    const c = new Date(base);
    c.setDate(base.getDate() - i);
    if (days.includes(c.getDay())) return ymd(c);
  }
  return null;
}

export interface StreakState {
  count: number;
  lastDate: string | null;
}

/**
 * 予定日にトレーニングしたときのストリーク更新。
 * 直前の予定日をきちんとこなしていれば +1、予定日を飛ばしていたら 1 にリセット。
 * 予定外の日(休養日)のトレはここを呼ばない=継続に影響しない。
 */
export function advanceScheduleStreak(
  streak: StreakState,
  today: string,
  days: number[],
): StreakState {
  if (streak.lastDate === today) return streak; // 同日重複はカウントしない
  const prev = prevScheduledBefore(today, days);
  // 直前の予定日 == 前回カウント日 なら「飛ばしていない」→継続
  if (streak.lastDate && prev && streak.lastDate === prev) {
    return { count: streak.count + 1, lastDate: today };
  }
  return { count: 1, lastDate: today };
}

/**
 * lastDate 以降・today より前に、トレーニングしていない予定日が何日あるか。
 * ストリーク崩壊やペナルティの判定に使う(cap で上限)。
 */
export function missedScheduledDays(
  lastDate: string | null,
  today: string,
  days: number[],
  trainedDates: Set<string>,
  cap = 3,
): number {
  if (!days.length) return 0;
  const end = parse(today);
  const startTime = lastDate ? parse(lastDate).getTime() : -Infinity;
  let count = 0;
  for (let i = 1; i <= 21 && count < cap; i++) {
    const c = new Date(end);
    c.setDate(end.getDate() - i);
    if (c.getTime() <= startTime) break;
    if (days.includes(c.getDay()) && !trainedDates.has(ymd(c))) count++;
  }
  return count;
}
