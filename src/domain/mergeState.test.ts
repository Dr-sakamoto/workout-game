import { describe, it, expect } from "vitest";
import { mergeDurableStates } from "./mergeState";
import type { DurableGameState } from "./sync";
import { applyWorkoutLog, type WorkoutReducerState } from "./workoutReducer";
import { createAvatar, maxHp } from "./avatar";
import { EXERCISE_MAP } from "./exercises";
import { emptyPartVolumes } from "./parts";
import { bossAt } from "./bosses";
import type { MealLog, Profile, WorkoutLog, WorkoutSet } from "./types";

// P4: mergeDurableStates は「勝った側を丸ごと採用」ではなく、ログをUNIONし、
// 派生状態(EXP/ボス/ストリーク/自己ベスト/部位ボリューム)を保存済みの値だけ
// から再計算する。ここでは「どちらの端末単体でも見えないはずの結果
// (合算して初めてボスを倒す/ストリークが繋がる)」が正しく出ることを検証する。

const profile: Profile = {
  name: "t",
  heightCm: 170,
  weightKg: 70,
  goal: "keep",
  trainingDays: [1, 3, 5], // 月・水・金
};

/** 1台の端末が独立に記録してきた履歴を再現し、DurableGameStateを組み立てる */
function buildState(
  entries: { id: string; today: string; exerciseId: string; sets: WorkoutSet[] }[],
): DurableGameState {
  let state: WorkoutReducerState = {
    avatar: createAvatar(),
    boss: { index: 0, hp: bossAt(0).maxHp },
    bossesDefeated: 0,
    streak: { count: 0, lastDate: null },
    streakShields: 0,
    expBoostCharges: 0,
    records: { bestVolumeByExercise: {}, bestDayExp: 0, bestStreak: 0 },
    partVolumes: emptyPartVolumes(),
    playerHp: maxHp(createAvatar().stats),
  };
  const workoutLogs: WorkoutLog[] = [];
  for (const e of entries) {
    const result = applyWorkoutLog(state, {
      id: e.id,
      today: e.today,
      profile,
      exercise: EXERCISE_MAP[e.exerciseId],
      sets: e.sets,
      allMealLogs: [],
      allSleepLogs: [],
      allWorkoutLogs: workoutLogs,
    })!;
    workoutLogs.unshift(result.log);
    state = {
      avatar: result.avatar,
      boss: result.boss,
      bossesDefeated: result.bossesDefeated,
      streak: result.streak,
      streakShields: result.streakShields,
      expBoostCharges: result.expBoostCharges,
      records: result.records,
      partVolumes: result.partVolumes,
      playerHp: result.playerHp,
    };
  }
  return {
    profile,
    avatar: state.avatar,
    workoutLogs,
    mealLogs: [],
    sleepLogs: [],
    streak: state.streak,
    claimedQuestsByDate: {},
    startSnapshot: null,
    records: state.records,
    boss: state.boss,
    bossesDefeated: state.bossesDefeated,
    claimedAchievements: [],
    expBoostCharges: state.expBoostCharges,
    streakShields: state.streakShields,
    partVolumes: state.partVolumes,
    bodyFat: null,
    lastSetsByExercise: {},
    lastMinutesByExercise: {},
    favorites: [],
    playerHp: state.playerHp,
  };
}

// local: 月(7/6)curl 100kg*25(vol2500,exp200) → 水(7/8)curl 50kg*10(vol500,exp40)
// remote: 金(7/10)curl 150kg*10(vol1500,exp120)
// いずれの端末単体でもボス0(HP300)は倒せない(local合計240 / remote合計120)。
// マージして初めて 200+40+120=360 > 300 でボスを倒す。
// ストリークも同様、localは月水で2、remoteは金で1、マージで月水金の3が繋がる。
const local = buildState([
  { id: "log-mon", today: "2026-07-06", exerciseId: "curl", sets: [{ weight: 100, reps: 25 }] },
  { id: "log-wed", today: "2026-07-08", exerciseId: "curl", sets: [{ weight: 50, reps: 10 }] },
]);
const remote = buildState([
  { id: "log-fri", today: "2026-07-10", exerciseId: "curl", sets: [{ weight: 150, reps: 10 }] },
]);

describe("mergeDurableStates: ログのUNION(データ損失なし)", () => {
  it("両側のユニークなworkoutLogsをすべて保持する(3件とも残る)", () => {
    const merged = mergeDurableStates(local, remote);
    const ids = merged.workoutLogs.map((w) => w.id).sort();
    expect(ids).toEqual(["log-fri", "log-mon", "log-wed"]);
  });

  it("workoutLogsは新しい日付が先頭(既存の並び順)", () => {
    const merged = mergeDurableStates(local, remote);
    expect(merged.workoutLogs[0].date).toBe("2026-07-10");
    expect(merged.workoutLogs[merged.workoutLogs.length - 1].date).toBe("2026-07-06");
  });

  it("マージ後のログからundo(取り消しスナップショット)は取り除かれる", () => {
    const merged = mergeDurableStates(local, remote);
    expect(merged.workoutLogs.every((w) => w.undo === undefined)).toBe(true);
  });
});

