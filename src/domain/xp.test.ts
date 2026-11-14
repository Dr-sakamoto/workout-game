import { describe, expect, it } from "vitest";
import { XP_BY_ENERGY, XP_PER_HARD, bonusOf, gainedXp, levelOf, rollXp, totalXp, xpForLevel } from "./xp";
import type { Action, DailyCard, Draw } from "./types";

const act = (id: string, energy: 1 | 2 | 3): Action =>
  ({ id, title: id, kind: "offense", starter: "", energy, loss: 1, fun: 1, createdAt: 0 }) as Action;
const draw = (id: string, actionId: string, outcome: Draw["outcome"]): Draw => ({ id, at: 0, actionId, outcome, cardDate: "d" });
const card = (ids: string[], tributed: boolean): DailyCard => ({ date: "d", drawIds: ids, banBroken: false, tributed, drawnAt: 0 });

describe("xp", () => {
  const actions = [act("hard", 3), act("easy", 1)];
  const draws = [draw("1", "hard", "done"), draw("2", "hard", "done"), draw("3", "hard", "skipped"), draw("4", "easy", "done")];
  it("完了した行動を体力コストごとに数える(ダブりも1回ずつ、やらなかったものは0)", () => {
    expect(gainedXp([card(["1", "2", "3", "4"], false)], draws, actions)).toBe(XP_PER_HARD * 2 + XP_BY_ENERGY[1]);
  });
  it("累計は上納済みのカードだけ", () => {
    expect(totalXp([card(["1"], true), card(["2"], false)], draws, actions)).toBe(XP_PER_HARD);
  });
  it("保存されたXPがあればそれを使う(ボーナス込み)", () => {
    const saved = [{ ...draws[0], xp: 30 }, draws[1]];
    expect(gainedXp([card(["1", "2"], false)], saved, actions)).toBe(30 + XP_PER_HARD);
    expect(bonusOf([card(["1", "2"], false)], saved, actions)).toBe(2);
    expect(bonusOf([card(["1", "2"], false)], draws, actions)).toBe(1);
  });
  it("基本は固定で、たまにボーナス", () => {
    expect(rollXp(3, () => 0.5)).toBe(XP_PER_HARD);
    expect(rollXp(3, () => 0.1)).toBe(XP_PER_HARD * 2);
    expect(rollXp(3, () => 0.01)).toBe(XP_PER_HARD * 3);
    expect(rollXp(1, () => 0.5)).toBe(XP_BY_ENERGY[1]);
    expect(rollXp(2, () => 0.5)).toBe(XP_BY_ENERGY[2]);
  });
  it("レベルは累計XPで上がる", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(xpForLevel(2))).toBe(2);
    expect(levelOf(xpForLevel(3) - 1)).toBe(2);
  });
});
