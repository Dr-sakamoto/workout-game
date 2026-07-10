import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore, selectToday } from "./useGameStore";
import type { Profile } from "../domain/types";

// 取り消し(undoWorkout)はストアの多くのスライスを横断して巻き戻すため、
// domainテストとは別にストアそのものを検証する。

const profile: Profile = {
  name: "テスト",
  heightCm: 170,
  weightKg: 70,
  goal: "keep",
  trainingDays: [0, 1, 2, 3, 4, 5, 6], // 毎日予定日にして曜日依存を消す
};

function snapshot() {
  const s = useGameStore.getState();
  return {
    avatar: s.avatar,
    streak: s.streak,
    boss: s.boss,
    bossesDefeated: s.bossesDefeated,
    partVolumes: s.partVolumes,
    records: s.records,
    playerHp: s.playerHp,
    expBoostCharges: s.expBoostCharges,
    streakShields: s.streakShields,
  };
}

beforeEach(() => {
  useGameStore.getState().resetAll();
  useGameStore.getState().initProfile(profile);
});

describe("undoWorkout", () => {
  it("直近のトレ記録を取り消すと、状態が記録前に完全に戻る", () => {
    const before = snapshot();
    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] });

    const logged = useGameStore.getState();
    expect(logged.workoutLogs.length).toBe(1);
    expect(logged.avatar.totalExp).toBeGreaterThan(0);

    useGameStore.getState().undoWorkout(logged.workoutLogs[0].id);

    const after = useGameStore.getState();
    expect(after.workoutLogs.length).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(after.lastReward).toBeNull();
  });

  it("ボスを倒した記録の取り消しで、ボス・討伐数・報酬ゴールドも巻き戻る", () => {
    const before = snapshot();
    // ベンチ100kg×10×3 = 3000vol ×1.3/10 = 390EXP > 初代ボスHP300
    useGameStore.getState().logWorkout("bench", {
      sets: [
        { weight: 100, reps: 10 },
        { weight: 100, reps: 10 },
        { weight: 100, reps: 10 },
      ],
    });

    const logged = useGameStore.getState();
    expect(logged.bossesDefeated).toBe(1);
    expect(logged.boss.index).toBe(1);

    useGameStore.getState().undoWorkout(logged.workoutLogs[0].id);
    expect(snapshot()).toEqual(before);
  });

  it("最新でない記録は取り消せない", () => {
    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] });
    const firstId = useGameStore.getState().workoutLogs[0].id;
    useGameStore.getState().logWorkout("squat", { sets: [{ weight: 60, reps: 10 }] });

    useGameStore.getState().undoWorkout(firstId);
    expect(useGameStore.getState().workoutLogs.length).toBe(2);
  });

  it("2回目の記録を取り消しても1回目の記録とストリークは残る", () => {
    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] });
    const mid = snapshot();
    useGameStore.getState().logWorkout("squat", { sets: [{ weight: 60, reps: 10 }] });

    const latest = useGameStore.getState().workoutLogs[0];
    useGameStore.getState().undoWorkout(latest.id);

    expect(useGameStore.getState().workoutLogs.length).toBe(1);
    expect(snapshot()).toEqual(mid);
  });

  it("EXPブーストを消費した記録の取り消しでチャージが戻る", () => {
    // ゴールドを直接持たせてブーストを購入
    useGameStore.setState((s) => ({ avatar: { ...s.avatar, gold: 1000 } }));
    useGameStore.getState().buyItem("expBoost");
    expect(useGameStore.getState().expBoostCharges).toBe(1);

    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] });
    expect(useGameStore.getState().expBoostCharges).toBe(0);

    useGameStore.getState().undoWorkout(useGameStore.getState().workoutLogs[0].id);
    expect(useGameStore.getState().expBoostCharges).toBe(1);
  });
});

