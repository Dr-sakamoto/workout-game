import { useState } from "react";
import { AllocationScreen } from "./AllocationScreen";
import { ActionsScreen } from "./ActionsScreen";
import { BansScreen } from "./BansScreen";
import { HistoryScreen } from "./HistoryScreen";

const TABS = [
  { id: "allocation", label: "配分" },
  { id: "actions", label: "行動" },
  { id: "bans", label: "禁止" },
  { id: "history", label: "これまで" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** ガチャ本体をタップすると開く設定 */
export function Settings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("allocation");
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
          {tab === "allocation" && <AllocationScreen />}
          {tab === "actions" && <ActionsScreen />}
          {tab === "bans" && <BansScreen />}
          {tab === "history" && <HistoryScreen />}
        </div>
      </div>
    </div>
  );
}
