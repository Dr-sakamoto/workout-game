import { describe, expect, it } from "vitest";
import { buildPlan, defenseNeed, drawStickers, goalBoosts, inferMood, pickBan } from "./engine";
import type { Action, Ban, DailyCard, Draw, MonthPlan } from "./types";
import { inferKind } from "./presets";

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
    const month: MonthPlan = { month: "2026-10", offenseShare: 0.8, goalWeights: { g1: 1, g2: 1 }, note: "" };
    const draws = [0, 0.1, 0.2, 0.3].map((d) => draw("g1a", d));
    const b = goalBoosts(actions, draws, month, now);
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
