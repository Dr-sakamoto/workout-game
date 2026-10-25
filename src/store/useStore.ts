import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Action, Ban, Busy, DailyCard, Draw, MonthPlan, Priority, WeekPlan, YearGoal } from "../domain/types";
import { BAN_PRESETS, actionsForGoal, inferKind } from "../domain/presets";
import { drawStickers, pickBan } from "../domain/engine";
import { weekStartOf, ym, ymd } from "../domain/dates";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

type NewAction = Omit<Action, "id" | "createdAt">;
type ActionInput = Omit<NewAction, "kind">;

interface State {
  onboarded: boolean;
  goals: YearGoal[];
  actions: Action[];
  bans: Ban[];
  months: Record<string, MonthPlan>;
  weeks: Record<string, WeekPlan>;
  draws: Draw[];
  cards: DailyCard[];

  finishOnboarding: (presets: NewAction[], bans: string[]) => void;
  addGoal: (title: string, why: string) => void;
  updateGoal: (id: string, patch: Partial<Omit<YearGoal, "id">>) => void;
  removeGoal: (id: string) => void;
  addAction: (a: ActionInput) => void;
  updateAction: (id: string, patch: Partial<ActionInput>) => void;
  removeAction: (id: string) => void;
  addBan: (title: string) => void;
  updateBan: (id: string, title: string) => void;
  removeBan: (id: string) => void;
  setMonth: (patch: Partial<Omit<MonthPlan, "month">>) => void;
  setWeek: (patch: { busy?: Busy }) => void;
  setPriority: (actionId: string, p: Priority) => void;
  /** 今日のカードを引く。すでに引いていれば何もしない */
  drawCard: (now?: Date) => DailyCard | undefined;
  completeSticker: (drawId: string) => void;
  breakBan: (date: string) => void;
  /** 今日より前のカードを上納する。やらなかったステッカーは skipped になる */
  tribute: (now?: Date) => void;
}

export function currentMonth(s: Pick<State, "months" | "goals">, now = new Date()): MonthPlan {
  const key = ym(now);
  if (s.months[key]) return s.months[key];
  // 新しい月は前の月の配分をそのまま引き継ぐ(毎月つくり直さなくていい)
  const prev = Object.keys(s.months).filter((k) => k < key).sort().pop();
  return { month: key, shares: prev ? s.months[prev].shares : {}, note: "" };
}

export function currentWeek(s: Pick<State, "weeks">, now = new Date()): WeekPlan {
  const key = weekStartOf(now);
  return s.weeks[key] ?? { weekStart: key, busy: "normal", priorities: {} };
}

export function todayCard(s: Pick<State, "cards">, now = new Date()): DailyCard | undefined {
  const key = ymd(now);
  return s.cards.find((c) => c.date === key);
}

/** 日付が変わって上納待ちになっているカード */
export function staleCards(s: Pick<State, "cards">, now = new Date()): DailyCard[] {
  const key = ymd(now);
  return s.cards.filter((c) => !c.tributed && c.date < key);
}

