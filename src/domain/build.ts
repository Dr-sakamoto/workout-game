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

export const BODY_FAT_LABELS = ["ガリガリ", "細い", "標準", "ぽっちゃり", "デブ"];
