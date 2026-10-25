/**
 * 防御行動=放置による損失を防ぐ / 攻撃行動=将来の可能性を広げる
 * 抽選の内部でだけ使い、UIには出さない。
 */
export type ActionKind = "defense" | "offense";

/** 体力コスト。1=寝転がってでもできる / 3=気合いが要る */
export type Energy = 1 | 2 | 3;

/** 放置したときの損失の大きさ(防御行動のみ意味を持つ) */
export type Loss = 1 | 2 | 3;

/** 自分にとっての楽しさ。ステッカーのキラ度になる(1=ノーマル〜4=ホロ) */
export type Fun = 1 | 2 | 3 | 4;

export interface Action {
  id: string;
  title: string;
  kind: ActionKind;
  /** 2〜5分で始められる最初の一歩 */
  starter: string;
  energy: Energy;
  loss: Loss;
  fun: Fun;
  /** 紐づく年間目標(攻撃行動向け) */
  goalId?: string;
  /** 一回きりの期限(YYYY-MM-DD)。完了すると archived になる */
  deadline?: string;
  /** 繰り返し行動の目安間隔(日)。前回完了からの経過で必要度が上がる */
  intervalDays?: number;
  archived?: boolean;
  createdAt: number;
}

/** その日やってはいけないこと */
export interface Ban {
  id: string;
  title: string;
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
  /**
   * ガチャ配分(%、合計100)。キーは目標のid / "life"(くらし) / "free"(そのほか)。
   * 保存されていない枠は normalizeShares が補う。期限が迫った用事があると life は自動で増える
   */
  shares: Record<string, number>;
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

/** pending=カードに載っている / done=完了 / skipped=やらずに上納された */
export type Outcome = "pending" | "done" | "skipped";

/** カードに載ったステッカー1枚 */
export interface Draw {
  id: string;
  at: number;
  actionId: string;
  outcome: Outcome;
  /** どの日のカードか(YYYY-MM-DD) */
  cardDate: string;
  resolvedAt?: number;
}

/** 1日1枚のカード(台紙)。日付が変わると上納される */
export interface DailyCard {
  date: string;
  drawIds: string[];
  banId?: string;
  banBroken: boolean;
  tributed: boolean;
  drawnAt: number;
}

/** 抽選の内部で使う調子。前日のカードの消化具合から推定する */
export type Mood = "tired" | "normal" | "hyper";
