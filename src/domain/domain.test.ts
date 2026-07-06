import { describe, it, expect } from "vitest";
import { computeStrengthExp, computeCardioExp, computeGold } from "./expEngine";
import { addExp, createAvatar, expForLevel } from "./avatar";
import { computeBmi, computePhysique, muscleTier } from "./physique";
import { computeCondition } from "./meals";
import { estimateSimpleMeal, simpleMealName, PROTEIN_LEVELS, MEAL_SIZES } from "./simpleMeal";
import { INITIAL_STATS } from "./avatar";
import { EXERCISE_MAP } from "./exercises";
import { bossAt, BOSSES } from "./bosses";
import { ACHIEVEMENTS } from "./achievements";
import { partTier, categoryToPart } from "./parts";
import { computeBuild, overallMuscle } from "./build";
import type { MealLog, Profile } from "./types";

describe("expEngine", () => {
  it("ボリューム(重量×レップ×係数/10)でEXPを計算する", () => {
    const bench = EXERCISE_MAP["bench"]; // coefficient 1.3
    // 60kg×10 ×3セット = 1800 volume ×1.3 /10 = 234
    const exp = computeStrengthExp(bench, [
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
    ], 70);
    expect(exp).toBe(234);
  });

  it("自重種目は体重を負荷に使う", () => {
    const pushup = EXERCISE_MAP["pushup"]; // bw factor 0.65, coeff 0.9
    // 70*0.65=45.5 ×20reps=910 ×0.9/10 = 81.9 -> 82
    const exp = computeStrengthExp(pushup, [{ weight: 0, reps: 20 }], 70);
    expect(exp).toBe(82);
  });

  it("有酸素はMETs×時間×体重係数", () => {
    const run = EXERCISE_MAP["run"]; // mets 8
    // 8 * 30 * (70/70) * 1 = 240
    expect(computeCardioExp(run, 30, 70)).toBe(240);
  });

  it("ゴールドはEXPの約1/5", () => {
    expect(computeGold(100)).toBe(20);
  });
});

describe("avatar leveling", () => {
  it("必要EXPはlevel^1.5カーブ", () => {
    expect(expForLevel(1)).toBe(100);
    expect(expForLevel(4)).toBe(800);
  });

  it("EXP加算で複数レベルアップできる", () => {
    const a = createAvatar();
    const res = addExp(a, 1000); // Lv1(100)+Lv2(282)+Lv3(519)=901 <1000
    expect(res.avatar.level).toBeGreaterThan(2);
    expect(res.leveledUp).toBe(true);
  });

  it("余りEXPは次レベルに繰り越される", () => {
    const a = createAvatar();
    const res = addExp(a, 150); // Lv1で100消費、50繰越
    expect(res.avatar.level).toBe(2);
    expect(res.avatar.expIntoLevel).toBe(50);
  });
});

describe("physique (身長+体重→体格)", () => {
  it("BMIを計算する", () => {
    expect(computeBmi(170, 65)).toBeCloseTo(22.49, 1);
  });

  it("痩せ型はslim、肥満はheavy", () => {
    expect(computePhysique(180, 55, 1, INITIAL_STATS).bodyType).toBe("slim");
    expect(computePhysique(160, 90, 1, INITIAL_STATS).bodyType).toBe("heavy");
  });

  it("レベルとSTRで筋肉段階が上がる", () => {
    expect(muscleTier(1, INITIAL_STATS)).toBe(0);
    expect(muscleTier(40, { ...INITIAL_STATS, str: 200 })).toBe(4);
  });
});

describe("meal condition", () => {
  const profile: Profile = { name: "t", heightCm: 170, weightKg: 70, goal: "keep" };
  const meal = (protein: number, calories: number): MealLog => ({
    id: "x", date: "2026-01-01", name: "m", protein, fat: 10, carb: 30, calories,
  });

  it("未記録の日は中立(補正なし)", () => {
    const c = computeCondition([], profile);
    expect(c.expModifier).toBe(1);
  });

  it("タンパク質充足でEXPボーナスがつく", () => {
    // 目標 70*1.6=112g
    const c = computeCondition([meal(120, 2310)], profile);
    expect(c.expModifier).toBeGreaterThan(1);
  });

  it("栄養不足はデバフになる", () => {
    const c = computeCondition([meal(10, 300)], profile);
    expect(c.expModifier).toBeLessThan(1);
  });
});

