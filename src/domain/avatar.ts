import type { Avatar, Stats } from "./types";

// DESIGN.md §2.3 レベルカーブ & §2.4 見た目の成長

const BASE_EXP = 100;

/** その level から次の level へ上がるのに必要なEXP */
export function expForLevel(level: number): number {
  return Math.floor(BASE_EXP * Math.pow(level, 1.5));
}

export const INITIAL_STATS: Stats = { str: 5, end: 5, vit: 5, agi: 5, dex: 5 };

export function createAvatar(): Avatar {
  return {
    level: 1,
    totalExp: 0,
    expIntoLevel: 0,
    expForNextLevel: expForLevel(1),
    stats: { ...INITIAL_STATS },
    gold: 0,
  };
}

export interface LevelUpResult {
  avatar: Avatar;
  leveledUp: boolean;
  levelsGained: number;
}

/** アバターにEXPを加算し、必要に応じて複数レベルアップさせる(純関数) */
export function addExp(avatar: Avatar, amount: number): LevelUpResult {
  let level = avatar.level;
  let expInto = avatar.expIntoLevel + amount;
  let needed = expForLevel(level);
  let levelsGained = 0;

  while (expInto >= needed) {
    expInto -= needed;
    level += 1;
    levelsGained += 1;
    needed = expForLevel(level);
  }

  return {
    avatar: {
      ...avatar,
      level,
      totalExp: avatar.totalExp + amount,
      expIntoLevel: expInto,
      expForNextLevel: needed,
    },
    leveledUp: levelsGained > 0,
    levelsGained,
  };
}

/** 累計EXPからレベル状態を復元する(記録の取り消しで巻き戻すときに使う) */
export function levelStateFromTotalExp(
  totalExp: number,
): Pick<Avatar, "level" | "totalExp" | "expIntoLevel" | "expForNextLevel"> {
  const total = Math.max(0, totalExp);
  let level = 1;
  let rest = total;
  while (rest >= expForLevel(level)) {
    rest -= expForLevel(level);
    level += 1;
  }
  return { level, totalExp: total, expIntoLevel: rest, expForNextLevel: expForLevel(level) };
}

export interface AppearanceTier {
  tier: number;
  title: string;
  emoji: string;
  aura: string; // CSS color
}

const TIERS: AppearanceTier[] = [
  { tier: 1, title: "ひよっこ戦士", emoji: "🐣", aura: "#9ca3af" },
  { tier: 2, title: "見習いファイター", emoji: "🙂", aura: "#34d399" },
  { tier: 3, title: "鍛えし者", emoji: "💪", aura: "#38bdf8" },
  { tier: 4, title: "鋼のアスリート", emoji: "🏋️", aura: "#a78bfa" },
  { tier: 5, title: "筋肉の覇者", emoji: "🦾", aura: "#fbbf24" },
];

export function appearanceForLevel(level: number): AppearanceTier {
  if (level >= 35) return TIERS[4];
  if (level >= 20) return TIERS[3];
  if (level >= 10) return TIERS[2];
  if (level >= 5) return TIERS[1];
  return TIERS[0];
}

/** 最大HPは VIT に応じてスケール(Habitica 流の体力バー) */
export function maxHp(stats: Stats): number {
  return 50 + stats.vit * 2;
}
