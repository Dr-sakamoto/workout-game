import type { Action, YearGoal } from "./types";

type Preset = Omit<Action, "id" | "createdAt">;

/** 初回に選ぶだけで使える防御行動 */
export const DEFENSE_PRESETS: Preset[] = [
  { title: "支払い・引き落としを確認", kind: "defense", starter: "銀行アプリを開いて今月の引き落とし予定を見る", energy: 1, loss: 3, intervalDays: 7 },
  { title: "締切・提出物をチェック", kind: "defense", starter: "カレンダーと課題一覧を開いて今週の締切を確認する", energy: 1, loss: 3, intervalDays: 3 },
  { title: "未返信の連絡を返す", kind: "defense", starter: "一番古い未返信を1件だけ返す", energy: 1, loss: 2, intervalDays: 2 },
  { title: "部屋を片付ける", kind: "defense", starter: "タイマー3分で床の物だけ拾う", energy: 2, loss: 1, intervalDays: 2 },
  { title: "洗濯", kind: "defense", starter: "洗濯物を洗濯機に入れてスタートを押す", energy: 2, loss: 2, intervalDays: 3 },
  { title: "郵便物・書類を開ける", kind: "defense", starter: "溜まった封筒を1通だけ開けて中身を見る", energy: 1, loss: 2, intervalDays: 7 },
  { title: "ゴミをまとめる", kind: "defense", starter: "ゴミ袋を1つ広げて目についた物を入れる", energy: 1, loss: 1, intervalDays: 3 },
];

/** 目標がなくても引ける攻撃行動 */
export const OFFENSE_PRESETS: Preset[] = [
  { title: "散歩する", kind: "offense", starter: "靴を履いて玄関の外に出る", energy: 2, loss: 1 },
  { title: "ストレッチ", kind: "offense", starter: "その場で前屈を30秒", energy: 1, loss: 1 },
  { title: "本を読む", kind: "offense", starter: "本を開いて2ページだけ読む", energy: 1, loss: 1 },
  { title: "新しいことを調べる", kind: "offense", starter: "気になっていた言葉を1つ検索してメモする", energy: 1, loss: 1 },
];

/** 年間目標から攻撃行動を自動生成する(手動登録を減らすため) */
export function actionsForGoal(goal: YearGoal): Preset[] {
  return [
    {
      title: `${goal.title}｜少し進める`,
      kind: "offense",
      starter: "タイマーを5分セットして、途中のところを開く",
      energy: 2,
      loss: 1,
      goalId: goal.id,
    },
    {
      title: `${goal.title}｜調べる・メモする`,
      kind: "offense",
      starter: "次にやることを1行だけメモに書く",
      energy: 1,
      loss: 1,
      goalId: goal.id,
    },
    {
      title: `${goal.title}｜がっつり取り組む`,
      kind: "offense",
      starter: "スマホを別の部屋に置いて、25分のタイマーを押す",
      energy: 3,
      loss: 1,
      goalId: goal.id,
    },
  ];
}

/** 分類はUIで選ばせず、中身から推定する: 目標あり=攻撃 / 期限・繰り返しあり=防御 */
export function inferKind(a: Pick<Action, "goalId" | "deadline" | "intervalDays">): Action["kind"] {
  if (a.goalId) return "offense";
  if (a.deadline || a.intervalDays) return "defense";
  return "offense";
}
