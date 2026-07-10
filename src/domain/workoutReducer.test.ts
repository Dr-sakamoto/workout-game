import { describe, it, expect } from "vitest";
import { applyWorkoutLog, workoutVolume, type WorkoutReducerState } from "./workoutReducer";
import { createAvatar, maxHp, INITIAL_STATS } from "./avatar";
import { EXERCISE_MAP } from "./exercises";
import { emptyPartVolumes } from "./parts";
import { bossAt } from "./bosses";
import type { Profile } from "./types";

// D-2: useGameStore.logWorkout に集中していたロジックを純関数として抽出したもの。
// ストア(store.test.ts)は「取り消し」など横断的なふるまいの検証に留め、こちらは
// applyWorkoutLog 自体の計算(EXP/ボス/ストリーク/自己ベスト/HP/取り消しスナップショット)
// をピンポイントで検証する。

const profile: Profile = {
  name: "t",
  heightCm: 170,
  weightKg: 70,
  goal: "keep",
  trainingDays: [1, 3, 5], // 月・水・金
};

function freshState(overrides: Partial<WorkoutReducerState> = {}): WorkoutReducerState {
  return {
    avatar: createAvatar(),
    boss: { index: 0, hp: bossAt(0).maxHp },
    bossesDefeated: 0,
    streak: { count: 0, lastDate: null },
    streakShields: 0,
    expBoostCharges: 0,
    records: { bestVolumeByExercise: {}, bestDayExp: 0, bestStreak: 0 },
    partVolumes: emptyPartVolumes(),
    playerHp: maxHp(INITIAL_STATS),
    ...overrides,
  };
}