const newBan = (title: string): Ban => ({ id: uid(), title, createdAt: Date.now() });

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      onboarded: false,
      goals: [],
      actions: [],
      bans: [],
      months: {},
      weeks: {},
      draws: [],
      cards: [],

      finishOnboarding: (presets, bans) =>
        set((s) => ({
          onboarded: true,
          actions: [...s.actions, ...presets.map((p) => ({ ...p, id: uid(), createdAt: Date.now() }))],
          bans: [...s.bans, ...bans.map(newBan)],
        })),

      addGoal: (title, why) =>
        set((s) => {
          const goal: YearGoal = { id: uid(), title, why };
          const generated = actionsForGoal(goal).map((p) => ({ ...p, id: uid(), createdAt: Date.now() }));
          // 配分は触らない。新しい目標の枠は normalizeShares が均等割りぶんを確保する
          return { goals: [...s.goals, goal], actions: [...s.actions, ...generated] };
        }),

      updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      removeGoal: (id) =>
        set((s) => ({
          goals: s.goals.filter((g) => g.id !== id),
          actions: s.actions.map((a) => (a.goalId === id ? { ...a, archived: true } : a)),
        })),

      addAction: (a) =>
        set((s) => ({ actions: [...s.actions, { ...a, kind: inferKind(a), id: uid(), createdAt: Date.now() }] })),

      updateAction: (id, patch) =>
        set((s) => ({
          actions: s.actions.map((a) => {
            if (a.id !== id) return a;
            const next = { ...a, ...patch };
            return { ...next, kind: inferKind(next) };
          }),
        })),

      removeAction: (id) =>
        set((s) => ({ actions: s.actions.map((a) => (a.id === id ? { ...a, archived: true } : a)) })),

      addBan: (title) => set((s) => ({ bans: [...s.bans, newBan(title)] })),
      updateBan: (id, title) => set((s) => ({ bans: s.bans.map((b) => (b.id === id ? { ...b, title } : b)) })),
      removeBan: (id) => set((s) => ({ bans: s.bans.map((b) => (b.id === id ? { ...b, archived: true } : b)) })),

      setMonth: (patch) =>
        set((s) => {
          const m = currentMonth(s);
          return { months: { ...s.months, [m.month]: { ...m, ...patch } } };
        }),

      setWeek: (patch) =>
        set((s) => {
          const w = currentWeek(s);
          return { weeks: { ...s.weeks, [w.weekStart]: { ...w, ...patch } } };
        }),

      setPriority: (actionId, p) =>
        set((s) => {
          const w = currentWeek(s);
          return {
            weeks: { ...s.weeks, [w.weekStart]: { ...w, priorities: { ...w.priorities, [actionId]: p } } },
          };
        }),

      drawCard: (now = new Date()) => {
        get().tribute(now);
        const s = get();
        if (todayCard(s, now)) return undefined;
        const date = ymd(now);
        const picked = drawStickers({
          actions: s.actions,
          draws: s.draws,
          cards: s.cards,
          month: currentMonth(s, now),
          week: currentWeek(s, now),
          now,
        });
        const draws: Draw[] = picked.map((a) => ({
          id: uid(),
          at: now.getTime(),
          actionId: a.id,
          outcome: "pending",
          cardDate: date,
        }));
        const ban = pickBan(s.bans, s.cards, now);
        const card: DailyCard = {
          date,
          drawIds: draws.map((d) => d.id),
          banId: ban?.id,
          banBroken: false,
          tributed: false,
          drawnAt: now.getTime(),
        };
        set({ draws: [...s.draws, ...draws], cards: [...s.cards, card] });
        return card;
      },

      completeSticker: (drawId) =>
        set((s) => {
          const target = s.draws.find((d) => d.id === drawId);
          if (!target || target.outcome !== "pending") return {};
          const action = s.actions.find((a) => a.id === target.actionId);
          return {
            draws: s.draws.map((d) => (d.id === drawId ? { ...d, outcome: "done", resolvedAt: Date.now() } : d)),
            // 期限付きの一回きりタスクは完了したら抽選対象から外す
            actions:
              action?.deadline && !action.intervalDays
                ? s.actions.map((a) => (a.id === action.id ? { ...a, archived: true } : a))
                : s.actions,
          };
        }),

      breakBan: (date) =>
        set((s) => ({ cards: s.cards.map((c) => (c.date === date ? { ...c, banBroken: true } : c)) })),

      tribute: (now = new Date()) =>
        set((s) => {
          const stale = staleCards(s, now);
          if (stale.length === 0) return {};
          const ids = new Set(stale.flatMap((c) => c.drawIds));
          return {
            cards: s.cards.map((c) => (stale.includes(c) ? { ...c, tributed: true } : c)),
            draws: s.draws.map((d) =>
              ids.has(d.id) && d.outcome === "pending" ? { ...d, outcome: "skipped", resolvedAt: now.getTime() } : d,
            ),
          };
        }),
    }),
    {
      name: "action-gacha",
      version: 3,
      // v1: 随時ガチャ → v2: 1日1枚のカード制 → v3: 配分を円グラフ(%)に
      migrate: (persisted, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = persisted as any;
        if (version < 2) {
          s.actions = (s.actions ?? []).map((a: Action) => ({ ...a, fun: a.fun ?? (a.kind === "defense" ? 1 : 2) }));
          s.draws = (s.draws ?? []).map((d: Draw & { rarity?: string; detourKind?: string; detourNote?: string }) => {
            const { rarity: _r, detourKind: _k, detourNote: _n, ...rest } = d;
            const outcome = rest.outcome === "done" ? "done" : "skipped";
            return { ...rest, outcome, cardDate: ymd(new Date(rest.at)) };
          });
          s.bans = s.onboarded ? BAN_PRESETS.map(newBan) : [];
          s.cards = [];
          delete s.mood;
          delete s.year;
        }
        if (version < 3) {
          // goalWeights/offenseShare → shares(%)
          const months: Record<string, MonthPlan> = {};
          for (const [k, m] of Object.entries<any>(s.months ?? {})) {
            const gw: Record<string, number> = m.goalWeights ?? {};
            const total = Object.values(gw).reduce((a, b) => a + b, 0);
            const offense = m.offenseShare ?? 0.8;
            // くらし = 守りの割合。攻めの割合のうち 10% を「そのほか」に、残りを目標の重みで分ける
            const shares: Record<string, number> = { life: Math.round((1 - offense) * 100), free: total > 0 ? 10 : Math.round(offense * 100) };
            const goalsTotal = Math.max(0, offense * 100 - 10);
            if (total > 0) for (const [g, w] of Object.entries(gw)) shares[g] = Math.round((goalsTotal * w) / total);
            months[k] = { month: k, shares, note: m.note ?? "" };
          }
          s.months = months;
        }
        return s;
      },
    },
  ),
);
