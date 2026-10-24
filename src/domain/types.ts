/** 防御行動=放置による損失を防ぐ / 攻撃行動=将来の可能性を広げる */
export type ActionKind = "defense" | "offense";

/** 体力コスト。1=寝転がってでもできる / 3=気合いが要る */
export type Energy = 1 | 2 | 3;

/** 放置したときの損失の大きさ(防御行動のみ意味を持つ) */
export type Loss = 1 | 2 | 3;

export interface Action {
  id: string;
  title: string;
  kind: ActionKind;
  /** 2〜5分で始められる最初の一歩 */
  starter: string;
  energy: Energy;
  loss: Loss;
  /** 紐づく年間目標(攻撃行動向け) */
  goalId?: string;
  /** 一回きりの期限(YYYY-MM-DD)。完了すると archived になる */
  deadline?: string;
  /** 繰り返し行動の目安間隔(日)。前回完了からの経過で必要度が上がる */
  intervalDays?: number;
  archived?: boolean;
  createdAt: number;
}

export interface YearGoal {
  id: string;
  title: string;
  /** なりたい姿・理由 */
  why: string;
}

export interface MonthPlan {
  /** YYYY-MM */
  month: string;
  /** 余力のうち攻撃行動へ回す配分の目安(0〜1)。防御の必要量が優先される */
  offenseShare: number;
  /** goalId -> 重み(0〜3) */
  goalWeights: Record<string, number>;
  /** 今月のテーマ・メモ */
  note: string;
}

export type Busy = "free" | "normal" | "busy";
export type Priority = "off" | "normal" | "high";

export interface WeekPlan {
  /** 週の開始日(月曜, YYYY-MM-DD) */
  weekStart: string;
  busy: Busy;
  /** actionId -> 優先度。未指定は normal */
  priorities: Record<string, Priority>;
}

export type Outcome = "pending" | "done" | "skipped" | "detour";

export interface Draw {
  id: string;
  at: number;
  actionId: string;
  rarity: Rarity;
  outcome: Outcome;
  /** 脱線時: 実際にやったこと */
  detourNote?: string;
  /** 脱線時: 実際にやったことの分類 */
  detourKind?: ActionKind;
  resolvedAt?: number;
}

export type Mood = "tired" | "normal" | "hyper";

export type Rarity = "N" | "R" | "SR" | "SSR";
