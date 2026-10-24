import { useState } from "react";
import { currentMonth, currentWeek, useStore } from "../store/useStore";
import type { Mood } from "../domain/types";
import { buildPlan } from "../domain/engine";
import { weekStartOf, parseYmd } from "../domain/dates";

const MOODS: { id: Mood; label: string }[] = [
  { id: "tired", label: "😪 だるい" },
  { id: "normal", label: "🙂 ふつう" },
  { id: "hyper", label: "⚡ 元気" },
];

export function GachaScreen() {
  const s = useStore();
  const { draws, actions, mood, setMood, spin, resolve, detour } = s;
  const [spinning, setSpinning] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [detourOpen, setDetourOpen] = useState(false);
  const [note, setNote] = useState("");

  const pending = [...draws].reverse().find((d) => d.outcome === "pending");
  const action = pending && actions.find((a) => a.id === pending.actionId);

  const onSpin = () => {
    setSpinning(true);
    setShowWhy(false);
    setDetourOpen(false);
    setTimeout(() => {
      spin();
      setSpinning(false);
    }, 900);
  };

  const now = new Date();
  const reasons = (() => {
    if (!action) return [];
    const plan = buildPlan({ actions, draws: draws.filter((d) => d.id !== pending!.id), month: currentMonth(s), week: currentWeek(s), mood, now });
    return [...plan.defense, ...plan.offense].find((c) => c.action.id === action.id)?.reasons ?? [];
  })();

  const weekStart = parseYmd(weekStartOf(now)).getTime();
  const weekDone = draws.filter((d) => d.at >= weekStart && d.outcome === "done");
  const weekDetour = draws.filter((d) => d.at >= weekStart && d.outcome === "detour").length;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayDone = draws.filter((d) => d.at >= todayStart && (d.outcome === "done" || d.outcome === "detour")).length;

  const submitDetour = () => {
    if (!pending) return;
    detour(pending.id, note.trim());
    setNote("");
    setDetourOpen(false);
  };

  return (
    <div className="gacha">
      <div className="stats">
        <div><b>{todayDone}</b><span>今日やった</span></div>
        <div><b>{weekDone.length}</b><span>今週やった</span></div>
        <div><b>{weekDetour}</b><span>今週の脱線</span></div>
      </div>

      <div className="segmented">
        {MOODS.map((m) => (
          <button key={m.id} className={mood === m.id ? "active" : ""} onClick={() => setMood(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {action && pending && !spinning ? (
        <div className={`result rarity-${pending.rarity}`}>
          <div className="result-head">
            <span className="rarity">{pending.rarity}</span>
          </div>
          <h2>{action.title}</h2>
          <div className="starter">
            <span className="muted">まずはこれだけ(2〜5分)</span>
            <p>{action.starter}</p>
          </div>
          {reasons.length > 0 && (
            <button className="link" onClick={() => setShowWhy(!showWhy)}>なぜこれ?</button>
          )}
          {showWhy && <ul className="reasons">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}

          {!detourOpen ? (
            <div className="actions">
              <button className="primary" onClick={() => resolve(pending.id, "done")}>やった!</button>
              <button onClick={onSpin}>今はパスして回し直す</button>
              <button className="ghost" onClick={() => setDetourOpen(true)}>別のことをした</button>
            </div>
          ) : (
            <div className="card form">
              <p className="muted">脱線もOK。何をしたか残しておくと、あとで振り返れます。</p>
              <input placeholder="例: ギターを弾いた" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="primary" onClick={submitDetour}>記録する</button>
            </div>
          )}
        </div>
      ) : (
        <div className="machine">
          <button className={`capsule ${spinning ? "spinning" : ""}`} onClick={onSpin} disabled={spinning}>
            <span className="capsule-top" />
            <span className="capsule-bottom" />
            <span className="capsule-label">{spinning ? "…" : "回す"}</span>
          </button>
          <p className="muted center">何かしたくなったら、とりあえず回す。</p>
        </div>
      )}
    </div>
  );
}
