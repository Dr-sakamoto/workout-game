import { computeBmi, girthFromBmi } from "./physique";
import { VISUAL_PARTS, partTiers, type PartTiers, type PartVolumes } from "./parts";

// アバターの「見た目を決める材料」をひとまとめにした型。
// 体型(BMI由来の脂肪) × 部位別の発達 × 前後どちらを見るか。
// パラメトリックに見た目を作る = 部位別・体型・将来の細分化に耐える本来の設計。

export type AvatarView = "front" | "back";

export interface AvatarBuild {
  girth: number; // 0..4 脂肪由来の横幅
  soft: number; // たるみ(脂肪が筋肉に勝っている度合い) 0..4
  parts: PartTiers; // 部位ごとの発達 0..4
  view: AvatarView;
}

export function overallMuscle(parts: PartTiers): number {
  const sum = VISUAL_PARTS.reduce((a, p) => a + parts[p], 0);
  return Math.round(sum / VISUAL_PARTS.length);
}

export function computeBuild(
  heightCm: number,
  weightKg: number,
  volumes: PartVolumes | undefined,
  view: AvatarView = "front",
  bodyFatOverride?: number | null,
): AvatarBuild {
  // 体脂肪(全身)は BMI が初期値。ユーザーが自分に合わせて上書きできる。
  const girth =
    bodyFatOverride != null
      ? Math.max(0, Math.min(4, bodyFatOverride))
      : girthFromBmi(computeBmi(heightCm, weightKg));
  const parts = volumes
    ? partTiers(volumes)
    : { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, core: 0 };
  const soft = Math.max(0, girth - overallMuscle(parts));
  return { girth, soft, parts, view };
}

/**
 * HP が尽きたときの一時的な「なまった」見た目。表示上だけ全部位の発達を
 * 1段階落とし、たるみ(soft)を再計算する。実データ(partVolumes)は一切
 * 減らさない —— トレーニングで HP が戻れば見た目も元通りになる。
 *
 * 「鍛えた肉体こそ報酬」(原則1)なので、サボると"その報酬が少しだけ陰る"
 * のは強い復帰動機になる。ただし恒久的に奪うと理不尽なので、あくまで
 * 可逆・一時的な演出にとどめる。
 */
export function weakenedBuild(build: AvatarBuild): AvatarBuild {
  const parts = { ...build.parts };
  for (const p of VISUAL_PARTS) parts[p] = Math.max(0, parts[p] - 1);
  const soft = Math.max(0, build.girth - overallMuscle(parts));
  return { ...build, parts, soft };
}

export const BODY_FAT_LABELS = ["ガリガリ", "細い", "標準", "ぽっちゃり", "デブ"];
