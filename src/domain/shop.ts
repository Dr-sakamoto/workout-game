// ショップ: ゴールドの使い道。原則1に従い装備・スキンは売らない。
// 自分の鍛錬を後押しする消費アイテムのみ(P2Wではなく、努力で得た通貨で努力を支える)。

export type ItemEffect = "expBoost" | "streakShield";

export interface ShopItem {
  id: ItemEffect;
  name: string;
  desc: string;
  emoji: string;
  cost: number;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "expBoost",
    name: "コンディションドリンク",
    desc: "次のトレーニングの獲得EXP +50%",
    emoji: "🧪",
    cost: 30,
  },
  {
    id: "streakShield",
    name: "守りのプロテイン",
    desc: "予定日を1回逃してもストリークが途切れない(在庫として持てる)",
    emoji: "🥛",
    cost: 50,
  },
];
