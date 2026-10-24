import { useState } from "react";
import { useStore } from "../store/useStore";

export function YearScreen() {
  const s = useStore();
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const doneByGoal = (goalId: string) =>
    s.draws.filter(
      (d) => d.at >= yearStart && d.outcome === "done" && s.actions.find((a) => a.id === d.actionId)?.goalId === goalId,
    ).length;

  const add = () => {
    if (!title.trim()) return;
    s.addGoal(title.trim(), why.trim());
    setTitle("");
    setWhy("");
  };

  return (
    <div>
      <h1>{new Date().getFullYear()}年</h1>
      <p className="muted">今年なりたい姿。目標を足すと、それに向けた行動が自動でガチャに入ります。</p>

      <ul className="list goals">
        {s.goals.map((g) => (
          <li key={g.id} className="card">
            <div className="row">
              <input className="plain" value={g.title} onChange={(e) => s.updateGoal(g.id, { title: e.target.value })} />
              <button className="ghost" onClick={() => confirm("この目標を削除しますか?") && s.removeGoal(g.id)}>×</button>
            </div>
            <input className="plain muted" placeholder="なぜ?" value={g.why} onChange={(e) => s.updateGoal(g.id, { why: e.target.value })} />
            <p className="muted">今年やった回数: {doneByGoal(g.id)}</p>
          </li>
        ))}
      </ul>

      <div className="card form">
        <input placeholder="新しい目標" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="なぜ?(任意)" value={why} onChange={(e) => setWhy(e.target.value)} />
        <button onClick={add} disabled={!title.trim()}>追加</button>
      </div>
    </div>
  );
}
