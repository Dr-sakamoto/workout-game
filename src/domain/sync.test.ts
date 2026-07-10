import { describe, it, expect } from "vitest";
import {
  serializeForSync,
  progressOf,
  isDirty,
  chooseWinner,
  decideSyncAction,
  DURABLE_STATE_KEYS,
  type DurableGameState,
  type Progress,
  type LocalSyncMeta,
  type RemoteSyncMeta,
} from "./sync";
import { createAvatar, addExp } from "./avatar";
import { emptyPartVolumes } from "./parts";

function durableFixture(overrides: Partial<DurableGameState> = {}): DurableGameState {
  return {
    profile: { name: "t", heightCm: 170, weightKg: 70, goal: "keep", trainingDays: [1, 3, 5] },
    avatar: createAvatar(),
    workoutLogs: [],
    mealLogs: [],
    sleepLogs: [],
    streak: { count: 0, lastDate: null },
    claimedQuestsByDate: {},
    startSnapshot: null,
    records: { bestVolumeByExercise: {}, bestDayExp: 0, bestStreak: 0 },
    boss: { index: 0, hp: 300 },
    bossesDefeated: 0,
    claimedAchievements: [],
    expBoostCharges: 0,
    streakShields: 0,
    partVolumes: emptyPartVolumes(),
    bodyFat: null,
    lastSetsByExercise: {},
    lastMinutesByExercise: {},
    favorites: [],
    playerHp: 60,
    ...overrides,
  };
}

describe("sync: serializeForSync", () => {
  it("耐久フィールドを漏れなく採用する(DURABLE_STATE_KEYSと1対1)", () => {
    const state = durableFixture();
    const out = serializeForSync(state);
    expect(Object.keys(out).sort()).toEqual([...DURABLE_STATE_KEYS].sort());
  });

  it("一過性フィールド(トースト・当日フラグ等)は同期対象に含まれない", () => {
    // ストアの実際の状態は durable フィールド以外も持つ。allowlist方式なので
    // 呼び出し側が過剰なプロパティを渡しても、返り値には現れない。
    const full = {
      ...durableFixture(),
      lastReward: { exp: 1, gold: 1, levelsGained: 0, statText: "", modifier: 1 },
      lastPenalty: { missedDays: 1, damagePerDay: 1, totalDamage: 1, bossName: "x", bossEmoji: "x", newHp: 1, maxHp: 1 },
      sleepPopupDate: "2026-07-10",
      lastDailyCheckDate: "2026-07-10",
      lastSyncedRevision: 5,
      syncEnabled: true,
    };
    const out = serializeForSync(full) as unknown as Record<string, unknown>;
    expect(out.lastReward).toBeUndefined();
    expect(out.lastPenalty).toBeUndefined();
    expect(out.sleepPopupDate).toBeUndefined();
    expect(out.lastDailyCheckDate).toBeUndefined();
    expect(out.lastSyncedRevision).toBeUndefined();
    expect(out.syncEnabled).toBeUndefined();
  });
});

describe("sync: progressOf / isDirty", () => {
  it("totalExpとログ件数(workout+meal)を集計する", () => {
    const state = durableFixture({
      avatar: addExp(createAvatar(), 250).avatar,
      workoutLogs: [{ id: "1" } as never, { id: "2" } as never],
      mealLogs: [{ id: "3" } as never],
    });
    expect(progressOf(state)).toEqual({ totalExp: 250, logCount: 3 });
  });

  it("isDirty: totalExpかlogCountのどちらかが変わっていればtrue", () => {
    const base: Progress = { totalExp: 100, logCount: 2 };
    expect(isDirty(base, { totalExp: 100, logCount: 2 })).toBe(false);
    expect(isDirty({ ...base, totalExp: 101 }, base)).toBe(true);
    expect(isDirty({ ...base, logCount: 3 }, base)).toBe(true);
  });
});

describe("sync: chooseWinner (進捗ガード)", () => {
  it("totalExpが多い方を勝者にする", () => {
    expect(chooseWinner({ totalExp: 200, logCount: 1 }, { totalExp: 100, logCount: 5 })).toBe("local");
    expect(chooseWinner({ totalExp: 100, logCount: 5 }, { totalExp: 200, logCount: 1 })).toBe("remote");
  });

  it("totalExp同点はlogCountでタイブレークする", () => {
    expect(chooseWinner({ totalExp: 100, logCount: 5 }, { totalExp: 100, logCount: 3 })).toBe("local");
    expect(chooseWinner({ totalExp: 100, logCount: 3 }, { totalExp: 100, logCount: 5 })).toBe("remote");
  });

  it("完全な同点はlocalを勝者にする(無駄な巻き戻しを避ける)", () => {
    expect(chooseWinner({ totalExp: 100, logCount: 3 }, { totalExp: 100, logCount: 3 })).toBe("local");
  });
});

describe("sync: decideSyncAction (起動時の同期方針)", () => {
  const emptyProgress: Progress = { totalExp: 0, logCount: 0 };

  function local(overrides: Partial<LocalSyncMeta> = {}): LocalSyncMeta {
    return {
      hasProfile: true,
      progress: { totalExp: 500, logCount: 10 },
      lastSyncedRevision: 3,
      lastSyncedProgress: { totalExp: 500, logCount: 10 },
      ...overrides,
    };
  }
  function remote(overrides: Partial<RemoteSyncMeta> = {}): RemoteSyncMeta {
    return { exists: true, revision: 3, progress: { totalExp: 500, logCount: 10 }, ...overrides };
  }

  it("1. remote行なし → push", () => {
    expect(decideSyncAction(local(), remote({ exists: false, revision: 0, progress: emptyProgress }))).toBe("push");
  });

  it("2. remoteあり & localが実質空(プロフィール無し・進捗ゼロ) → pull", () => {
    const emptyLocal = local({ hasProfile: false, progress: emptyProgress, lastSyncedRevision: 0, lastSyncedProgress: emptyProgress });
    expect(decideSyncAction(emptyLocal, remote())).toBe("pull");
  });

  it("2b. プロフィールはあるが進捗ゼロの新規ユーザーもlocal実質空扱い", () => {
    const freshProfile = local({ hasProfile: true, progress: emptyProgress, lastSyncedRevision: 0, lastSyncedProgress: emptyProgress });
    expect(decideSyncAction(freshProfile, remote())).toBe("pull");
  });

  it("3. revision一致 & ローカルに未反映の変更あり → push", () => {
    const dirtyLocal = local({ progress: { totalExp: 600, logCount: 11 } }); // lastSyncedProgressより進んでいる
    expect(decideSyncAction(dirtyLocal, remote({ revision: 3 }))).toBe("push");
  });

  it("3b. revision一致 & 変更なし → noop", () => {
    expect(decideSyncAction(local(), remote({ revision: 3 }))).toBe("noop");
  });

  it("4. remoteのrevisionが進んでいて、ローカルは未変更 → pull(早送り)", () => {
    expect(decideSyncAction(local({ lastSyncedRevision: 3 }), remote({ revision: 7, progress: { totalExp: 900, logCount: 20 } }))).toBe("pull");
  });

  it("5. 両方が最終同期後に変化している(分岐) → merge", () => {
    const dirtyLocal = local({ lastSyncedRevision: 3, progress: { totalExp: 600, logCount: 11 } });
    expect(decideSyncAction(dirtyLocal, remote({ revision: 7, progress: { totalExp: 900, logCount: 20 } }))).toBe("merge");
  });
});
