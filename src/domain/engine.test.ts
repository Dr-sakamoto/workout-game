import { describe, expect, it } from "vitest";
import { buildPlan, defenseNeed, drawStickers, goalBoosts, inferMood, pickBan } from "./engine";
import type { Action, Ban, DailyCard, Draw, MonthPlan } from "./types";
import { inferKind } from "./presets";
import { FREE, LIFE, MIN_SHARE, equalPercents, groupOf, moveBoundary, normalizeShares, sliceKeys } from "./shares";

const now = new Date(2026, 9, 21, 12); // 水曜
const DAY = 86400000;
const base = (p: Partial<Action>): Action => ({
  id: p.id ?? p.title ?? "x",
  title: "x",
  kind: "offense",
  starter: "",
  energy: 2,
  loss: 1,
  fun: 2,
  createdAt: now.getTime() - 30 * DAY,
  ...p,
});
const draw = (actionId: string, daysAgo: number, outcome: Draw["outcome"] = "done"): Draw => {
  const at = now.getTime() - daysAgo * DAY;
  return { id: `${actionId}-${daysAgo}-${outcome}`, at, actionId, outcome, cardDate: "", resolvedAt: at };
};
const card = (date: string, p: Partial<DailyCard> = {}): DailyCard => ({
  date, drawIds: [], banBroken: false, tributed: true, drawnAt: 0, ...p,
});

describe("defenseNeed", () => {
  it("期限が近いほど・損失が大きいほど高い", () => {
    const soon = defenseNeed(base({ kind: "defense", loss: 3, deadline: "2026-10-22" }), [], now);
    const later = defenseNeed(base({ kind: "defense", loss: 3, deadline: "2026-11-20" }), [], now);
    const small = defenseNeed(base({ kind: "defense", loss: 1, deadline: "2026-10-22" }), [], now);
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeGreaterThan(small);
  });

  it("繰り返し行動は前回完了から間隔の半分を過ぎるまで不要", () => {
    const a = base({ id: "clean", kind: "defense", intervalDays: 4, loss: 2 });
    expect(defenseNeed(a, [draw("clean", 1)], now)).toBe(0);
    expect(defenseNeed(a, [draw("clean", 5)], now)).toBeGreaterThan(0.5);
  });
});

describe("buildPlan", () => {
  const actions = [
    base({ id: "pay", kind: "defense", loss: 3, deadline: "2026-10-21" }),
    base({ id: "art", kind: "offense" }),
  ];

  it("期限が迫った防御があると防御を引きやすい", () => {
    const urgent = buildPlan({ actions, draws: [], now });
    const calm = buildPlan({
      actions: [base({ id: "pay", kind: "defense", loss: 1, deadline: "2026-12-31" }), actions[1]],
      draws: [],
      now,
    });
    expect(urgent.pDefense).toBeGreaterThan(calm.pDefense);
  });

  it("週の優先度 off は抽選対象から外れる", () => {
    const plan = buildPlan({
      actions,
      draws: [],
      now,
      week: { weekStart: "2026-10-19", busy: "normal", priorities: { art: "off" } },
    });
    expect(plan.offense).toHaveLength(0);
    expect(plan.pDefense).toBe(1);
  });

  it("前日ほとんどできなかったら、翌日は軽い行動が重くなる", () => {
    const light = base({ id: "light", energy: 1 });
    const heavy = base({ id: "heavy", energy: 3 });
    const draws = [draw("light", 1, "skipped"), draw("heavy", 1, "skipped")].map((d, i) => ({ ...d, id: `y${i}` }));
    const cards = [card("2026-10-20", { drawIds: ["y0", "y1"] })];
    const w = (cs: DailyCard[]) => {
      const plan = buildPlan({ actions: [light, heavy], draws: [], cards: cs, now });
      const get = (id: string) => plan.offense.find((c) => c.action.id === id)!.weight;
      return get("light") / get("heavy");
    };
    expect(inferMood(cards, draws)).toBe("tired");
    const tiredPlan = buildPlan({ actions: [light, heavy], draws, cards, now });
    const get = (id: string) => tiredPlan.offense.find((c) => c.action.id === id)!.weight;
    expect(get("light") / get("heavy")).toBeGreaterThan(w([]));
  });

  it("やらずに上納が続いた行動は出にくくなる", () => {
    const skipped = [draw("a", 2, "skipped"), { ...draw("a", 1.9, "skipped"), id: "s2" }];
    const plan = buildPlan({ actions: [base({ id: "a" }), base({ id: "b" })], draws: skipped, now });
    const w = (id: string) => plan.offense.find((c) => c.action.id === id)!.weight;
    expect(w("a")).toBeLessThan(w("b"));
  });
});

