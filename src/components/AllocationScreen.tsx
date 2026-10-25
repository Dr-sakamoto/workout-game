import { useState } from "react";
import { currentMonth, currentWeek, useStore } from "../store/useStore";
import type { Busy } from "../domain/types";
import { equalPercents, normalizeShares, sliceKeys } from "../domain/shares";
import { PieEditor } from "./PieEditor";
import { labelFor, styleFor } from "./sliceStyle";

const BUSY: { id: Busy; label: string }[] = [
  { id: "free", label: "余裕あり" },
  { id: "normal", label: "ふつう" },
  { id: "busy", label: "忙しい" },
];

/** ガチャ配分: 円グラフ + 今年の目標 + 今週の忙しさ */
export function AllocationScreen() {
  const s = useStore();
  const [title, setTitle] = useState("");
  const month = currentMonth(s);
  const week = currentWeek(s);

  const keys = sliceKeys(s.actions, s.goals.map((g) => g.id));
  const shares = normalizeShares(month.shares, keys);
  const slices = keys.map((k) => ({ key: k, label: labelFor(k, s.goals), ...styleFor(k, s.goals) }));
  const percents = keys.map((k) => shares[k]);
  const commit = (next: number[]) => s.setMonth({ shares: Object.fromEntries(keys.map((k, i) => [k, next[i]])) });

  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const doneFor = (goalId: string) =>
    s.draws.filter(
      (d) => d.at >= yearStart && d.outcome === "done" && s.actions.find((a) => a.id === d.actionId)?.goalId === goalId,
    ).length;

  const addGoal = () => {
    if (!title.trim()) return;
    s.addGoal(title.trim(), "");
    setTitle("");
  };

  return (
    <div>
      <h1>{Number(month.month.slice(5))}月のガチャ配分</h1>
      <p className="muted">つなぎ目の丸をドラッグして、何をどれくらい出すか決めます。来月もそのまま引き継がれます。</p>

      {slices.length > 0 ? (
        <>
          <PieEditor slices={slices} percents={percents} onCommit={commit} />
          <ul className="legend">
            {slices.map((sl, i) => (
              <li key={sl.key}>
                <i style={{ background: sl.fill }} />
                <span className="legend-name">{sl.label}</span>
                <b>{percents[i]}%</b>
              </li>
            ))}
          </ul>
          <div className="row-btns">
            <button onClick={() => s.setMonth({ shares: Object.fromEntries(keys.map((k, i) => [k, equalPercents(keys.length)[i]])) })}>
              均等にする
            </button>
            <button onClick={() => s.setMonth({ shares: {} })}>おすすめに戻す</button>
          </div>
          <p className="muted note">期限が近い用事があると、「くらし・用事」はその間だけ自動で増えます。</p>
        </>
      ) : (
        <p className="muted">行動がまだありません。「行動」タブで追加してください。</p>
      )}

      <h3>今年の目標</h3>
      <p className="muted">目標を足すと、その目標の行動が自動でガチャに入って、円グラフに枠ができます。</p>
      <ul className="list">
        {s.goals.map((g) => (
          <li key={g.id} className="card goal-row">
            <i className="dot" style={{ background: styleFor(g.id, s.goals).fill }} />
            <input className="plain" value={g.title} onChange={(e) => s.updateGoal(g.id, { title: e.target.value })} />
            <span className="muted nowrap">今年 {doneFor(g.id)}回</span>
            <button className="ghost" aria-label="削除" onClick={() => confirm(`「${g.title}」を削除しますか?`) && s.removeGoal(g.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          addGoal();
        }}
      >
        <input placeholder="新しい目標を追加" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" disabled={!title.trim()}>追加</button>
      </form>

      <h3>今週の調子</h3>
      <div className="segmented">
        {BUSY.map((b) => (
          <button key={b.id} className={week.busy === b.id ? "active" : ""} onClick={() => s.setWeek({ busy: b.id })}>
            {b.label}
          </button>
        ))}
      </div>
      <p className="muted">忙しい週は重い行動が出にくく、余裕のある週は出やすくなります。</p>
    </div>
  );
}
