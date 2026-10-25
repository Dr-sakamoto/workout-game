import { describe, expect, it } from "vitest";
import {
  DEADLINE_STARTER,
  DEFAULT_STARTER,
  draftFromAction,
  draftToFields,
  intervalChoices,
  intervalLabel,
  isDraftValid,
  newDraft,
} from "./actionDraft";
import { inferKind } from "./presets";
import { FREE, LIFE, groupOf } from "./shares";
import type { Action } from "./types";

const kindOf = (f: ReturnType<typeof draftToFields>) => inferKind(f);

describe("行動エディタの下書き", () => {
  it("新しい下書き: くらしは★1、それ以外は★2から", () => {
    expect(newDraft(LIFE).fun).toBe(1);
    expect(newDraft(FREE).fun).toBe(2);
    expect(newDraft("g1", "絵").title).toBe("絵");
  });

  it("そのほか → 目標も期限もなし(攻撃)", () => {
    const f = draftToFields({ ...newDraft(FREE, " 散歩 "), timing: "deadline", deadline: "2026-11-01" });
    expect(f).toMatchObject({ title: "散歩", goalId: undefined, deadline: undefined, intervalDays: undefined, loss: 1 });
    expect(kindOf(f)).toBe("offense");
  });

  it("目標 → その目標に紐づく(攻撃)。期限・くり返しは持たない", () => {
    const f = draftToFields({ ...newDraft("g1", "絵"), intervalDays: 3 });
    expect(f.goalId).toBe("g1");
    expect(f.intervalDays).toBeUndefined();
    expect(kindOf(f)).toBe("offense");
  });

  it("くらし・くり返す → くり返しの間隔が入る(防御)", () => {
    const f = draftToFields({ ...newDraft(LIFE, "洗濯"), timing: "repeat", intervalDays: 3, loss: 3 });
    expect(f).toMatchObject({ goalId: undefined, intervalDays: 3, deadline: undefined, loss: 3 });
    expect(kindOf(f)).toBe("defense");
  });

  it("くらし・期限がある → 期限が入る(防御)", () => {
    const f = draftToFields({ ...newDraft(LIFE, "支払い"), timing: "deadline", deadline: "2026-11-05" });
    expect(f).toMatchObject({ deadline: "2026-11-05", intervalDays: undefined });
    expect(kindOf(f)).toBe("defense");
  });

  it("最初の一歩が空なら、種類に合った既定の文になる", () => {
    expect(draftToFields(newDraft(FREE, "a")).starter).toBe(DEFAULT_STARTER);
    expect(draftToFields({ ...newDraft(LIFE, "b"), timing: "deadline", deadline: "2026-11-05" }).starter).toBe(DEADLINE_STARTER);
    expect(draftToFields({ ...newDraft(FREE, "c"), starter: " 開くだけ " }).starter).toBe("開くだけ");
  });

  it("保存できるのは、名前があって、期限つきの用事なら日付もあるとき", () => {
    expect(isDraftValid(newDraft(FREE, ""))).toBe(false);
    expect(isDraftValid(newDraft(FREE, "  "))).toBe(false);
    expect(isDraftValid(newDraft(FREE, "散歩"))).toBe(true);
    expect(isDraftValid({ ...newDraft(LIFE, "支払い"), timing: "deadline" })).toBe(false);
    expect(isDraftValid({ ...newDraft(LIFE, "支払い"), timing: "deadline", deadline: "2026-11-05" })).toBe(true);
    expect(isDraftValid({ ...newDraft(LIFE, "洗濯"), timing: "repeat" })).toBe(true);
  });

  it("既存の行動 → 下書き → 行動 で、枠と内容が変わらない", () => {
    const base = { id: "x", starter: "最初の一歩", energy: 3, fun: 4, createdAt: 0 } as const;
    const cases: Action[] = [
      { ...base, title: "絵", kind: "offense", loss: 1, goalId: "g1" },
      { ...base, title: "散歩", kind: "offense", loss: 1 },
      { ...base, title: "洗濯", kind: "defense", loss: 2, intervalDays: 3 },
      { ...base, title: "支払い", kind: "defense", loss: 3, deadline: "2026-11-05" },
    ];
    for (const a of cases) {
      const f = draftToFields(draftFromAction(a));
      expect(groupOf({ goalId: f.goalId, kind: inferKind(f) })).toBe(groupOf(a));
      expect(f).toMatchObject({ title: a.title, starter: a.starter, fun: a.fun, energy: a.energy, goalId: a.goalId, deadline: a.deadline, intervalDays: a.intervalDays });
      expect(inferKind(f)).toBe(a.kind);
    }
  });

  it("くり返しの選択肢: 既存の値が一覧になければ足す", () => {
    expect(intervalChoices(7)).toEqual([1, 2, 3, 7, 14, 30]);
    expect(intervalChoices(5)).toEqual([1, 2, 3, 5, 7, 14, 30]);
    expect([1, 7, 14, 30, 5].map(intervalLabel)).toEqual(["毎日", "毎週", "2週間ごと", "毎月", "5日ごと"]);
  });
});
