import type { SleepQuality } from "./types";

// 筋トレ科学の根拠:
//   8h以上 → 成長ホルモン分泌ピーク・筋タンパク合成最大化 (+10% EXP)
//   6〜8h  → 回復はある程度確保 (±0%)
//   6h未満 → 筋タンパク合成低下・テストステロン低下・コルチゾール増加 (-10% EXP)

export interface SleepOption {
  quality: SleepQuality;
  label: string;
  subLabel: string;
  emoji: string;
}

export const SLEEP_OPTIONS: SleepOption[] = [
  { quality: "good",   label: "よく寝た",      subLabel: "8時間以上", emoji: "😴" },
  { quality: "normal", label: "ふつう",        subLabel: "6〜8時間",  emoji: "🙂" },
  { quality: "poor",   label: "あまり寝てない", subLabel: "6時間未満", emoji: "🥱" },
];

export interface SleepCondition {
  quality: SleepQuality | null;
  expModifier: number;
  label: string;
  emoji: string;
  hint: string;
}

export function computeSleepCondition(quality: SleepQuality | null): SleepCondition {
  if (quality === null) {
    return { quality: null, expModifier: 1, label: "未記録", emoji: "💤", hint: "今日の睡眠を記録しよう" };
  }
  const map: Record<SleepQuality, Omit<SleepCondition, "quality">> = {
    good:   { expModifier: 1.1, label: "よく寝た",  emoji: "😴", hint: "成長ホルモン↑ 筋回復MAX →トレEXP +10%" },
    normal: { expModifier: 1.0, label: "ふつう",    emoji: "🙂", hint: "回復は十分" },
    poor:   { expModifier: 0.9, label: "睡眠不足",  emoji: "🥱", hint: "筋合成↓ コルチゾール↑ →トレEXP -10%" },
  };
  return { quality, ...map[quality] };
}
