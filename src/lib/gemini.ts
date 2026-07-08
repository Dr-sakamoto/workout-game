export interface GeminiNutrition {
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

// 栄養成分表示の写真から PFC・カロリーを読み取る。API キーをクライアントに
// 露出させないため、Vercel サーバーレス関数(api/gemini-nutrition.ts)経由で
// Gemini を呼ぶ。商品名は常にコミュニティDB／正規名DB／ユーザー入力から得る
// (名前をAIに任せるとユーザーごとの表記ゆれが生まれるため、AIには推測させない)。
//
// 注意: このエンドポイントは Vercel Functions。`vite` のローカル開発サーバーには
// 存在しないため、開発中は `vercel dev` を使うかデプロイ環境で確認すること。
export async function analyzeNutritionLabel(backDataUrl: string): Promise<GeminiNutrition> {
  const res = await fetch("/api/gemini-nutrition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: backDataUrl }),
  });

  if (!res.ok) {
    let reason = String(res.status);
    try {
      const err = await res.json();
      if (err?.error) reason = err.error;
    } catch {
      /* JSON でないエラー応答はステータスコードのまま */
    }
    if (reason === "unconfigured") {
      throw new Error("栄養解析が未設定です（サーバーにAPIキーがありません）。手入力で記録してください。");
    }
    throw new Error(`栄養成分を読み取れませんでした（${reason}）`);
  }

  return res.json();
}
