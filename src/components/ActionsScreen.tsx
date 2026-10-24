import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Action, Energy, Loss } from "../domain/types";

function Editor({ a }: { a: Action }) {
  const s = useStore();
  const up = (patch: Partial<Omit<Action, "kind">>) => s.updateAction(a.id, patch);
  return (
    <div className="card form">
      <input value={a.title} onChange={(e) => up({ title: e.target.value })} />
      <label className="muted">最初の一歩(2〜5分)</label>
      <input value={a.starter} onChange={(e) => up({ starter: e.target.value })} />
      <div className="row">
        <span className="muted">しんどさ</span>
        <span className="stepper">
          {([1, 2, 3] as Energy[]).map((n) => (
            <button key={n} className={a.energy === n ? "active" : ""} onClick={() => up({ energy: n })}>{"●".repeat(n)}</button>
          ))}
        </span>
      </div>
      <div className="row">
        <span className="muted">目標</span>
        <select value={a.goalId ?? ""} onChange={(e) => up({ goalId: e.target.value || undefined })}>
          <option value="">なし</option>
          {s.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </div>
      {!a.goalId && (
        <>
          <div className="row">
            <span className="muted">放置すると</span>
            <span className="stepper">
              {([1, 2, 3] as Loss[]).map((n) => (
                <button key={n} className={a.loss === n ? "active" : ""} onClick={() => up({ loss: n })}>
                  {["", "平気", "困る", "痛い"][n]}
                </button>
              ))}
            </span>
          </div>
          <div className="row">
            <span className="muted">繰り返し(日ごと)</span>
            <input type="number" min={1} className="small" value={a.intervalDays ?? ""}
              onChange={(e) => up({ intervalDays: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <div className="row">
            <span className="muted">期限</span>
            <input type="date" className="small" value={a.deadline ?? ""} onChange={(e) => up({ deadline: e.target.value || undefined })} />
          </div>
        </>
      )}
      <button className="ghost danger" onClick={() => s.removeAction(a.id)}>ガチャから外す</button>
    </div>
  );
}

export function ActionsScreen() {
  const s = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const active = s.actions.filter((a) => !a.archived);

  const add = () => {
    if (!title.trim()) return;
    s.addAction({
      title: title.trim(), energy: 2, loss: 1,
      starter: "タイマーを3分セットして、とりあえず始める",
    });
    setTitle("");
  };

  return (
    <div>
      <h1>行動</h1>
      <p className="muted">基本はいじらなくてOK。気になったときだけ調整してください。</p>
      <ul className="list">
        {active.map((a) => (
          <li key={a.id}>
            <button className="row item" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <span>{a.title}</span>
              <span className="muted">{open === a.id ? "▲" : "▼"}</span>
            </button>
            {open === a.id && <Editor a={a} />}
          </li>
        ))}
      </ul>
      <h3>追加</h3>
      <div className="card form">
        <input placeholder="行動の名前" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button onClick={add} disabled={!title.trim()}>追加</button>
      </div>
    </div>
  );
}
