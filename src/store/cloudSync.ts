import { useGameStore, type GameState } from "./useGameStore";
import {
  serializeForSync,
  progressOf,
  chooseWinner,
  decideSyncAction,
  DURABLE_STATE_KEYS,
  type DurableGameState,
  type Progress,
  type LocalSyncMeta,
  type RemoteSyncMeta,
} from "../domain/sync";
import {
  ensureSession,
  fetchRemoteSave,
  pushRemoteSave,
  forceOverwriteRemoteSave,
  getOrCreateClientId,
  isSyncAvailable,
  type RemoteSave,
} from "../lib/sync";

// ストアへの配線(SYNC_DESIGN.md §2「ライフサイクル」の実装)。
// 判断ロジックは domain/sync.ts、通信は lib/sync.ts に任せ、ここでは
// 「いつ呼ぶか」「zustandへどう反映するか」だけを担当する。

const PUSH_DEBOUNCE_MS = 2500;
const SYNC_NOTICE = "別の端末の記録と同期しました";

let userId: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false; // 起動プルとデバウンスプッシュの同時実行を防ぐ
let applyingFromSync = false; // 自分自身の書き込み(hydrate/markSynced)による無限ループ防止
let unsubscribe: (() => void) | null = null;
let started = false;

function localMetaFrom(state: GameState): LocalSyncMeta {
  return {
    hasProfile: state.profile !== null,
    progress: progressOf(state),
    lastSyncedRevision: state.lastSyncedRevision,
    lastSyncedProgress: state.lastSyncedProgress,
  };
}

function remoteMetaFrom(row: RemoteSave | null): RemoteSyncMeta {
  return row
    ? { exists: true, revision: row.revision, progress: { totalExp: row.totalExp, logCount: row.logCount } }
    : { exists: false, revision: 0, progress: { totalExp: 0, logCount: 0 } };
}

/** remoteの状態をローカルに丸ごと反映する(耐久フィールドのみ。トースト等は残す) */
function applyRemote(remote: DurableGameState, revision: number, progress: Progress) {
  applyingFromSync = true;
  useGameStore.setState({ ...remote, lastSyncedRevision: revision, lastSyncedProgress: progress });
  applyingFromSync = false;
}

function markSynced(revision: number, progress: Progress) {
  applyingFromSync = true;
  useGameStore.setState({ lastSyncedRevision: revision, lastSyncedProgress: progress });
  applyingFromSync = false;
}

function notify(message: string) {
  useGameStore.setState({ syncNotice: message });
}

async function pushLocal(uid: string, expectedRevision: number): Promise<number | null> {
  const state = useGameStore.getState();
  const durable = serializeForSync(state);
  const progress = progressOf(state);
  const clientId = getOrCreateClientId();
  return pushRemoteSave(uid, durable, expectedRevision, progress, clientId);
}

/** 起動時の同期。SYNC_DESIGN.md §2の判定順そのまま。 */
async function runStartupSync(): Promise<void> {
  if (!isSyncAvailable()) return;
  if (!useGameStore.getState().syncEnabled) return;
  if (syncing) return;
  syncing = true;
  try {
    const uid = await ensureSession();
    if (!uid) return;
    userId = uid;

    const remoteRow = await fetchRemoteSave(uid);
    const local = localMetaFrom(useGameStore.getState());
    const remoteMeta = remoteMetaFrom(remoteRow);
    const action = decideSyncAction(local, remoteMeta);

    if (action === "push") {
      const rev = await pushLocal(uid, remoteMeta.exists ? remoteMeta.revision : 0);
      if (rev) markSynced(rev, local.progress);
      return;
    }
    if (action === "pull" && remoteRow) {
      applyRemote(remoteRow.state, remoteRow.revision, remoteMeta.progress);
      return;
    }
    if (action === "merge" && remoteRow) {
      await resolveMerge(uid, local.progress, remoteRow, remoteMeta);
      return;
    }
    // noop: 何もしない
  } finally {
    syncing = false;
  }
}

