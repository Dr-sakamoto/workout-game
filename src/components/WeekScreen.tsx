import { currentMonth, currentWeek, useStore } from "../store/useStore";
import type { Busy, Priority } from "../domain/types";
import { buildPlan, goalBoosts } from "../domain/engine";
import { parseYmd } from "../domain/dates";

const BUSY: { id: Busy; label: string }[] = [
  { id: "free", label: "余裕あり" },
  { id: "normal", label: "ふつう" },
  { id: "busy", label: "忙しい" },
];

const PRIORITY_LABEL: Record<Priority, string> = { off: "出さない", normal: "ふつう", high: "優先" };
const NEXT: Record<Priority, Priority> = { normal: "high", high: "off", off: "normal" };

export function WeekScreen() {
  const s = useStore();
  const week = currentWeek(s);
  const month = currentMonth(s);
  const now = new Date();
  const plan = buildPlan({ actions: s.actions, draws: s.draws, month, week, mood: s.mood, now });
  const boosts = goalBoosts(s.actions, s.draws, month, now);
  const start = parseYmd(week.weekStart).getTime();
  const weekDraws = s.draws.filter((d) => d.at >= start);
  const count = (o: string) => weekDraws.filter((d) => d.outcome === o).length;
  const active = s.actions.filter((a) => !a.archived);

  return (
    <div>
      <h1>今週</h1>
      <p className="muted">{week.weekStart} からの週</p>

      <h3>今週の状況</h3>
      <div className="segmented">
        {BUSY.map((b) => (
          <button key={b.id} className={week.busy === b.id ? "active" : ""} onClick={() => s.setWeek({ busy: b.id })}>
            {b.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="meter">
          <span>防御の必要量</span>
          <div className="bar"><i style={{ width: `${plan.defensePressure * 100}%` }} /></div>
        </div>
        <p className="muted">
          いま回すと 防御 {Math.round(plan.pDefense * 100)}% / 攻撃 {Math.round((1 - plan.pDefense) * 100)}% くらいで出ます。
        </p>
        <p className="muted">
          今週: やった {count("done")} ・ パス {count("skipped")} ・ 脱線 {count("detour")}
        </p>
      </div>

      {s.goals.length > 0 && (
        <>
          <h3>目標ごとの補正</h3>
          <ul className="list">
            {s.goals.map((g) => (
              <li key={g.id} className="row">
                <span>★ {g.title}</span>
                <span className="muted">
                  {(boosts[g.id] ?? 1) >= 1.4 ? "出やすくしています" : (boosts[g.id] ?? 1) <= 0.7 ? "今週は十分" : "ふつう"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>抽選対象と優先度</h3>
      <p className="muted">タップで「ふつう → 優先 → 出さない」と切り替わります。</p>
      <ul className="list">
        {active.map((a) => {
          const p = week.priorities[a.id] ?? "normal";
          return (
            <li key={a.id} className="row">
              <span>
                <span className={`badge ${a.kind}`}>{a.kind === "defense" ? "防" : "攻"}</span> {a.title}
              </span>
              <button className={`chip ${p}`} onClick={() => s.setPriority(a.id, NEXT[p])}>
                {PRIORITY_LABEL[p]}
              </button>
            </li>
          );
        })}
      </ul>

      {count("detour") > 0 && (
        <>
          <h3>今週の脱線</h3>
          <ul className="list">
            {weekDraws.filter((d) => d.outcome === "detour").map((d) => (
              <li key={d.id} className="row">
                <span>{d.detourNote || "(メモなし)"}</span>
                <span className={`badge ${d.detourKind}`}>{d.detourKind === "defense" ? "防" : "攻"}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
