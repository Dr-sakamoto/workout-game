import { useGameStore } from "../store/useGameStore";
import { SHOP_ITEMS } from "../domain/shop";
import { soundEngine } from "../sounds/soundEngine";

export function ShopModal({ onClose }: { onClose: () => void }) {
  const gold = useGameStore((s) => s.avatar.gold);
  const buyItem = useGameStore((s) => s.buyItem);
  const expBoostCharges = useGameStore((s) => s.expBoostCharges);
  const streakShields = useGameStore((s) => s.streakShields);

  const owned: Record<string, number> = {
    expBoost: expBoostCharges,
    streakShield: streakShields,
  };

  return (
    <div className="toast-overlay" onClick={onClose}>
      <div className="toast" style={{ maxWidth: 340, textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: "var(--amber)", fontSize: 12 }}>🏪 ショップ</h2>
          <span className="coin">🪙 {gold}</span>
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          ゴールドで鍛錬を後押しする消耗品を買える。装備やスキンは売らない（鍛えた体だけが見た目）。
        </p>

        {SHOP_ITEMS.map((item) => {
          const canBuy = gold >= item.cost;
          return (
            <div className="quest" key={item.id}>
              <div className="qhead">
                <span>{item.emoji} {item.name}</span>
                <span className="reward">{item.cost} G</span>
              </div>
              <div className="hint" style={{ margin: "4px 0 8px" }}>
                {item.desc}（所持: {owned[item.id] ?? 0}）
              </div>
              <button
                className="btn green full"
                disabled={!canBuy}
                onClick={() => { buyItem(item.id); soundEngine.play("purchase"); }}
              >
                {canBuy ? "購入する" : "ゴールド不足"}
              </button>
            </div>
          );
        })}

        <button className="btn full" style={{ marginTop: 4 }} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
