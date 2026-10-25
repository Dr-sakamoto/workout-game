import { useRef, useState } from "react";
import { moveBoundary } from "../domain/shares";

export interface PieSlice {
  key: string;
  label: string;
  fill: string;
  text: string;
}

const C = 100; // viewBox 200x200 の中心
const R = 63; // リングの中心線の半径
const WIDTH = 36; // リングの太さ
const CIRC = 2 * Math.PI * R;
const GAP = 2.2; // 枠と枠のあいだの白い隙間

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** 先頭(12時の位置)から時計回りに f(0〜1) 進んだ点 */
function pointAt(f: number, r = R) {
  const a = f * Math.PI * 2 - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * 円グラフでガチャ配分を決める。つなぎ目の白い丸をドラッグすると、両隣の枠の割合が変わる。
 * 枠をタップすると中央に名前と割合が出る。
 */
export function PieEditor({
  slices,
  percents,
  onCommit,
}: {
  slices: PieSlice[];
  /** 各枠の割合(%、合計100) */
  percents: number[];
  onCommit: (next: number[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const shown = draft ?? percents;
  const n = slices.length;
  const starts = shown.map((_, i) => sum(shown.slice(0, i)));
  const sel = slices.findIndex((s) => s.key === selected);

  /** 指の位置を、先頭からの累計(%)にする。いま境界がある側に寄せて、12時をまたいでも飛ばないようにする */
  const targetAt = (e: React.PointerEvent, current: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let f = (Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2);
    f = ((f % 1) + 1) % 1;
    let d = f - current / 100;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return current + d * 100;
  };

  const onDown = (b: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag(b);
    setDraft(percents);
    setSelected(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag === null || !draft) return;
    setDraft(moveBoundary(draft, drag, targetAt(e, sum(draft.slice(0, drag)))));
  };
  const onUp = () => {
    if (drag === null) return;
    if (draft && draft.some((v, i) => v !== percents[i])) onCommit(draft);
    setDrag(null);
    setDraft(null);
  };

  /** 中央の表示。dy は中心からのずれ */
  const centerLines = (() => {
    if (drag !== null) {
      return [drag - 1, drag].map((i, k) => ({ t: `${short(slices[i].label, 5)} ${shown[i]}%`, big: false, dy: k === 0 ? -9 : 9 }));
    }
    if (sel >= 0) {
      return [
        { t: short(slices[sel].label, 7), big: false, dy: -16 },
        { t: `${shown[sel]}%`, big: true, dy: 9 },
      ];
    }
    return [
      { t: "ガチャ配分", big: false, dy: -9 },
      { t: "ドラッグで調整", big: false, dy: 9 },
    ];
  })();

  return (
    <svg
      ref={svgRef}
      className="pie"
      viewBox="0 0 200 200"
      role="img"
      aria-label="ガチャ配分の円グラフ"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <g transform={`rotate(-90 ${C} ${C})`}>
        {slices.map((s, i) => {
          const len = Math.max(0, (shown[i] / 100) * CIRC - (n > 1 ? GAP : 0));
          const isSel = sel === i;
          return (
            <circle
              key={s.key}
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke={s.fill}
              strokeWidth={isSel ? WIDTH + 6 : WIDTH}
              strokeDasharray={`${len} ${CIRC - len}`}
              strokeDashoffset={-((starts[i] / 100) * CIRC + (n > 1 ? GAP / 2 : 0))}
              opacity={sel >= 0 && !isSel ? 0.45 : 1}
              pointerEvents="stroke"
              style={{ cursor: "pointer", transition: "stroke-width 0.15s, opacity 0.15s" }}
              onClick={() => drag === null && setSelected(isSel ? null : s.key)}
            />
          );
        })}
      </g>

      {slices.map((s, i) => {
        if (shown[i] < 9) return null;
        const p = pointAt((starts[i] + shown[i] / 2) / 100);
        return (
          <text
            key={s.key}
            x={p.x}
            y={p.y}
            fill={s.text}
            fontSize="10.5"
            fontWeight="800"
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            {shown[i]}%
          </text>
        );
      })}

      {/* 中央の表示 */}
      <g pointerEvents="none" textAnchor="middle" dominantBaseline="central" fill="#1a1a1a">
        {centerLines.map((l, i) => (
          <text key={i} x={C} y={C + l.dy} fontSize={l.big ? 26 : 10.5} fontWeight={l.big ? 800 : 700} fill={l.big ? "#1a1a1a" : "#66666c"}>
            {l.t}
          </text>
        ))}
      </g>

      {/* つなぎ目のつまみ(先頭の12時の位置は固定なので動かせない) */}
      {slices.slice(1).map((_, k) => {
        const b = k + 1;
        const p = pointAt(starts[b] / 100);
        const active = drag === b;
        return (
          <g key={b} className="pie-handle" onPointerDown={onDown(b)}>
            <circle cx={p.x} cy={p.y} r={17} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={active ? 9.5 : 8} fill="#fff" stroke="#1a1a1a" strokeWidth="2" />
            <circle cx={p.x} cy={p.y} r={2.2} fill="#1a1a1a" />
          </g>
        );
      })}
    </svg>
  );
}
