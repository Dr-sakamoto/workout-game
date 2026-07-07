import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { lookupCommunityFood, registerCommunityFood } from "../lib/supabase";
import { analyzeNutritionLabel } from "../lib/gemini";
import { lookupCanonicalProductName } from "../lib/yahooShopping";
import { lookupOpenFoodFactsName } from "../lib/openFoodFacts";
import { soundEngine } from "../sounds/soundEngine";

interface FoodResult {
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
  /** スキャン/手入力されたバーコード。記録に紐付けて後から修正できるようにする */
  barcode?: string;
}

interface Props {
  onResult: (food: FoodResult) => void;
  onClose: () => void;
}

type Phase =
  | "scanning"
  | "looking-up"
  | "found"
  | "name-input"
  | "photo-back"
  | "analyzing"
  | "confirm"
  | "error";

// 商品バーコードで実際に使われる 1D フォーマットに絞ると認識が速く・確実になる
const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

function buildHints() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [phase, setPhase] = useState<Phase>("scanning");
  const [barcode, setBarcode] = useState("");
  // 正規名DB(JANコード)から商品名が確定済みか。確定済みなら確認画面で
  // 編集不可にする＝ユーザー間の表記ゆれを防げる
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [manualName, setManualName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [form, setForm] = useState<FoodResult>({ name: "", protein: 0, fat: 0, carb: 0, calories: 0 });

  // すべてのカメラ資源を確実に止める（キャンセル時の「録画が止まらない」対策）
  const stopEverything = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* noop */
    }
    controlsRef.current = null;

    [videoRef.current?.srcObject, photoVideoRef.current?.srcObject, streamRef.current].forEach((obj) => {
      if (obj instanceof MediaStream) obj.getTracks().forEach((t) => t.stop());
    });
    if (videoRef.current) videoRef.current.srcObject = null;
    if (photoVideoRef.current) photoVideoRef.current.srcObject = null;
    streamRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    stopEverything();
    onClose();
  }, [stopEverything, onClose]);

  // アンマウント時にも必ずカメラを解放
  useEffect(() => stopEverything, [stopEverything]);

  // バーコードが取れたらコミュニティDBを参照し、無ければ撮影して登録する
  const resolveBarcode = useCallback(async (code: string) => {
    setBarcode(code);
    setNameConfirmed(false); // 前回スキャン分の状態を持ち越さない
    setManualName("");
    stopEverything();
    soundEngine.play("scan"); // バーコードを読み取れた合図(実機スキャナのビープ風)
    setPhase("looking-up");

    // 誰かが初回登録済みなら、その値をそのまま使える（ユーザー共有DB）
    try {
      const found = await lookupCommunityFood(code);
      if (found) {
        setForm(found);
        setPhase("found");
        return;
      }
    } catch {
      /* DB接続失敗時も撮影フローへフォールバック */
    }

    // 未登録の場合、まずJANコードから正規の商品名を取得する。
    // ここで名前を確定できれば、ユーザーごとにAIが商品名を推測して
    // 表記ゆれが生まれる事態を避けられる（栄養成分の撮影だけで済む）。
    // Yahoo(要APIキー・サーバー経由)が未設定/未ヒットでも、Open Food Facts
    // (キー不要の共有食品DB)をフォールバックにして命中率を上げる
    const canonicalName =
      (await lookupCanonicalProductName(code)) ?? (await lookupOpenFoodFactsName(code));
    if (canonicalName) {
      setForm((f) => ({ ...f, name: canonicalName }));
      setNameConfirmed(true);
      setPhase("photo-back");
      return;
    }

    // 正規名も取れない場合は、AIに推測させず自分で商品名を入力してもらう
    setPhase("name-input");
  }, [stopEverything]);

  // バーコードスキャン（背面カメラ・商品フォーマット限定）
  useEffect(() => {
    if (phase !== "scanning") return;
    const reader = new BrowserMultiFormatReader(buildHints());
    let active = true;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result) => {
          if (!active || !result) return;
          active = false;
          void resolveBarcode(result.getText());
        },
      )
      .then((controls) => {
        if (!active) {
          controls.stop(); // すでに解決/クローズ済みなら即停止
          return;
        }
        controlsRef.current = controls;
      })
      .catch((e) => {
        if (!active) return;
        setErrorMsg(
          (e as Error)?.name === "NotAllowedError"
            ? "カメラの使用が許可されていません。ブラウザの権限設定を確認してください。"
            : "カメラを起動できませんでした",
        );
        setPhase("error");
      });

    return () => {
      active = false;
      try {
        controlsRef.current?.stop();
      } catch {
        /* noop */
      }
      controlsRef.current = null;
      if (videoRef.current?.srcObject instanceof MediaStream) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [phase, resolveBarcode]);

  // 撮影フェーズでカメラ起動
  useEffect(() => {
    if (phase !== "photo-back") return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (photoVideoRef.current) photoVideoRef.current.srcObject = stream;
      } catch {
        setErrorMsg("カメラを起動できませんでした");
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (photoVideoRef.current) photoVideoRef.current.srcObject = null;
    };
  }, [phase]);

  const takePhoto = useCallback((): string => {
    const video = photoVideoRef.current!;
    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const handleBackShot = async () => {
    const backPhoto = takePhoto();
    stopEverything();
    setPhase("analyzing");
    try {
      // 商品名はこの時点で既に確定済み（コミュニティDB／正規名DB／手入力の
      // いずれか）。AIには栄養成分だけを読み取らせる
      const nutrition = await analyzeNutritionLabel(backPhoto);
      setForm((f) => ({ ...f, ...nutrition }));
      setPhase("confirm");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase("error");
    }
  };

  const handleRegister = async () => {
    if (barcode) {
      try {
        await registerCommunityFood({ ...form, barcode });
      } catch {
        /* 登録失敗しても記録は続行 */
      }
    }
    onResult({ ...form, barcode: barcode || undefined });
  };

  const setField = (k: keyof FoodResult, v: string) =>
    setForm((f) => ({ ...f, [k]: k === "name" ? v : Number(v) }));

  return (
    <div className="barcode-overlay" onClick={handleClose}>
      <div className="barcode-modal" onClick={(e) => e.stopPropagation()}>
        <button className="barcode-close" onClick={handleClose} aria-label="閉じる">✕</button>

        {/* ① バーコードスキャン */}
        {phase === "scanning" && (
          <>
            <h3>バーコードをスキャン</h3>
            <p className="barcode-hint">商品のバーコードを枠内に収めてください</p>
            <div className="video-wrap">
              <video ref={videoRef} className="barcode-video" autoPlay playsInline muted />
              <div className="scan-frame">
                <span className="corner tl" /><span className="corner tr" />
                <span className="corner bl" /><span className="corner br" />
                <div className="scan-line" />
              </div>
            </div>
            <div className="barcode-manual">
              <input
                inputMode="numeric"
                placeholder="読み取れない場合は番号を入力"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
              />
              <button
                className="btn secondary"
                disabled={manualCode.length < 8}
                onClick={() => void resolveBarcode(manualCode)}
              >
                検索
              </button>
            </div>
          </>
        )}

        {/* 検索中 */}
        {phase === "looking-up" && (
          <div className="barcode-loading">
            <div className="spinner" />
            <p>商品データベースを検索中…</p>
          </div>
        )}

        {/* ② コミュニティDBで発見 */}
        {phase === "found" && (
          <>
            <div className="found-badge">✅ コミュニティDBで発見</div>
            <div className="found-card">
              <div className="found-name">{form.name}</div>
              <div className="found-pfc">
                <span><b>P</b>{form.protein}<small>g</small></span>
                <span><b>F</b>{form.fat}<small>g</small></span>
                <span><b>C</b>{form.carb}<small>g</small></span>
                <span className="kcal">{form.calories}<small>kcal</small></span>
              </div>
            </div>
            <button className="btn full" onClick={() => onResult({ ...form, barcode })}>この食品を記録</button>
            <button className="btn secondary full" style={{ marginTop: 8 }} onClick={() => setPhase("confirm")}>
              間違いがある？ 修正する
            </button>
          </>
        )}

        {/* ③ 商品名を入力（DBに無い場合のみ・AIには推測させない） */}
        {phase === "name-input" && (
          <>
            <h3>商品名を入力</h3>
            <p className="barcode-hint">商品名が見つかりませんでした。入力してください。</p>
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="商品名"
              style={{ marginBottom: 12 }}
            />
            <button
              className="btn full"
              disabled={!manualName.trim()}
              onClick={() => {
                setForm((f) => ({ ...f, name: manualName.trim() }));
                setPhase("photo-back");
              }}
            >
              次へ：栄養成分表示を撮影
            </button>
            <button
              className="btn secondary full"
              style={{ marginTop: 8 }}
              disabled={!manualName.trim()}
              onClick={() => {
                setForm((f) => ({ ...f, name: manualName.trim() }));
                setPhase("confirm");
              }}
            >
              数値も自分で入力する
            </button>
          </>
        )}

        {/* ④ 栄養成分表示を撮影（商品名は確定済み） */}
        {phase === "photo-back" && (
          <>
            <h3>📷 栄養成分表示を撮影</h3>
            <div className="found-badge">🏷️ {form.name}</div>
            <p className="barcode-hint">パッケージ裏の栄養成分表示を写してください</p>
            <div className="video-wrap">
              <video ref={photoVideoRef} className="barcode-video" autoPlay playsInline muted />
            </div>
            <button className="btn full" onClick={handleBackShot}>撮影して解析</button>
          </>
        )}

        {/* ⑤ Gemini解析中 */}
        {phase === "analyzing" && (
          <div className="barcode-loading">
            <div className="spinner" />
            <p>AIが栄養成分を読み取り中…</p>
          </div>
        )}

        {/* ⑥ 確認・修正・登録 */}
        {phase === "confirm" && (
          <>
            <h3>内容を確認</h3>
            <p className="barcode-hint">
              {nameConfirmed
                ? "栄養成分を確認してからコミュニティに登録できます"
                : "修正してからコミュニティに登録できます"}
            </p>
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="商品名"
              readOnly={nameConfirmed}
              style={{ marginBottom: nameConfirmed ? 4 : 8, opacity: nameConfirmed ? 0.75 : 1 }}
            />
            {nameConfirmed && (
              <p className="barcode-hint" style={{ marginBottom: 8 }}>
                ※ 正規の商品名のため編集できません（表記ゆれ防止）
              </p>
            )}
            <div className="inline-inputs">
              <input type="number" placeholder="P(g)" value={form.protein} onChange={(e) => setField("protein", e.target.value)} />
              <input type="number" placeholder="F(g)" value={form.fat} onChange={(e) => setField("fat", e.target.value)} />
              <input type="number" placeholder="C(g)" value={form.carb} onChange={(e) => setField("carb", e.target.value)} />
              <input type="number" placeholder="kcal" value={form.calories} onChange={(e) => setField("calories", e.target.value)} />
            </div>
            <button className="btn full" style={{ marginTop: 12 }} onClick={handleRegister}>
              {barcode ? "コミュニティに登録して記録" : "この内容で記録"}
            </button>
            {barcode && (
              <button className="btn secondary full" style={{ marginTop: 8 }} onClick={() => onResult({ ...form, barcode })}>
                登録せずに記録だけする
              </button>
            )}
          </>
        )}

        {/* エラー */}
        {phase === "error" && (
          <div className="barcode-error">
            <p>⚠️ {errorMsg}</p>
            <button className="btn full" onClick={() => setPhase("scanning")}>再スキャン</button>
            <button className="btn secondary full" style={{ marginTop: 8 }} onClick={handleClose}>閉じる</button>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}