describe("mergeDurableStates: 派生状態の再計算(保存済みの値のみ使用)", () => {
  it("totalExpは両側のearnedExpを合算した値になる(局所的にはボス未撃破)", () => {
    const merged = mergeDurableStates(local, remote);
    expect(merged.avatar.totalExp).toBe(200 + 40 + 120); // = 360
  });

  it("ステータス(dex主/vitスピル)は両側のstatGainsを合算する", () => {
    const merged = mergeDurableStates(local, remote);
    // dex主: round(200*0.12)+round(40*0.12)+round(120*0.12) = 24+5+14 = 43
    // vitスピル: round(200*0.04)+round(40*0.04)+round(120*0.04) = 8+2+5 = 15
    expect(merged.avatar.stats.dex).toBe(5 + 43);
    expect(merged.avatar.stats.vit).toBe(5 + 15);
  });

  it("部位ボリューム(arms)は両側のボリュームを合算する", () => {
    const merged = mergeDurableStates(local, remote);
    expect(merged.partVolumes.arms).toBe(2500 + 500 + 1500); // = 4500
  });

  it("ボス: どちらの端末単体でも倒せないが、合算すると倒す(局所には見えない結果)", () => {
    expect(local.bossesDefeated).toBe(0);
    expect(remote.bossesDefeated).toBe(0);
    const merged = mergeDurableStates(local, remote);
    expect(merged.bossesDefeated).toBe(1);
    expect(merged.boss).toEqual({ index: 1, hp: bossAt(1).maxHp });
  });

  it("ストリーク: どちらの端末単体でも2止まりだが、合算すると月水金で3繋がる", () => {
    expect(local.streak.count).toBe(2);
    expect(remote.streak.count).toBe(1);
    const merged = mergeDurableStates(local, remote);
    expect(merged.streak).toEqual({ count: 3, lastDate: "2026-07-10" });
    expect(merged.records.bestStreak).toBe(3);
  });

  it("自己ベスト(ボリューム)は両側の記録値のmaxを取る", () => {
    const merged = mergeDurableStates(local, remote);
    expect(merged.records.bestVolumeByExercise.curl).toBe(2500); // local(2500) > remote(1500)
  });

  it("winner/loserを入れ替えても、UNION・再計算の結果は同じになる", () => {
    const a = mergeDurableStates(local, remote);
    const b = mergeDurableStates(remote, local);
    expect(a.avatar.totalExp).toBe(b.avatar.totalExp);
    expect(a.bossesDefeated).toBe(b.bossesDefeated);
    expect(a.streak).toEqual(b.streak);
    expect(a.partVolumes).toEqual(b.partVolumes);
  });
});

describe("mergeDurableStates: winnerの値をそのまま引き継ぐ項目", () => {
  it("gold/expBoostCharges/streakShields/playerHp/bodyFatはwinner優先", () => {
    const winnerState: DurableGameState = { ...local, avatar: { ...local.avatar, gold: 999 }, expBoostCharges: 3, streakShields: 2, bodyFat: 1, playerHp: 42 };
    const merged = mergeDurableStates(winnerState, remote);
    expect(merged.avatar.gold).toBe(999);
    expect(merged.expBoostCharges).toBe(3);
    expect(merged.streakShields).toBe(2);
    expect(merged.bodyFat).toBe(1);
    expect(merged.playerHp).toBe(42);
  });
});

describe("mergeDurableStates: クエスト/実績/お気に入り/食事ログのUNION", () => {
  it("claimedQuestsByDateは日付ごとにクエストIDをUNIONする", () => {
    const a = { ...local, claimedQuestsByDate: { "2026-07-06": ["train_today"] } };
    const b = { ...remote, claimedQuestsByDate: { "2026-07-06": ["log_meal"], "2026-07-10": ["train_today"] } };
    const merged = mergeDurableStates(a, b);
    expect(merged.claimedQuestsByDate["2026-07-06"].sort()).toEqual(["log_meal", "train_today"]);
    expect(merged.claimedQuestsByDate["2026-07-10"]).toEqual(["train_today"]);
  });

  it("claimedAchievements/favoritesはUNIONされ重複しない", () => {
    const a = { ...local, claimedAchievements: ["first_workout"], favorites: ["bench"] };
    const b = { ...remote, claimedAchievements: ["first_workout", "workouts_10"], favorites: ["squat"] };
    const merged = mergeDurableStates(a, b);
    expect(merged.claimedAchievements.sort()).toEqual(["first_workout", "workouts_10"]);
    expect(merged.favorites.sort()).toEqual(["bench", "squat"]);
  });

  it("mealLogsはidでUNIONし、同じidが両側にある場合はwinner側の内容を優先する", () => {
    const shared: MealLog = { id: "meal-1", date: "2026-07-06", name: "鶏胸肉", protein: 30, fat: 2, carb: 0, calories: 150 };
    const editedByLoser: MealLog = { ...shared, name: "鶏胸肉(修正)", protein: 999 };
    const a = { ...local, mealLogs: [shared] };
    const b = { ...remote, mealLogs: [editedByLoser] };
    const merged = mergeDurableStates(a, b); // a=winner
    expect(merged.mealLogs).toHaveLength(1);
    expect(merged.mealLogs[0].protein).toBe(30); // winner(a)側の値が残る
  });
});
