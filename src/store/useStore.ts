import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Action, Draw, Mood, MonthPlan, Priority, WeekPlan, YearGoal, Busy } from "../domain/types";
import { actionsForGoal, inferKind } from "../domain/presets";
import { draw as runDraw } from "../domain/engine";
import { weekStartOf, ym } from "../domain/dates";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

type NewAction = Omit<Action, "id" | "createdAt">;
type ActionInput = Omit<NewAction, "kind">;

interface State {
  onboarded: boolean;
  year: number;
  goals: YearGoal[];
  actions: Action[];
  months: Record<string, MonthPlan>;
  weeks: Record<string, WeekPlan>;
  draws: Draw[];
  mood: Mood;

  finishOnboarding: (presets: NewAction[]) => void;
  addGoal: (title: string, why: string) => void;
  updateGoal: (id: string, patch: Partial<Omit<YearGoal, "id">>) => void;
  removeGoal: (id: string) => void;
  addAction: (a: ActionInput) => void;
  updateAction: (id: string, patch: Partial<ActionInput>) => void;
  removeAction: (id: string) => void;
  setMonth: (patch: Partial<Omit<MonthPlan, "month">>) => void;
  setWeek: (patch: { busy?: Busy }) => void;
  setPriority: (actionId: string, p: Priority) => void;
  setMood: (m: Mood) => void;
  spin: () => Draw | undefined;
  resolve: (drawId: string, outcome: "done" | "skipped") => void;
  detour: (drawId: string, note: string) => void;
}

export function currentMonth(s: Pick<State, "months" | "goals">, now = new Date()): MonthPlan {
  const key = ym(now);
  return (
    s.months[key] ?? {
      month: key,
      offenseShare: 0.8,
      goalWeights: Object.fromEntries(s.goals.map((g) => [g.id, 1])),
      note: "",
    }
  );
}

export function currentWeek(s: Pick<State, "weeks">, now = new Date()): WeekPlan {
  const key = weekStartOf(now);
  return s.weeks[key] ?? { weekStart: key, busy: "normal", priorities: {} };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      onboarded: false,
      year: new Date().getFullYear(),
      goals: [],
      actions: [],
      months: {},
      weeks: {},
      draws: [],
      mood: "normal",

      finishOnboarding: (presets) =>
        set((s) => ({
          onboarded: true,
          actions: [...s.actions, ...presets.map((p) => ({ ...p, id: uid(), createdAt: Date.now() }))],
        })),

      addGoal: (title, why) =>
        set((s) => {
          const goal: YearGoal = { id: uid(), title, why };
          const generated = actionsForGoal(goal).map((p) => ({ ...p, id: uid(), createdAt: Date.now() }));
          const m = currentMonth(s);
          return {
            goals: [...s.goals, goal],
            actions: [...s.actions, ...generated],
            months: { ...s.months, [m.month]: { ...m, goalWeights: { ...m.goalWeights, [goal.id]: 1 } } },
          };
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

      setMood: (mood) => set({ mood }),

      spin: () => {
        const s = get();
        const now = new Date();
        const c = runDraw({
          actions: s.actions,
          draws: s.draws,
          month: currentMonth(s, now),
          week: currentWeek(s, now),
          mood: s.mood,
          now,
        });
        if (!c) return undefined;
        // 未着手のまま回し直した分は「拒否」として記録する
        const draws = s.draws.map((d) =>
          d.outcome === "pending" ? { ...d, outcome: "skipped" as const, resolvedAt: now.getTime() } : d,
        );
        const d: Draw = { id: uid(), at: now.getTime(), actionId: c.action.id, rarity: c.rarity, outcome: "pending" };
        set({ draws: [...draws, d] });
        return d;
      },

      resolve: (drawId, outcome) =>
        set((s) => {
          const target = s.draws.find((d) => d.id === drawId);
          const action = target && s.actions.find((a) => a.id === target.actionId);
          return {
            draws: s.draws.map((d) => (d.id === drawId ? { ...d, outcome, resolvedAt: Date.now() } : d)),
            // 期限付きの一回きりタスクは完了したら抽選対象から外す
            actions:
              outcome === "done" && action?.deadline && !action.intervalDays
                ? s.actions.map((a) => (a.id === action.id ? { ...a, archived: true } : a))
                : s.actions,
          };
        }),

      detour: (drawId, note) =>
        set((s) => ({
          draws: s.draws.map((d) =>
            d.id === drawId
              ? { ...d, outcome: "detour", detourNote: note, resolvedAt: Date.now() }
              : d,
          ),
        })),
    }),
    { name: "action-gacha", version: 1 },
  ),
);
