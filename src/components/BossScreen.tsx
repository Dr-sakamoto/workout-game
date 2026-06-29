import { useGameStore } from "../store/useGameStore";
import { bossAt, BOSSES } from "../domain/bosses";

export function BossScreen() {
  const boss = useGameStore((s) => s.boss);
  const bossesDefeated = useGameStore((s) => s.bossesDefeated);

  const current = bossAt(boss.index);
  const hpPct = Math.max(0, Math.min(100, (boss.hp / current.maxHp) * 100));
  const next = bossAt(boss.index + 1);

  return (
    <div className="screen">
      <div className="panel">
        <h2>⚔️ ボス戦</h2>
        <p className="hint">
          トレーニングで得たEXPがそのまま敵への<strong>ダメージ</strong>になる。鍛えて倒せ。
        </p>

        <div style={{ textAlign: "center", margin: "16px 0 6px" }}>
          <div style={{ fontSize: 56 }}>{current.emoji}</div>
          <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 4 }}>{current.name}</div>
          <div className="hint" style={{ marginTop: 4 }}>{current.flavor}</div>
        </div>

        <div className="bar-label">
          <span>HP</span>
          <span>{Math.max(0, boss.hp)} / {current.maxHp}</span>
        </div>
        <div className="bar" style={{ height: 18 }}>
          <span className="fill-hp" style={{ width: `${hpPct}%` }} />
        </div>

        <div style={{ marginTop: 12, fontSize: 9, color: "var(--amber)", textAlign: "center" }}>
          撃破報酬: +{current.rewardExp} EXP / +{current.rewardGold} G
        </div>
      </div>

      <div className="panel">
        <h2>戦績</h2>
        <div className="log-item">
          <span>撃破したボス</span>
          <span className="exp">{bossesDefeated} 体</span>
        </div>
        <div className="log-item">
          <span>次の敵</span>
          <span>{next.emoji} {next.name}</span>
        </div>
      </div>

      <div className="panel">
        <h2>ボス図鑑</h2>
        {BOSSES.map((b, i) => {
          const defeated = boss.index > i;
          const isCurrent = boss.index === i;
          return (
            <div className="log-item" key={b.name}>
              <span style={{ opacity: defeated || isCurrent ? 1 : 0.4 }}>
                {defeated ? "✅" : isCurrent ? "⚔️" : "🔒"} {b.emoji}{" "}
                {defeated || isCurrent ? b.name : "？？？"}
              </span>
              <span className="hint">HP {b.maxHp}</span>
            </div>
          );
        })}
        <div className="log-item">
          <span style={{ opacity: boss.index >= BOSSES.length ? 1 : 0.4 }}>
            {boss.index >= BOSSES.length ? "⚔️" : "🔒"} 👹 鍛錬の化身（無限）
          </span>
          <span className="hint">∞</span>
        </div>
      </div>
    </div>
  );
}
