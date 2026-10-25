import { useState } from "react";
import { useStore } from "../store/useStore";
import type { DailyCard } from "../domain/types";
import { parseYmd } from "../domain/dates";
import { sound } from "../lib/sound";
import { StickerFace } from "./StickerFace";

type Confirm = { kind: "sticker"; id: string } | { kind: "ban"; step: 1 | 2 } | null;

/** live=操作できる / reveal=出てきた直後の演出 / tribute=上納中 */
export type CardMode = "live" | "reveal" | "tribute";

function Stamp({ pressing }: { pressing: boolean }) {
  return (
    <div className={`stamp-tool ${pressing ? "pressing" : ""}`} aria-hidden>
      <span className="stamp-knob" />
      <span className="stamp-neck" />
      <span className="stamp-base" />
    </div>
  );
}

export function DailyCardView({ card, mode }: { card: DailyCard; mode: CardMode }) {
  const { draws, actions, bans, completeSticker, breakBan } = useStore();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const live = mode === "live";

  const stickers = card.drawIds
    .map((id) => draws.find((d) => d.id === id))
    .filter((d) => d !== undefined)
    .map((d) => ({ draw: d, action: actions.find((a) => a.id === d.actionId) }))
    .filter((x) => x.action !== undefined)
    // 楽しいものほど左に
    .sort((a, b) => b.action!.fun - a.action!.fun);
  const ban = bans.find((b) => b.id === card.banId);

  const press = (key: string, commit: () => void) => {
    setPressing(key);
    setTimeout(() => {
      sound.stamp();
      commit();
      setShake(true);
    }, 280);
    setTimeout(() => {
      setPressing(null);
      setConfirm(null);
      setShake(false);
    }, 700);
  };

  const d = parseYmd(card.date);
  const question =
    confirm?.kind === "sticker"
      ? "このタスクが終わりましたか?"
      : confirm?.kind === "ban"
        ? confirm.step === 1
          ? "禁止事項を破りましたか?"
          : "本当に破りましたか? 取り消せません"
        : null;

  return (
    <div className={`daily-card mode-${mode} ${shake ? "shake" : ""}`}>
      <div className={`card-head ${question ? "asking" : ""}`}>
        {question ?? (
          <>
            <span>{d.getMonth() + 1}月{d.getDate()}日のカード</span>
            <span className="card-count">
              {stickers.filter((s) => s.draw.outcome === "done").length}/{stickers.length}
            </span>
          </>
        )}
      </div>

      <div className="stickers">
        {stickers.map(({ draw, action }, i) => {
          const a = action!;
          const done = draw.outcome === "done";
          const asking = confirm?.kind === "sticker" && confirm.id === draw.id;
          return (
            <div
              key={draw.id}
              className={`sticker kira-${a.fun} ${done ? "done" : ""} ${asking ? "asking" : ""}`}
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
              onClick={() => {
                if (!live || done || pressing) return;
                setConfirm(asking ? null : { kind: "sticker", id: draw.id });
              }}
            >
              <StickerFace title={a.title} starter={a.starter} fun={a.fun} />
              {asking && pressing !== draw.id && (
                <div className="sticker-confirm" onClick={(e) => e.stopPropagation()}>
                  <button className="yes" onClick={() => press(draw.id, () => completeSticker(draw.id))}>はい</button>
                  <button onClick={() => setConfirm(null)}>いいえ</button>
                </div>
              )}
              {(asking || pressing === draw.id) && <Stamp pressing={pressing === draw.id} />}
              {done && <div className="imprint">完了</div>}
            </div>
          );
        })}
        {stickers.length === 0 && <p className="card-empty">行動が登録されていません</p>}
      </div>

      {ban && (
        <div
          className={`ban ${card.banBroken ? "broken" : ""} ${confirm?.kind === "ban" ? "asking" : ""}`}
          onClick={() => {
            if (!live || card.banBroken || pressing) return;
            setConfirm(confirm?.kind === "ban" ? null : { kind: "ban", step: 1 });
          }}
        >
          <span className="ban-label">今日の禁止</span>
          <span className="ban-title">{ban.title}</span>
          {confirm?.kind === "ban" && pressing !== "ban" && (
            <span className="ban-confirm" onClick={(e) => e.stopPropagation()}>
              <button
                className="yes"
                onClick={() =>
                  confirm.step === 1 ? setConfirm({ kind: "ban", step: 2 }) : press("ban", () => breakBan(card.date))
                }
              >
                はい
              </button>
              <button onClick={() => setConfirm(null)}>いいえ</button>
            </span>
          )}
          {(confirm?.kind === "ban" || pressing === "ban") && <Stamp pressing={pressing === "ban"} />}
          {card.banBroken && <div className="imprint">違反</div>}
        </div>
      )}

      {mode === "tribute" && <div className="tribute-label">上納</div>}
    </div>
  );
}