describe("workoutReducer: applyWorkoutLog 基本計算", () => {
  it("空の記録(reps<=0など)はnullを返す(何も起きない)", () => {
    const result = applyWorkoutLog(freshState(), {
      id: "1",
      today: "2026-07-13", // 月曜(予定日)
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 60, reps: 0 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    });
    expect(result).toBeNull();
  });

  it("EXP/ゴールド/ステータス/ログの内容を計算する", () => {
    const result = applyWorkoutLog(freshState(), {
      id: "log-1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }, { weight: 60, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;

    // 60kg*10*3セット=1800vol *1.3/10=234 (未記録の食事/睡眠は補正なし=×1)
    expect(result.log.baseExp).toBe(234);
    expect(result.log.earnedExp).toBe(234);
    expect(result.log.id).toBe("log-1");
    expect(result.log.exerciseId).toBe("bench");
    expect(result.avatar.totalExp).toBe(234);
    expect(result.reward.gold).toBeGreaterThan(0);
    expect(result.reward.statText).toContain("STR");
  });

  it("EXPブーストのチャージを1消費し、獲得EXPが1.5倍になる", () => {
    const withBoost = freshState({ expBoostCharges: 2 });
    const result = applyWorkoutLog(withBoost, {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 60, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    // 60*10=600vol*1.3/10=78 base -> ブーストで78*1.5=117
    expect(result.log.baseExp).toBe(78);
    expect(result.log.earnedExp).toBe(117);
    expect(result.expBoostCharges).toBe(1);
    expect(result.reward.expBoostUsed).toBe(true);
  });
});

describe("workoutReducer: ボス戦", () => {
  it("獲得EXPがボスHPを削り、0以下で撃破して次のボスへ", () => {
    const result = applyWorkoutLog(freshState(), {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }, { weight: 100, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    // 100*10*3=3000vol*1.3/10=390EXP > 初代ボスHP300
    expect(result.reward.bossDefeated).toBe(bossAt(0).name);
    expect(result.bossesDefeated).toBe(1);
    expect(result.boss.index).toBe(1);
    expect(result.boss.hp).toBe(bossAt(1).maxHp); // オーバーキル分は持ち越さない
    // ボス撃破報酬EXPもアバターに乗る
    expect(result.avatar.totalExp).toBe(390 + bossAt(0).rewardExp);
  });

  it("ボスを倒さない場合はHPが単に減る", () => {
    const result = applyWorkoutLog(freshState(), {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 20, reps: 5 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.reward.bossDefeated).toBeUndefined();
    expect(result.bossesDefeated).toBe(0);
    expect(result.boss.index).toBe(0);
    expect(result.boss.hp).toBeLessThan(bossAt(0).maxHp);
  });
});

describe("workoutReducer: ストリーク(スケジュール基準)", () => {
  it("予定日に記録するとストリークが1から始まる", () => {
    const result = applyWorkoutLog(freshState(), {
      id: "1",
      today: "2026-07-13", // 月曜=予定日
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 40, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.streak).toEqual({ count: 1, lastDate: "2026-07-13" });
  });

  it("予定外の日(休養日)の記録はストリークに影響しない", () => {
    const state = freshState({ streak: { count: 3, lastDate: "2026-07-11" } }); // 前回=土曜(予定外)
    const result = applyWorkoutLog(state, {
      id: "1",
      today: "2026-07-12", // 日曜(予定外)
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 40, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.streak).toEqual({ count: 3, lastDate: "2026-07-11" });
  });

  it("直前の予定日を飛ばすとストリークが1にリセットされる", () => {
    // 前回は月曜(7/6)。次の予定日は水曜(7/8)のはずが飛ばして金曜(7/10)に記録
    const state = freshState({ streak: { count: 5, lastDate: "2026-07-06" } });
    const result = applyWorkoutLog(state, {
      id: "1",
      today: "2026-07-10",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 40, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.streak.count).toBe(1);
  });

  it("ストリークシールドがあれば予定日を飛ばしても継続を守れる", () => {
    const state = freshState({ streak: { count: 5, lastDate: "2026-07-06" }, streakShields: 1 });
    const result = applyWorkoutLog(state, {
      id: "1",
      today: "2026-07-10",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 40, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.streak).toEqual({ count: 6, lastDate: "2026-07-10" });
    expect(result.streakShields).toBe(0);
  });
});

describe("workoutReducer: 自己ベスト(ライバルは自分)", () => {
  it("同種目の自己ベストボリューム更新を検出する", () => {
    const state = freshState({
      records: { bestVolumeByExercise: { bench: 500 }, bestDayExp: 0, bestStreak: 0 },
    });
    const result = applyWorkoutLog(state, {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 60, reps: 10 }], // vol=600 > 500
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.reward.newBest).toContain("自己ベスト更新");
    expect(result.records.bestVolumeByExercise.bench).toBe(600);
  });

  it("初回記録(prevBest=0)は自己ベスト更新扱いにしない(比較対象がないため)", () => {
    const result = applyWorkoutLog(freshState(), {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 60, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.reward.newBest).toBeUndefined();
    expect(result.records.bestVolumeByExercise.bench).toBe(600);
  });

  it("部位別ボリューム(partVolumes)が加算される", () => {
    const result = applyWorkoutLog(freshState(), {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"], // chest
      sets: [{ weight: 60, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.partVolumes.chest).toBe(600); // = workoutVolume
  });
});

describe("workoutReducer: HP回復と取り消しスナップショット", () => {
  it("獲得EXPの1/4ぶんHPが回復し、最大HPを超えない", () => {
    // curl(coefficient 0.8, targetStat=dex)を使い、VITスピルオーバーを0にして
    // 最大HP(maxHp = 50+vit*2)がこの記録で動かないようにする(比較を単純化)。
    const mhp = maxHp(INITIAL_STATS); // 60
    const state = freshState({ playerHp: mhp - 1 });
    const result = applyWorkoutLog(state, {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["curl"],
      sets: [{ weight: 15, reps: 10 }], // vol=150 *0.8/10=12EXP -> 回復floor(12/4)=3
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.log.earnedExp).toBe(12);
    expect(result.playerHp).toBe(mhp); // 59+3=62 は上限60でクランプ
  });

  it("undoスナップショットは記録前の状態を保持する", () => {
    const state = freshState({
      streak: { count: 2, lastDate: "2026-07-11" },
      playerHp: 55,
    });
    const result = applyWorkoutLog(state, {
      id: "1",
      today: "2026-07-13",
      profile,
      exercise: EXERCISE_MAP["bench"],
      sets: [{ weight: 40, reps: 10 }],
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: [],
    })!;
    expect(result.log.undo).toBeDefined();
    expect(result.log.undo!.streak).toEqual({ count: 2, lastDate: "2026-07-11" });
    expect(result.log.undo!.playerHp).toBe(55);
    expect(result.log.undo!.boss).toEqual({ index: 0, hp: bossAt(0).maxHp });
  });
});

describe("workoutReducer: workoutVolume", () => {
  it("自重種目は体重×係数+加重ぶんを負荷にする", () => {
    expect(workoutVolume([{ weight: 10, reps: 10 }], true, 0.65, 70)).toBeCloseTo((70 * 0.65 + 10) * 10);
  });

  it("reps<=0のセットは無視する", () => {
    expect(workoutVolume([{ weight: 60, reps: 0 }], false, 0.6, 70)).toBe(0);
  });
});
