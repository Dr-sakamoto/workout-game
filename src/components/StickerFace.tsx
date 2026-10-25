import type { Fun } from "../domain/types";

const SPARKLES = [
  { left: "12%", top: "14%", delay: "0s" },
  { left: "78%", top: "22%", delay: ".6s" },
  { left: "30%", top: "70%", delay: "1.1s" },
  { left: "84%", top: "78%", delay: ".3s" },
  { left: "55%", top: "8%", delay: "1.5s" },
];

/** ステッカーの中身。カードと、行動エディタのプレビューで共通 */
export function StickerFace({ title, starter, fun }: { title: string; starter: string; fun: Fun }) {
  return (
    <div className="sticker-face">
      {fun >= 3 && SPARKLES.map((s, j) => <i key={j} className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}
      <div className="sticker-title">{title}</div>
      <div className="sticker-starter">{starter}</div>
    </div>
  );
}
