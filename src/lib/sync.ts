import { supabase, isSupabaseConfigured, ensureSession } from "./supabase";
import type { DurableGameState } from "../domain/sync";

// 匿名セッションの確保自体は lib/supabase.ts に置いてある(community_foods の
// 書き込みとの循環import回避のため)。ここではそのまま再エクスポートし、
// store/cloudSync.ts からは今まで通り lib/sync 経由で呼べるようにする。
export { ensureSession };

// アカウント同期の通信レイヤー(SYNC_DESIGN.md §2)。判断ロジックは一切持たず、
// Supabase(game_saves テーブル)とのやり取りだけを行う薄いアダプタ。
// 実際の判断(push/pull/merge)は store/cloudSync.ts が domain/sync.ts の
// 純関数を使って決める。

const CLIENT_ID_KEY = "workout-game-client-id";
const SYNC_SCHEMA_VERSION = 1;

/**
 * 端末ごとに固定のID。zustandの永続化ブロブ(STORAGE_KEY)とは別の localStorage
 * キーで持つ(同期のブックキーピングを同期対象データに混ぜない — SYNC_DESIGN.md §2)。
 */
export function getOrCreateClientId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(CLIENT_ID_KEY);
  } catch {
    /* privateモード等でlocalStorage不可の場合は毎回新規発行(致命的ではない) */
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(CLIENT_ID_KEY, id);
    } catch {
      /* noop */
    }
  }
  return id;
}

export function isSyncAvailable(): boolean {
  return isSupabaseConfigured();
}

export interface RemoteSave {
  state: DurableGameState;
  revision: number;
  totalExp: number;
  logCount: number;
}

export async function fetchRemoteSave(userId: string): Promise<RemoteSave | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("game_saves")
    .select("state,revision,total_exp,log_count")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    state: data.state as DurableGameState,
    revision: data.revision as number,
    totalExp: data.total_exp as number,
    logCount: data.log_count as number,
  };
}

export interface ProgressCols {
  totalExp: number;
  logCount: number;
}

/** 新規作成(remote行がまだ無い場合)。成功したら新しいrevision(常に1)を返す。 */
export async function insertRemoteSave(
  userId: string,
  state: DurableGameState,
  progress: ProgressCols,
  clientId: string,
): Promise<number | null> {
  if (!supabase) return null;
  const { error } = await supabase.from("game_saves").insert({
    user_id: userId,
    state,
    schema_version: SYNC_SCHEMA_VERSION,
    revision: 1,
    total_exp: progress.totalExp,
    log_count: progress.logCount,
    updated_by: clientId,
  });
  return error ? null : 1;
}

/**
 * 楽観ロック付き更新。expectedRevisionと一致する行だけを更新する。
 * 0行更新(=他端末が先に書いていた)の場合は null を返す。
 */
export async function updateRemoteSave(
  userId: string,
  state: DurableGameState,
  expectedRevision: number,
  progress: ProgressCols,
  clientId: string,
): Promise<number | null> {
  if (!supabase) return null;
  const nextRevision = expectedRevision + 1;
  const { data, error } = await supabase
    .from("game_saves")
    .update({
      state,
      revision: nextRevision,
      total_exp: progress.totalExp,
      log_count: progress.logCount,
      updated_by: clientId,
    })
    .eq("user_id", userId)
    .eq("revision", expectedRevision)
    .select("revision");
  if (error || !data || data.length === 0) return null;
  return nextRevision;
}

/**
 * 新規作成しつつ、既に他端末が先に行を作っていた(挿入衝突)場合は更新に
 * 切り替える自己修復つきのpush。expectedRevision=0(=remote行なし想定)の
 * ときだけ挿入を試み、それ以外は通常の楽観ロック更新を行う。
 */
export async function pushRemoteSave(
  userId: string,
  state: DurableGameState,
  expectedRevision: number,
  progress: ProgressCols,
  clientId: string,
): Promise<number | null> {
  if (expectedRevision !== 0) {
    return updateRemoteSave(userId, state, expectedRevision, progress, clientId);
  }
  const inserted = await insertRemoteSave(userId, state, progress, clientId);
  if (inserted) return inserted;
  // 挿入衝突(=別端末が同時に初回作成した) → 取得して更新に切り替える
  const existing = await fetchRemoteSave(userId);
  if (!existing) return null;
  return updateRemoteSave(userId, state, existing.revision, progress, clientId);
}

/**
 * ユーザーの意図的なリセット直後に使う。revision照合をせず、現在のremote行を
 * 読み直してから強制上書きする(=次回起動時の自動プルでリセットが巻き戻される
 * のを防ぐ)。
 */
export async function forceOverwriteRemoteSave(
  userId: string,
  state: DurableGameState,
  progress: ProgressCols,
  clientId: string,
): Promise<void> {
  if (!supabase) return;
  const current = await fetchRemoteSave(userId);
  if (!current) {
    await insertRemoteSave(userId, state, progress, clientId);
    return;
  }
  await updateRemoteSave(userId, state, current.revision, progress, clientId);
}
