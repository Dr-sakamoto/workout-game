import { useState } from "react";
import { useStore } from "./store/useStore";
import { GachaScreen } from "./components/GachaScreen";
import { WeekScreen } from "./components/WeekScreen";
import { MonthScreen } from "./components/MonthScreen";
import { YearScreen } from "./components/YearScreen";
import { ActionsScreen } from "./components/ActionsScreen";
import { Onboarding } from "./components/Onboarding";

const TABS = [
  { id: "gacha", label: "ガチャ", icon: "◎" },
  { id: "week", label: "週", icon: "▦" },
  { id: "month", label: "月", icon: "◐" },
  { id: "year", label: "年", icon: "★" },
  { id: "actions", label: "行動", icon: "≡" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function App() {
  const onboarded = useStore((s) => s.onboarded);
  const [tab, setTab] = useState<Tab>("gacha");

  if (!onboarded) return <Onboarding />;

  return (
    <div className="app">
      <main className="screen">
        {tab === "gacha" && <GachaScreen />}
        {tab === "week" && <WeekScreen />}
        {tab === "month" && <MonthScreen />}
        {tab === "year" && <YearScreen />}
        {tab === "actions" && <ActionsScreen />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
