import { useState } from "react";
import { currentMonth, useStore } from "../store/useStore";
import type { Loss } from "../domain/types";
import { daysUntil } from "../domain/dates";

export function MonthScreen() {
  const s = useStore();
  const month = currentMonth(s);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loss, setLoss] = useState<Loss>(2);
  const now = new Date();
  const tasks = s.actions
    .filter((a) => a.deadline && !a.archived)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));

  const addTask = () => {
    if (!title.trim() || !deadline) return;
    s.addAction({ title: title.trim(), starter: "必要なものを開いて、最初の1行だけやる", energy: 2, loss, fun: 1, deadline });
    setTitle("");
    setDeadline("");
  };

  return (
    <div>
      <h1>今月</h1>
      <p className="muted">{month.month}</p>


      {s.goals.length > 0 && (
        <>
          <h3>目標の配分</h3>
          <ul className="list">
            {s.goals.map((g) => {
              const w = month.goalWeights[g.id] ?? 1;
              return (
                <li key={g.id} className="row">
                  <span>★ {g.title}</span>
                  <span className="stepper">
                    {[0, 1, 2, 3].map((n) => (
                      <button key={n} className={w === n ? "active" : ""}
                        onClick={() => s.setMonth({ goalWeights: { ...month.goalWeights, [g.id]: n } })}>
                        {n === 0 ? "休" : "●".repeat(n)}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3>今月の締切タスク</h3>
      <div className="card form">
        <input placeholder="例: 住民税の支払い" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <div className="segmented">
          {([1, 2, 3] as Loss[]).map((l) => (
            <button key={l} className={loss === l ? "active" : ""} onClick={() => setLoss(l)}>
              {["", "遅れても平気", "困る", "かなり痛い"][l]}
            </button>
          ))}
        </div>
        <button onClick={addTask} disabled={!title.trim() || !deadline}>追加</button>
      </div>
      <ul className="list">
        {tasks.map((a) => {
          const d = daysUntil(a.deadline!, now);
          return (
            <li key={a.id} className="row">
              <span>{a.title}</span>
              <span className={d < 0 ? "danger" : "muted"}>{d < 0 ? `${-d}日超過` : d === 0 ? "今日" : `あと${d}日`}</span>
            </li>
          );
        })}
      </ul>

      <h3>今月のメモ</h3>
      <textarea placeholder="今月のテーマや気をつけたいこと" value={month.note} onChange={(e) => s.setMonth({ note: e.target.value })} />
    </div>
  );
}
