import { useState } from "react";
import { useStore } from "../store/useStore";

export function BansScreen() {
  const s = useStore();
  const [title, setTitle] = useState("");
  const active = s.bans.filter((b) => !b.archived);
  const brokenCount = (id: string) => s.cards.filter((c) => c.banId === id && c.banBroken).length;

  const add = () => {
    if (!title.trim()) return;
    s.addBan(title.trim());
    setTitle("");
  };

  return (
    <div>
      <h1>禁止事項</h1>
      <p className="muted">毎日1つ、カードの下の帯に出ます。最近破ったものほど出やすくなります。</p>
      <ul className="list">
        {active.map((b) => (
          <li key={b.id} className="card row">
            <input className="plain" value={b.title} onChange={(e) => s.updateBan(b.id, e.target.value)} />
            {brokenCount(b.id) > 0 && <span className="muted nowrap">破った {brokenCount(b.id)}回</span>}
            <button className="ghost" onClick={() => s.removeBan(b.id)} aria-label="削除">×</button>
          </li>
        ))}
      </ul>
      <div className="card form">
        <input placeholder="例: 寝る前にYouTube" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button onClick={add} disabled={!title.trim()}>追加</button>
      </div>
    </div>
  );
}
