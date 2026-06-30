// ボス戦: トレーニングで得たEXPがそのまま「ダメージ」になり、敵を削って倒す。
// 中期目標を与えるキャンペーン。最後は「過去の自分(シャドウ)」= 原則3(ライバルは自分)。
// 全ボス撃破後はスケーリングする無限ボスで青天井に。

export interface Boss {
  name: string;
  emoji: string;
  maxHp: number;
  rewardGold: number;
  rewardExp: number;
  flavor: string;
  attackPower: number; // サボった日に与えるプレイヤーへの1日分のダメージ
}

export const BOSSES: Boss[] = [
  { name: "サボり魔", emoji: "😈", maxHp: 300, rewardGold: 20, rewardExp: 40, flavor: "「今日くらい休めよ…」", attackPower: 8 },
  { name: "三日坊主モンスター", emoji: "👺", maxHp: 800, rewardGold: 35, rewardExp: 80, flavor: "「どうせ続かない」", attackPower: 12 },
  { name: "ぽっこり腹ゴーレム", emoji: "🗿", maxHp: 1800, rewardGold: 55, rewardExp: 140, flavor: "脂肪の鎧は固い。", attackPower: 16 },
  { name: "停滞期の壁", emoji: "🧱", maxHp: 3500, rewardGold: 80, rewardExp: 220, flavor: "伸び悩みの巨壁。", attackPower: 20 },
  { name: "マンネリ・ドラゴン", emoji: "🐉", maxHp: 6000, rewardGold: 120, rewardExp: 320, flavor: "退屈という名の竜。", attackPower: 26 },
  { name: "過去の自分(シャドウ)", emoji: "👤", maxHp: 10000, rewardGold: 200, rewardExp: 500, flavor: "最強の敵は、かつての自分だ。", attackPower: 32 },
];

/** index のボスを返す。リスト外は無限スケーリングの「鍛錬の化身」。 */
export function bossAt(index: number): Boss {
  if (index < BOSSES.length) return BOSSES[index];
  const last = BOSSES[BOSSES.length - 1];
  const over = index - BOSSES.length + 1;
  return {
    name: `鍛錬の化身 Lv.${over + 1}`,
    emoji: "👹",
    maxHp: Math.round(last.maxHp * Math.pow(1.6, over)),
    rewardGold: last.rewardGold + over * 40,
    rewardExp: last.rewardExp + over * 120,
    flavor: "終わりなき高みへ。",
    attackPower: last.attackPower + over * 4,
  };
}
