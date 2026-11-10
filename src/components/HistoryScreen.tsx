import { useStore } from "../store/useStore";
import { parseYmd } from "../domain/dates";

/** 上納したカードの記録 */
export function HistoryScreen() {
  const s = useStore();
  const cards = s.cards.filter((c) => c.tributed).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <h1>これまでのカード</h1>
      {cards.length === 0 && <p className="muted">まだ上納したカードはありません。日付が変わると、その日のカードがここに残ります。</p>}
      <ul className="list">
        {cards.map((c) => {
          const items = c.drawIds.map((id) => s.draws.find((d) => d.id === id)).filter((d) => d !== undefined);
          const done = items.filter((d) => d.outcome === "done").length;
          const d = parseYmd(c.date);
          return (
            <li key={c.date} className="card">
              <div className="row">
                <b>{d.getMonth() + 1}/{d.getDate()}</b>
                <span className="muted">完了 {done}/{items.length}</span>
              </div>
              <ul className="history-items">
                {items.map((x) => (
                  <li key={x.id} className={x.outcome === "done" ? "ok" : ""}>
                    {x.outcome === "done" ? "✔" : "・"} {s.actions.find((a) => a.id === x.actionId)?.title}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