describe("goalBoosts", () => {
  it("今週進んでいない目標を引きやすくする", () => {
    const actions = [base({ id: "g1a", goalId: "g1" }), base({ id: "g2a", goalId: "g2" })];
    const draws = [0, 0.1, 0.2, 0.3].map((d) => draw("g1a", d));
    const b = goalBoosts(actions, draws, { g1: 50, g2: 50 }, now);
    expect(b.g2).toBeGreaterThan(1.5);
    expect(b.g1).toBeLessThan(1);
  });
});

describe("drawStickers", () => {
  it("重複なしで4枚選ぶ", () => {
    const actions = ["a", "b", "c", "d", "e", "f"].map((id) => base({ id }));
    for (let i = 0; i < 20; i++) {
      const picked = drawStickers({ actions, draws: [], now });
      expect(picked).toHaveLength(4);
      expect(new Set(picked.map((a) => a.id)).size).toBe(4);
    }
  });

  it("行動が4つ未満ならあるだけ選ぶ", () => {
    expect(drawStickers({ actions: [base({ id: "a" })], draws: [], now })).toHaveLength(1);
    expect(drawStickers({ actions: [], draws: [], now })).toHaveLength(0);
  });
});

describe("pickBan", () => {
  const bans: Ban[] = [
    { id: "sns", title: "SNS", createdAt: 0 },
    { id: "buy", title: "衝動買い", createdAt: 0 },
  ];

  it("最近破った禁止事項ほど出やすい", () => {
    const cards = [
      card("2026-10-15", { banId: "buy", banBroken: true }),
      card("2026-10-16", { banId: "buy", banBroken: true }),
      card("2026-10-17", { banId: "sns" }),
    ];
    let buy = 0;
    for (let i = 0; i < 400; i++) if (pickBan(bans, cards, now)?.id === "buy") buy++;
    expect(buy).toBeGreaterThan(300);
  });

  it("前日と同じ禁止事項は出にくい", () => {
    const cards = [card("2026-10-20", { banId: "sns" })];
    let sns = 0;
    for (let i = 0; i < 400; i++) if (pickBan(bans, cards, now)?.id === "sns") sns++;
    expect(sns).toBeLessThan(140);
  });

  it("禁止事項がなければ何も返さない", () => {
    expect(pickBan([], [], now)).toBeUndefined();
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

describe("配分(円グラフ)", () => {
  const month = (shares: Record<string, number>): MonthPlan => ({ month: "2026-10", shares, note: "" });
  const total = (plan: ReturnType<typeof buildPlan>, key: "offense" | "defense", goal?: string) =>
    plan[key].filter((c) => (goal ? c.action.goalId === goal : true)).reduce((s, c) => s + c.weight, 0);

  it("groupOf: 目標があれば目標、なければ kind で くらし/そのほか", () => {
    expect(groupOf({ goalId: "g1", kind: "offense" })).toBe("g1");
    expect(groupOf({ kind: "defense" })).toBe(LIFE);
    expect(groupOf({ kind: "offense" })).toBe(FREE);
  });

  it("sliceKeys: 目標 → くらし → そのほか の順で、行動のない枠は出さない", () => {
    const actions = [
      base({ id: "a", kind: "defense" }),
      base({ id: "b", kind: "offense" }),
      base({ id: "c", goalId: "g2" }),
      base({ id: "d", goalId: "g1" }),
      base({ id: "gone", goalId: "g3", archived: true }),
    ];
    expect(sliceKeys(actions, ["g1", "g2", "g3"])).toEqual(["g1", "g2", LIFE, FREE]);
  });

  it("normalizeShares: 何もなければ くらし20/そのほか10/目標は等分、合計は必ず100", () => {
    const r = normalizeShares(undefined, ["g1", "g2", LIFE, FREE]);
    expect(r).toEqual({ g1: 35, g2: 35, [LIFE]: 20, [FREE]: 10 });
    for (const n of [1, 3, 7, 11]) {
      const keys = Array.from({ length: n }, (_, i) => `g${i}`);
      const v = Object.values(normalizeShares(undefined, keys));
      expect(v.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it("normalizeShares: 新しい枠は均等割りぶんを確保し、既存の枠は比例して縮む。消えた枠は捨てる", () => {
    const r = normalizeShares({ g1: 60, [LIFE]: 40, removed: 99 }, ["g1", LIFE, "g2"]);
    expect(r.removed).toBeUndefined();
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.g2).toBe(33);
    expect(r.g1).toBeGreaterThan(r[LIFE]);
  });

  it("normalizeShares: 最小割合を下回る枠は引き上げる", () => {
    const r = normalizeShares({ g1: 99, g2: 1 }, ["g1", "g2"]);
    expect(r.g2).toBeGreaterThanOrEqual(MIN_SHARE);
    expect(r.g1 + r.g2).toBe(100);
  });

  it("moveBoundary: 両隣の枠だけが変わり、合計は100のまま、最小割合を守る", () => {
    expect(moveBoundary([40, 30, 30], 1, 55)).toEqual([55, 15, 30]);
    expect(moveBoundary([40, 30, 30], 2, 50)).toEqual([40, 10, 50]);
    expect(moveBoundary([40, 30, 30], 1, 99)).toEqual([66, MIN_SHARE, 30]);
    expect(moveBoundary([40, 30, 30], 1, -20)).toEqual([MIN_SHARE, 66, 30]);
    expect(moveBoundary([100], 1, 50)).toEqual([100]);
  });

  it("equalPercents: 合計100", () => {
    expect(equalPercents(3)).toEqual([34, 33, 33]);
    expect(equalPercents(4)).toEqual([25, 25, 25, 25]);
  });

  it("目標の割合が大きいほど、その目標の行動が出やすい", () => {
    const actions = [base({ id: "a1", goalId: "g1" }), base({ id: "a2", goalId: "g2" })];
    const plan = buildPlan({ actions, draws: [], month: month({ g1: 80, g2: 20 }), now });
    expect(total(plan, "offense", "g1")).toBeGreaterThan(total(plan, "offense", "g2") * 3);
  });

  it("枠の割合は行動の数に左右されない(行動が多い目標が有利にならない)", () => {
    const actions = [
      base({ id: "a1", goalId: "g1" }), base({ id: "a2", goalId: "g1" }), base({ id: "a3", goalId: "g1" }),
      base({ id: "b1", goalId: "g2" }),
    ];
    const plan = buildPlan({ actions, draws: [], month: month({ g1: 50, g2: 50 }), now });
    expect(total(plan, "offense", "g1")).toBeCloseTo(total(plan, "offense", "g2"), 5);
  });

  it("くらしの割合が大きいほど、防御を引く確率が上がる", () => {
    const actions = [base({ id: "chore", kind: "defense", intervalDays: 30 }), base({ id: "art" })];
    const low = buildPlan({ actions, draws: [], month: month({ [LIFE]: 10, [FREE]: 90 }), now });
    const high = buildPlan({ actions, draws: [], month: month({ [LIFE]: 70, [FREE]: 30 }), now });
    expect(high.pDefense).toBeGreaterThan(low.pDefense);
  });

  it("期限が迫っていると、くらしの割合が小さくても防御が先に確保される", () => {
    const actions = [base({ id: "pay", kind: "defense", loss: 3, deadline: "2026-10-21" }), base({ id: "art" })];
    const plan = buildPlan({ actions, draws: [], month: month({ [LIFE]: 4, [FREE]: 96 }), now });
    expect(plan.pDefense).toBeGreaterThan(0.4);
  });
});