/** 進捗ガードで勝者を決め、負けた側を上書きして両端末を収束させる */
async function resolveMerge(
  uid: string,
  localProgress: Progress,
  remoteRow: RemoteSave,
  remoteMeta: RemoteSyncMeta,
): Promise<void> {
  const winner = chooseWinner(localProgress, remoteMeta.progress);
  if (winner === "remote") {
    applyRemote(remoteRow.state, remoteRow.revision, remoteMeta.progress);
    notify(SYNC_NOTICE);
    return;
  }
  const rev = await pushLocal(uid, remoteMeta.revision);
  if (rev) {
    markSynced(rev, localProgress);
    notify(SYNC_NOTICE);
  }
}

/** 変更のたびに呼ぶ。デバウンスして意味のある変更だけをまとめてプッシュする。 */
function scheduleDebouncedPush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushIfPossible();
  }, PUSH_DEBOUNCE_MS);
}

async function pushIfPossible(): Promise<void> {
  if (!isSyncAvailable() || !userId) return;
  if (!useGameStore.getState().syncEnabled) return;
  if (syncing) {
    scheduleDebouncedPush(); // 起動同期などと競合したら少し待って再試行
    return;
  }
  syncing = true;
  try {
    const state = useGameStore.getState();
    const progress = progressOf(state);
    const rev = await pushLocal(userId, state.lastSyncedRevision);
    if (rev) {
      markSynced(rev, progress);
      return;
    }
    // 楽観ロック負け(0行更新)=他端末が先に書いた。再取得して進捗ガードで解決
    const remoteRow = await fetchRemoteSave(userId);
    if (!remoteRow) return;
    await resolveMerge(userId, progress, remoteRow, remoteMetaFrom(remoteRow));
  } finally {
    syncing = false;
  }
}

/**
 * アプリ起動時に一度だけ呼ぶ(App.tsx)。以後の変更検知とデバウンスプッシュも
 * ここで購読を開始する。
 */
export function initCloudSync(): void {
  if (started) return;
  started = true;

  void runStartupSync();

  unsubscribe = useGameStore.subscribe((state, prevState) => {
    if (applyingFromSync) return; // 自分自身の書き込みには反応しない(無限ループ防止)
    if (state.syncEnabled && !prevState.syncEnabled) {
      void runStartupSync(); // OFF→ONの切り替え。改めて起動時同期をやり直す
      return;
    }
    if (!state.syncEnabled) return;
    const changed = DURABLE_STATE_KEYS.some((key) => state[key] !== prevState[key]);
    if (changed) scheduleDebouncedPush();
  });

  window.addEventListener("online", () => void pushIfPossible());
}

/**
 * ユーザーが「データをリセット」した直後に呼ぶ(SettingsScreen)。remoteも
 * 上書きし、次回起動時の自動プルでリセットが巻き戻されるのを防ぐ
 * (SYNC_DESIGN.md には無い実装上の穴を塞ぐための追加処理)。
 */
export async function pushFreshStateAfterReset(): Promise<void> {
  if (!isSyncAvailable()) return;
  const uid = userId ?? (await ensureSession());
  if (!uid) return;
  userId = uid;

  const state = useGameStore.getState();
  const durable = serializeForSync(state);
  const progress = progressOf(state);
  await forceOverwriteRemoteSave(uid, durable, progress, getOrCreateClientId());

  const row = await fetchRemoteSave(uid);
  if (row) markSynced(row.revision, { totalExp: row.totalExp, logCount: row.logCount });
}

/** テスト/ホットリロード時に内部状態を初期化するための補助(本番コードからは呼ばない) */
export function __resetCloudSyncModuleStateForTests(): void {
  userId = null;
  syncing = false;
  applyingFromSync = false;
  started = false;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  unsubscribe?.();
  unsubscribe = null;
}
