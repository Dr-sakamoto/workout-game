import type { Avatar, MealLog, Profile, SleepLog, Stats, WorkoutLog, WorkoutSet } from "./types";
import type { PartVolumes } from "./parts";

// アカウント同期(SYNC_DESIGN.md)。ネットワークを一切持たない純粋な判断ロジックだけを
// ここに置く。実際の通信は lib/sync.ts、zustandストアへの配線は store/cloudSync.ts。

/**
 * クラウドへ同期する「耐久データ」だけの形。一過性の表示状態(lastReward等の
 * トースト)や端末ローカルの当日フラグ(睡眠ポップアップ・日次ペナルティ済み)は
 * 含まない(SYNC_DESIGN.md §2「同期する状態/しない状態」)。
 */
export interface DurableGameState {
  profile: Profile | null;
  avatar: Avatar;
  workoutLogs: WorkoutLog[];
  mealLogs: MealLog[];
  sleepLogs: SleepLog[];
  streak: { count: number; lastDate: string | null };
  claimedQuestsByDate: Record<string, string[]>;
  startSnapshot: { heightCm: number; weightKg: number; level: number; stats: Stats; date: string } | null;
  records: { bestVolumeByExercise: Record<string, number>; bestDayExp: number; bestStreak: number };
  boss: { index: number; hp: number };
  bossesDefeated: number;
  claimedAchievements: string[];
  expBoostCharges: number;
  streakShields: number;
  partVolumes: PartVolumes;
  bodyFat: number | null;
  lastSetsByExercise: Record<string, WorkoutSet[]>;
  lastMinutesByExercise: Record<string, number>;
  favorites: string[];
  playerHp: number;
}

/**
 * 同期対象フィールドの単一の正(single source of truth)。
 * serializeForSync(何を送るか)と cloudSync.ts の変更検知(何が変わったら送るか)の
 * 両方がこの配列を参照する。新しい耐久フィールドを足すときはここに1行足すだけでよい。
 */
export const DURABLE_STATE_KEYS = [
  "profile",
  "avatar",
  "workoutLogs",
  "mealLogs",
  "sleepLogs",
  "streak",
  "claimedQuestsByDate",
  "startSnapshot",
  "records",
  "boss",
  "bossesDefeated",
  "claimedAchievements",
  "expBoostCharges",
  "streakShields",
  "partVolumes",
  "bodyFat",
  "lastSetsByExercise",
  "lastMinutesByExercise",
  "favorites",
  "playerHp",
] as const satisfies readonly (keyof DurableGameState)[];

/**
 * 同期する項目だけを明示的に選び直す(allowlist)。新フィールドは「デフォルトで
 * 同期しない」を安全側にするため、除外リストではなく採用リスト(DURABLE_STATE_KEYS)
 * で書く。
 */
export function serializeForSync(state: DurableGameState): DurableGameState {
  // TSは動的キーのループでは各フィールドの型を個別に検証できないため、
  // 「DURABLE_STATE_KEYSの採用リストどおりに詰め直した」という construction
  // の事実だけをここで一度だけ型アサーションする。
  const entries = DURABLE_STATE_KEYS.map((key) => [key, state[key]] as const);
  return Object.fromEntries(entries) as unknown as DurableGameState;
}

/** 進捗ガードに使う指標。totalExpを主指標、logCountを同点タイブレークにする。 */
export interface Progress {
  totalExp: number;
  logCount: number;
}

export function progressOf(state: Pick<DurableGameState, "avatar" | "workoutLogs" | "mealLogs">): Progress {
  return {
    totalExp: state.avatar.totalExp,
    logCount: state.workoutLogs.length + state.mealLogs.length,
  };
}

/** 最後に同期した時点からProgressが動いたか(=ローカルが未同期の変更を持つか) */
export function isDirty(current: Progress, lastSynced: Progress): boolean {
  return current.totalExp !== lastSynced.totalExp || current.logCount !== lastSynced.logCount;
}

export type SyncSide = "local" | "remote";

/**
 * 進捗ガード(LWW+進捗ガード方式の核): totalExpが多い方を勝者にする
 * (同点はlogCountでタイブレーク)。完全な同点は非破壊側=localを勝者にし、
 * 無駄な巻き戻し/上書きを避ける。
 */
export function chooseWinner(local: Progress, remote: Progress): SyncSide {
  if (local.totalExp !== remote.totalExp) return local.totalExp > remote.totalExp ? "local" : "remote";
  if (local.logCount !== remote.logCount) return local.logCount > remote.logCount ? "local" : "remote";
  return "local";
}

export interface LocalSyncMeta {
  hasProfile: boolean;
  progress: Progress;
  lastSyncedRevision: number;
  lastSyncedProgress: Progress;
}

export interface RemoteSyncMeta {
  exists: boolean;
  revision: number;
  progress: Progress;
}

export type SyncAction = "push" | "pull" | "merge" | "noop";

/**
 * 起動時の同期方針を決める(SYNC_DESIGN.md §2「ライフサイクル」の判定順そのまま)。
 * 1. remote行なし              → push (新規作成)
 * 2. remoteあり & local実質空  → pull (remote採用)
 * 3. revision一致              → ローカルに未反映があればpush、なければnoop
 * 4. remoteが進んでいて未変更  → pull (早送り)
 * 5. 両方が最終同期後に変化    → merge (進捗ガード)
 */
export function decideSyncAction(local: LocalSyncMeta, remote: RemoteSyncMeta): SyncAction {
  if (!remote.exists) return "push";

  const localEmpty = !local.hasProfile && local.progress.totalExp === 0 && local.progress.logCount === 0;
  if (localEmpty) return "pull";

  const dirty = isDirty(local.progress, local.lastSyncedProgress);
  if (remote.revision === local.lastSyncedRevision) return dirty ? "push" : "noop";
  if (remote.revision > local.lastSyncedRevision && !dirty) return "pull";
  return "merge";
}
