import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { lookupCommunityFood, registerCommunityFood } from "../lib/supabase";
import { analyzeFoodPhotos } from "../lib/gemini";

interface FoodResult {
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

interface Props {
  onResult: (food: FoodResult) => void;
  onClose: () => void;
}

type Phase =
  | "scanning"
  | "looking-up"
  | "found"
  | "photo-front"
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
  const [frontPhoto, setFrontPhoto] = useState("");
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
    stopEverything();
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

    // 未登録なら撮影 → AI解析 → コミュニティDBに登録（次回以降は誰でも即参照できる）
    setPhase("photo-front");
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
    if (phase !== "photo-front" && phase !== "photo-back") return;
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

  const handleFrontShot = () => {
    setFrontPhoto(takePhoto());
    setPhase("photo-back"); // ストリームは維持したまま裏面へ
  };

  const handleBackShot = async () => {
    const backPhoto = takePhoto();
    stopEverything();
    setPhase("analyzing");
    try {
      const result = await analyzeFoodPhotos(frontPhoto, backPhoto);
      setForm(result);
      setPhase("confirm");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase("error");
    }
  };

  const handleRegister = async () => {
    if (barcode) {
      try {
        await registerCommunityFood({ barcode, ...form });
      } catch {
        /* 登録失敗しても記録は続行 */
      }
    }
    onResult(form);
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
            <button className="btn full" onClick={() => onResult(form)}>この食品を記録</button>
            <button className="btn secondary full" style={{ marginTop: 8 }} onClick={() => setPhase("confirm")}>
              数値を修正する
            </button>
          </>
        )}

        {/* ③ 表面撮影 */}
        {phase === "photo-front" && (
          <>
            <h3>📷 商品の表を撮影</h3>
            <p className="barcode-hint">データベースに未登録です。商品名を読み取ります。</p>
            <div className="video-wrap">
              <video ref={photoVideoRef} className="barcode-video" autoPlay playsInline muted />
            </div>
            <button className="btn full" onClick={handleFrontShot}>撮影</button>
          </>
        )}

        {/* ④ 裏面撮影 */}
        {phase === "photo-back" && (
          <>
            <h3>📷 栄養成分表示を撮影</h3>
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
            <p className="barcode-hint">修正してからコミュニティに登録できます</p>
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="商品名"
              style={{ marginBottom: 8 }}
            />
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
              <button className="btn secondary full" style={{ marginTop: 8 }} onClick={() => onResult(form)}>
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
