import type { Action, Energy, Fun, Loss } from "./types";
import { FREE, LIFE, groupOf } from "./shares";

/** くらし・用事の「いつやる?」: くり返す / 期限がある */
export type Timing = "repeat" | "deadline";

/** 行動エディタで編集中の内容。追加も編集も同じ形で扱う */
export interface ActionDraft {
  title: string;
  starter: string;
  fun: Fun;
  energy: Energy;
  loss: Loss;
  /** 入れる枠: 目標のid / くらし・用事 / そのほか(配分の円グラフと同じ) */
  group: string;
  timing: Timing;
  /** YYYY-MM-DD。timing が deadline のとき使う */
  deadline: string;
  /** timing が repeat のとき使う */
  intervalDays: number;
}

export const DEFAULT_STARTER = "タイマーを3分セットして、とりあえず始める";
export const DEADLINE_STARTER = "必要なものを開いて、最初の1行だけやる";

/** くり返しの選択肢(日)。既存の値がこの中になければ、その値も選択肢に足す */
export const INTERVAL_OPTIONS = [1, 2, 3, 7, 14, 30];

export function intervalLabel(n: number): string {
  switch (n) {
    case 1: return "毎日";
    case 7: return "毎週";
    case 14: return "2週間ごと";
    case 30: return "毎月";
    default: return `${n}日ごと`;
  }
}

export function intervalChoices(current: number): number[] {
  return INTERVAL_OPTIONS.includes(current) ? INTERVAL_OPTIONS : [...INTERVAL_OPTIONS, current].sort((a, b) => a - b);
}

export function newDraft(group: string = FREE, title = ""): ActionDraft {
  return {
    title,
    starter: "",
    // 用事は楽しくない前提で★1から。ふつうの行動は★2から
    fun: group === LIFE ? 1 : 2,
    energy: 2,
    loss: 2,
    group,
    timing: "repeat",
    deadline: "",
    intervalDays: 7,
  };
}

export function draftFromAction(a: Action): ActionDraft {
  return {
    title: a.title,
    starter: a.starter,
    fun: a.fun,
    energy: a.energy,
    loss: a.loss,
    group: groupOf(a),
    timing: a.deadline ? "deadline" : "repeat",
    deadline: a.deadline ?? "",
    intervalDays: a.intervalDays ?? 7,
  };
}

/** 保存できる状態か。名前が必要で、期限つきの用事は日付も必要 */
export function isDraftValid(d: ActionDraft): boolean {
  if (!d.title.trim()) return false;
  if (d.group === LIFE && d.timing === "deadline" && !d.deadline) return false;
  return true;
}

/**
 * エディタの内容を行動のフィールドにする。
 * 入れる枠が くらし → 期限 or くり返し(防御) / 目標 → その目標(攻撃) / そのほか → どちらもなし(攻撃)。
 * 防御/攻撃の分類そのものは、保存時に store が inferKind で決める。
 */
export function draftToFields(d: ActionDraft) {
  const life = d.group === LIFE;
  const goal = !life && d.group !== FREE;
  const deadline = life && d.timing === "deadline" ? d.deadline || undefined : undefined;
  const intervalDays = life && d.timing === "repeat" ? d.intervalDays : undefined;
  return {
    title: d.title.trim(),
    starter: d.starter.trim() || (deadline ? DEADLINE_STARTER : DEFAULT_STARTER),
    fun: d.fun,
    energy: d.energy,
    loss: (life ? d.loss : 1) as Loss,
    goalId: goal ? d.group : undefined,
    deadline,
    intervalDays,
  };
}
