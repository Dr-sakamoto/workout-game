import { useState } from "react";
import { currentWeek, useStore } from "../store/useStore";
import type { Action, Energy, Loss, Priority } from "../domain/types";
import { groupOf, sliceKeys } from "../domain/shares";
import { daysUntil } from "../domain/dates";
import { labelFor, styleFor } from "./sliceStyle";

const PRIORITY: Record<Priority, { label: string; next: Priority }> = {
  normal: { label: "ふつう", next: "high" },
  high: { label: "優先", next: "off" },
  off: { label: "休み", next: "normal" },
};

const ENERGY = ["", "ラク", "ふつう", "重い"];
const LOSS = ["", "平気", "困る", "痛い"];

/** 詳しい設定。普段は開かなくていい */
function Details({ a }: { a: Action }) {
  const s = useStore();
  const up = (patch: Partial<Omit<Action, "kind">>) => s.updateAction(a.id, patch);
  return (
    <div className="details">
      <label className="muted">最初の一歩(2〜5分)</label>
      <input value={a.starter} onChange={(e) => up({ starter: e.target.value })} />
      <div className="row">
        <span className="muted">しんどさ</span>
        <span className="stepper">
          {([1, 2, 3] as Energy[]).map((n) => (
            <button key={n} className={a.energy === n ? "active" : ""} onClick={() => up({ energy: n })}>{ENERGY[n]}</button>
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
                <button key={n} className={a.loss === n ? "active" : ""} onClick={() => up({ loss: n })}>{LOSS[n]}</button>
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

function Row({ a, open, onToggle }: { a: Action; open: boolean; onToggle: () => void }) {
  const s = useStore();
  const p = currentWeek(s).priorities[a.id] ?? "normal";
  const days = a.deadline ? daysUntil(a.deadline, new Date()) : undefined;
  return (
    <li className={`action-row ${p === "off" ? "paused" : ""}`}>
      <button className="action-main" onClick={onToggle}>
        <span className="action-title">{a.title}</span>
        {days !== undefined && (
          <span className={days < 0 ? "danger" : "muted"}>{days < 0 ? `${-days}日超過` : days === 0 ? "今日まで" : `あと${days}日`}</span>
        )}
        <span className="muted">{open ? "▲" : "▼"}</span>
      </button>
      <div className="action-ctl">
        <span className="stars" role="group" aria-label="楽しさ">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} className={n <= a.fun ? "on" : ""} aria-label={`楽しさ${n}`} onClick={() => s.updateAction(a.id, { fun: n as 1 | 2 | 3 | 4 })}>
              ★
            </button>
          ))}
        </span>
        <button className={`chip ${p}`} onClick={() => s.setPriority(a.id, PRIORITY[p].next)}>
          今週 {PRIORITY[p].label}
        </button>
      </div>
      {open && <Details a={a} />}
    </li>
  );
}

/** 行動の一覧。配分の円グラフと同じ色でグループ分けし、★と今週の出やすさをその場で変えられる */
export function ActionsScreen() {
  const s = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const active = s.actions.filter((a) => !a.archived);
  const keys = sliceKeys(s.actions, s.goals.map((g) => g.id));

  const add = () => {
    if (!title.trim()) return;
    s.addAction({
      title: title.trim(),
      energy: 2,
      loss: deadline ? 2 : 1,
      fun: deadline ? 1 : 2,
      starter: deadline ? "必要なものを開いて、最初の1行だけやる" : "タイマーを3分セットして、とりあえず始める",
      deadline: deadline || undefined,
    });
    setTitle("");
    setDeadline("");
    setDateOpen(false);
  };

  return (
    <div>
      <h1>行動</h1>
      <form
        className="add-row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input placeholder="やりたいこと・やるべきことを追加" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" disabled={!title.trim()}>追加</button>
        {dateOpen ? (
          <label className="date-pick">
            <span className="muted">期限</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        ) : (
          <button type="button" className="link" onClick={() => setDateOpen(true)}>＋ 期限をつける</button>
        )}
      </form>

      <p className="muted legend-help">★ = 楽しさ(多いほどキラキラのステッカー)　右のボタン = 今週の出やすさ(タップで切り替え)</p>

      {keys.map((k) => {
        const rows = active
          .filter((a) => groupOf(a) === k)
          .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.createdAt - b.createdAt);
        return (
          <section key={k}>
            <h3 className="group-head">
              <i className="dot" style={{ background: styleFor(k, s.goals).fill }} />
              {labelFor(k, s.goals)}
            </h3>
            <ul className="list">
              {rows.map((a) => (
                <Row key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