describe("アカウント同期のブックキーピング(SYNC_DESIGN.md)", () => {
  it("既定でsyncEnabledはON、lastSyncedProgress/Revisionは未同期(0)から始まる", () => {
    const s = useGameStore.getState();
    expect(s.syncEnabled).toBe(true);
    expect(s.lastSyncedRevision).toBe(0);
    expect(s.lastSyncedProgress).toEqual({ totalExp: 0, logCount: 0 });
    expect(s.syncNotice).toBeNull();
  });

  it("setSyncEnabled でON/OFFを切り替えられる", () => {
    useGameStore.getState().setSyncEnabled(false);
    expect(useGameStore.getState().syncEnabled).toBe(false);
    useGameStore.getState().setSyncEnabled(true);
    expect(useGameStore.getState().syncEnabled).toBe(true);
  });

  it("clearSyncNotice で通知を消せる", () => {
    useGameStore.setState({ syncNotice: "別の端末の記録と同期しました" });
    useGameStore.getState().clearSyncNotice();
    expect(useGameStore.getState().syncNotice).toBeNull();
  });

  it("resetAll で同期のブックキーピングも初期化される(次回起動時に同期し直せる)", () => {
    useGameStore.setState({
      syncEnabled: false,
      lastSyncedRevision: 42,
      lastSyncedProgress: { totalExp: 999, logCount: 9 },
      syncNotice: "x",
    });
    useGameStore.getState().resetAll();
    const s = useGameStore.getState();
    expect(s.syncEnabled).toBe(true);
    expect(s.lastSyncedRevision).toBe(0);
    expect(s.lastSyncedProgress).toEqual({ totalExp: 0, logCount: 0 });
    expect(s.syncNotice).toBeNull();
  });
});

describe("claimQuest / claimAchievement は報酬値をUIから信用しない(D-5)", () => {
  it("未達成のクエストIDを渡しても何も起きない(進行中の train_today)", () => {
    const before = useGameStore.getState().avatar.gold;
    useGameStore.getState().claimQuest("train_today"); // まだ記録なし=未達成
    expect(useGameStore.getState().avatar.gold).toBe(before);
    expect(useGameStore.getState().claimedQuestsByDate).toEqual({});
  });

  it("存在しないクエストIDを渡しても何も起きない", () => {
    const before = useGameStore.getState().avatar.gold;
    useGameStore.getState().claimQuest("no-such-quest");
    expect(useGameStore.getState().avatar.gold).toBe(before);
  });

  it("達成済みのクエストは正準の報酬(quests.tsの値)でしか受け取れない", () => {
    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] });
    useGameStore.getState().claimQuest("train_today");
    const s = useGameStore.getState();
    expect(s.claimedQuestsByDate[Object.keys(s.claimedQuestsByDate)[0]]).toContain("train_today");
    expect(s.lastReward?.exp).toBe(30); // quests.ts の train_today.rewardExp
    expect(s.lastReward?.gold).toBe(10);
  });

  it("同じクエストは2回受け取れない", () => {
    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] });
    useGameStore.getState().claimQuest("train_today");
    const goldAfterFirst = useGameStore.getState().avatar.gold;
    useGameStore.getState().claimQuest("train_today");
    expect(useGameStore.getState().avatar.gold).toBe(goldAfterFirst);
  });

  it("未達成の実績IDを渡しても何も起きない", () => {
    const before = useGameStore.getState().avatar.gold;
    useGameStore.getState().claimAchievement("level_25"); // Lv1では未達成
    expect(useGameStore.getState().avatar.gold).toBe(before);
    expect(useGameStore.getState().claimedAchievements).toEqual([]);
  });

  it("存在しない実績IDを渡しても何も起きない", () => {
    const before = useGameStore.getState().avatar.gold;
    useGameStore.getState().claimAchievement("no-such-achievement");
    expect(useGameStore.getState().avatar.gold).toBe(before);
  });

  it("達成済みの実績は正準の報酬(achievements.tsの値)でしか受け取れない", () => {
    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] }); // totalWorkouts>=1
    useGameStore.getState().claimAchievement("first_workout");
    const s = useGameStore.getState();
    expect(s.claimedAchievements).toContain("first_workout");
    expect(s.lastReward?.gold).toBe(10); // achievements.ts の first_workout.rewardGold
  });
});

describe("selectToday のメモ化(D-3)", () => {
  it("無関係な状態変更(同期トグル等)では同じ結果オブジェクトを返す", () => {
    const first = selectToday(useGameStore.getState());
    useGameStore.getState().setSyncEnabled(false);
    const second = selectToday(useGameStore.getState());
    expect(second).toBe(first); // 参照が同じ=再レンダーを誘発しない
    useGameStore.getState().setSyncEnabled(true);
  });

  it("記録を追加すると新しい結果を返す(内容も正しい)", () => {
    const first = selectToday(useGameStore.getState());
    useGameStore.getState().logWorkout("bench", { sets: [{ weight: 40, reps: 10 }] });
    const second = selectToday(useGameStore.getState());
    expect(second).not.toBe(first);
    expect(second.workouts.length).toBe(1);
  });
});
