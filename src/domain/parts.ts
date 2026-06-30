import type { ExerciseCategory } from "./types";

// 部位別レベル。鍛えた部位だけが見た目に反映される（腕トレ→腕、背中トレ→背中）。
// 数値は表に出さず、閾値を越えると段階(tier)が上がる = アバターのその部位が育つ。

export type VisualPart = "chest" | "back" | "shoulders" | "arms" | "legs" | "core";
export type PartKey = VisualPart | "conditioning";

export const VISUAL_PARTS: VisualPart[] = [
  "chest", "back", "shoulders", "arms", "legs", "core",
];

export const PART_LABELS: Record<VisualPart, { label: string; emoji: string }> = {
  chest: { label: "胸", emoji: "🫁" },
  back: { label: "背中", emoji: "🦅" },
  shoulders: { label: "肩", emoji: "🪨" },
  arms: { label: "腕", emoji: "💪" },
  legs: { label: "脚", emoji: "🦵" },
  core: { label: "体幹", emoji: "🔥" },
};

/** 種目カテゴリ → 見た目の部位 */
export function categoryToPart(category: ExerciseCategory): PartKey {
  if (category === "cardio") return "conditioning";
  return category;
}

// 部位ごとの累積ボリュームに対する段階しきい値(0..4)。
// 序盤は早めに1段上がって「変化」を体感させ、上ほど遠くする。
const TIER_THRESHOLDS = [1500, 6000, 18000, 45000];

export function partTier(volume: number): number {
  let tier = 0;
  for (const t of TIER_THRESHOLDS) {
    if (volume >= t) tier += 1;
    else break;
  }
  return tier; // 0..4
}

/** 次の段階まであと何ボリュームか(進捗バー用) */
export function partProgress(volume: number): { tier: number; pct: number } {
  const tier = partTier(volume);
  if (tier >= TIER_THRESHOLDS.length) return { tier, pct: 1 };
  const lo = tier === 0 ? 0 : TIER_THRESHOLDS[tier - 1];
  const hi = TIER_THRESHOLDS[tier];
  return { tier, pct: Math.max(0, Math.min(1, (volume - lo) / (hi - lo))) };
}

export type PartTiers = Record<VisualPart, number>;
export type PartVolumes = Record<PartKey, number>;

export function emptyPartVolumes(): PartVolumes {
  return { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, core: 0, conditioning: 0 };
}

export function partTiers(volumes: PartVolumes): PartTiers {
  return {
    chest: partTier(volumes.chest),
    back: partTier(volumes.back),
    shoulders: partTier(volumes.shoulders),
    arms: partTier(volumes.arms),
    legs: partTier(volumes.legs),
    core: partTier(volumes.core),
  };
}
