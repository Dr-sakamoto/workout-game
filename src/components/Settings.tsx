import { useState } from "react";
import { WeekScreen } from "./WeekScreen";
import { MonthScreen } from "./MonthScreen";
import { YearScreen } from "./YearScreen";
import { ActionsScreen } from "./ActionsScreen";
import { BansScreen } from "./BansScreen";
import { HistoryScreen } from "./HistoryScreen";

const TABS = [
  { id: "actions", label: "行動" },
  { id: "bans", label: "禁止" },
  { id: "week", label: "週" },
  { id: "month", label: "月" },
  { id: "year", label: "年" },
  { id: "history", label: "これまで" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** ガチャ本体をタップすると開く設定 */
export function Settings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("actions");
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>ガチャの設定</h2>
          <button className="ghost" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <nav className="sheet-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sheet-body">
          {tab === "actions" && <ActionsScreen />}
          {tab === "bans" && <BansScreen />}
          {tab === "week" && <WeekScreen />}
          {tab === "month" && <MonthScreen />}
          {tab === "year" && <YearScreen />}
          {tab === "history" && <HistoryScreen />}
        </div>
      </div>
    </div>
  );
}
