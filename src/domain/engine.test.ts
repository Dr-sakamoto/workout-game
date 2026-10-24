import { describe, expect, it } from "vitest";
import { buildPlan, defenseNeed, draw, goalBoosts } from "./engine";
import type { Action, Draw, MonthPlan } from "./types";
import { inferKind } from "./presets";

const now = new Date(2026, 9, 21, 12); // 水曜
const base = (p: Partial<Action>): Action => ({
  id: p.id ?? p.title ?? "x",
  title: "x",
  kind: "offense",
  starter: "",
  energy: 2,
  loss: 1,
  createdAt: now.getTime() - 30 * 86400000,
  ...p,
});
const done = (actionId: string, daysAgo: number): Draw => {
  const at = now.getTime() - daysAgo * 86400000;
  return { id: `${actionId}-${daysAgo}`, at, actionId, rarity: "N", outcome: "done", resolvedAt: at };
};

describe("defenseNeed", () => {
  it("期限が近いほど・損失が大きいほど高い", () => {
    const soon = defenseNeed(base({ kind: "defense", loss: 3, deadline: "2026-10-22" }), [], now).need;
    const later = defenseNeed(base({ kind: "defense", loss: 3, deadline: "2026-11-20" }), [], now).need;
    const small = defenseNeed(base({ kind: "defense", loss: 1, deadline: "2026-10-22" }), [], now).need;
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeGreaterThan(small);
  });

  it("繰り返し行動は前回完了から間隔の半分を過ぎるまで不要", () => {
    const a = base({ id: "clean", kind: "defense", intervalDays: 4, loss: 2 });
    expect(defenseNeed(a, [done("clean", 1)], now).need).toBe(0);
    expect(defenseNeed(a, [done("clean", 5)], now).need).toBeGreaterThan(0.5);
  });
});

describe("buildPlan", () => {
  const actions = [
    base({ id: "pay", kind: "defense", loss: 3, deadline: "2026-10-21" }),
    base({ id: "draw", kind: "offense" }),
  ];

  it("期限が迫った防御があると防御を引きやすい", () => {
    const urgent = buildPlan({ actions, draws: [], mood: "normal", now });
    const calm = buildPlan({
      actions: [base({ id: "pay", kind: "defense", loss: 1, deadline: "2026-12-31" }), actions[1]],
      draws: [],
      mood: "normal",
      now,
    });
    expect(urgent.pDefense).toBeGreaterThan(calm.pDefense);
    expect(urgent.defense[0].rarity).toBe("SSR");
  });

  it("週の優先度 off は抽選対象から外れる", () => {
    const plan = buildPlan({
      actions,
      draws: [],
      mood: "normal",
      now,
      week: { weekStart: "2026-10-19", busy: "normal", priorities: { draw: "off" } },
    });
    expect(plan.offense).toHaveLength(0);
    expect(plan.pDefense).toBe(1);
  });

  it("疲れているときは軽い行動が重くなる", () => {
    const light = base({ id: "light", energy: 1 });
    const heavy = base({ id: "heavy", energy: 3 });
    const plan = buildPlan({ actions: [light, heavy], draws: [], mood: "tired", now });
    const w = (id: string) => plan.offense.find((c) => c.action.id === id)!.weight;
    expect(w("light")).toBeGreaterThan(w("heavy") * 5);
  });

  it("パスが続いた行動は出にくくなる", () => {
    const skipped: Draw[] = [1, 2].map((h) => ({
      id: `s${h}`, at: now.getTime() - h * 5 * 3600000, actionId: "a", rarity: "N", outcome: "skipped",
    }));
    const plan = buildPlan({ actions: [base({ id: "a" }), base({ id: "b" })], draws: skipped, mood: "normal", now });
    const w = (id: string) => plan.offense.find((c) => c.action.id === id)!.weight;
    expect(w("a")).toBeLessThan(w("b"));
  });
});

describe("goalBoosts", () => {
  it("今週進んでいない目標を引きやすくする", () => {
    const actions = [base({ id: "g1a", goalId: "g1" }), base({ id: "g2a", goalId: "g2" })];
    const month: MonthPlan = { month: "2026-10", offenseShare: 0.8, goalWeights: { g1: 1, g2: 1 }, note: "" };
    const draws = [0, 0.1, 0.2, 0.3].map((d) => done("g1a", d));
    const b = goalBoosts(actions, draws, month, now);
    expect(b.g2).toBeGreaterThan(1.5);
    expect(b.g1).toBeLessThan(1);
  });
});

describe("draw", () => {
  it("行動がなければ何も返さない", () => {
    expect(draw({ actions: [], draws: [], mood: "normal", now })).toBeUndefined();
  });
});

describe("inferKind", () => {
  it("目標があれば攻撃、期限・繰り返しがあれば防御、どちらもなければ攻撃", () => {
    expect(inferKind({ goalId: "g", intervalDays: 3 })).toBe("offense");
    expect(inferKind({ deadline: "2026-11-01" })).toBe("defense");
    expect(inferKind({ intervalDays: 7 })).toBe("defense");
    expect(inferKind({})).toBe("offense");
  });
});