describe("simple meal (かんたん記録の推定)", () => {
  it("PFCの合計エネルギーが表示カロリーとおおむね一致する", () => {
    for (const p of PROTEIN_LEVELS) {
      for (const s of MEAL_SIZES) {
        const e = estimateSimpleMeal(p.id, s.id);
        const energy = e.protein * 4 + e.fat * 9 + e.carb * 4;
        // 丸め誤差ぶんだけ許容
        expect(Math.abs(energy - e.calories)).toBeLessThanOrEqual(10);
      }
    }
  });

  it("タンパク質しっかり×3食で初心者の目標に近づく(習慣化ループが回る)", () => {
    // 体重60kgの目標 = 96g。しっかり30g×3食+間食で概ね達成圏
    const e = estimateSimpleMeal("solid", "normal");
    expect(e.protein * 3).toBeGreaterThanOrEqual(85);
  });

  it("量感の選択がカロリーの大小に単調に反映される", () => {
    const big = estimateSimpleMeal("some", "big");
    const normal = estimateSimpleMeal("some", "normal");
    const light = estimateSimpleMeal("some", "light");
    expect(big.calories).toBeGreaterThan(normal.calories);
    expect(normal.calories).toBeGreaterThan(light.calories);
  });

  it("自動ラベルは選択内容が分かる名前になる", () => {
    expect(simpleMealName("solid", "normal")).toContain("しっかり");
    expect(simpleMealName("none", "light")).toContain("軽め");
  });
});

describe("bosses", () => {
  it("リスト内のボスを返す", () => {
    expect(bossAt(0)).toBe(BOSSES[0]);
    expect(bossAt(0).maxHp).toBeGreaterThan(0);
  });

  it("リスト外は無限スケーリングのボス", () => {
    const a = bossAt(BOSSES.length);
    const b = bossAt(BOSSES.length + 1);
    expect(a.name).toContain("鍛錬の化身");
    expect(b.maxHp).toBeGreaterThan(a.maxHp); // 進むほど強い
  });

  it("HPは段階的に増える", () => {
    for (let i = 1; i < BOSSES.length; i++) {
      expect(BOSSES[i].maxHp).toBeGreaterThan(BOSSES[i - 1].maxHp);
    }
  });
});

describe("achievements", () => {
  const base = { level: 1, totalExp: 0, bestStreak: 0, totalWorkouts: 0, bossesDefeated: 0, muscle: 0 };

  it("初トレは1回で達成", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "first_workout")!;
    expect(ach.check({ ...base, totalWorkouts: 1 })).toBe(true);
    expect(ach.check(base)).toBe(false);
  });

  it("Lv25の実績はレベル到達で達成", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "level_25")!;
    expect(ach.check({ ...base, level: 25 })).toBe(true);
    expect(ach.check({ ...base, level: 24 })).toBe(false);
  });

  it("IDは一意", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parts (部位別レベル)", () => {
  it("ボリュームで段階が上がる", () => {
    expect(partTier(0)).toBe(0);
    expect(partTier(1500)).toBe(1);
    expect(partTier(6000)).toBe(2);
    expect(partTier(100000)).toBe(4);
  });

  it("カテゴリを部位にマップ(有酸素はコンディション)", () => {
    expect(categoryToPart("arms")).toBe("arms");
    expect(categoryToPart("cardio")).toBe("conditioning");
  });

  it("鍛えた部位だけ発達する", () => {
    const vols = { chest: 0, back: 20000, shoulders: 0, arms: 0, legs: 0, core: 0, conditioning: 0 };
    const build = computeBuild(170, 65, vols, "front");
    expect(build.parts.back).toBeGreaterThan(0);
    expect(build.parts.arms).toBe(0);
  });

  it("体型はBMIで決まる(部位ゼロでも太い/細いが出る)", () => {
    const skinny = computeBuild(180, 50, undefined, "front");
    const heavy = computeBuild(160, 95, undefined, "front");
    expect(skinny.girth).toBeLessThan(heavy.girth);
    expect(overallMuscle(skinny.parts)).toBe(0);
  });
});
