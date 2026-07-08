// Vercel サーバーレス関数: 栄養成分表示の写真から PFC・カロリーを読み取る。
// Gemini API キーをクライアントに露出させないため、ここでサーバー側から呼ぶ
// (旧: VITE_GEMINI_API_KEY はバンドルに焼き込まれ DevTools から抜き取れた)。
// キーは VITE_ を付けない GEMINI_API_KEY をサーバー環境変数として設定する。

const PROMPT = `この商品パッケージの栄養成分表示の画像を見て、以下をJSONで返してください。
- protein: タンパク質(g) ※1食分または100gあたり
- fat: 脂質(g)
- carb: 炭水化物(g)
- calories: カロリー(kcal)

必ず純粋なJSONのみを返してください。コードブロックや説明は不要です。
例: {"protein":2.1,"fat":8.3,"carb":12.4,"calories":131}`;

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const [header, data] = String(dataUrl).split(",");
  if (!data) return null;
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  return { mimeType, data };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("gemini-nutrition: GEMINI_API_KEY が未設定です");
    res.status(503).json({ error: "unconfigured" });
    return;
  }

  // body は Vercel が JSON をパース済みだが、文字列で来る場合にも備える
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "bad-body" });
      return;
    }
  }
  const image = parseDataUrl(body?.image ?? "");
  if (!image) {
    res.status(400).json({ error: "bad-image" });
    return;
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: PROMPT }] },
        ],
        generationConfig: { temperature: 0 },
      }),
    });

    if (!r.ok) {
      console.warn(`gemini-nutrition: 上流APIがエラー応答 status=${r.status}`);
      res.status(502).json({ error: `upstream-${r.status}` });
      return;
    }

    const data = await r.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      res.status(502).json({ error: "unparseable" });
      return;
    }
    const nutrition = JSON.parse(match[0]);
    res.status(200).json({
      protein: Number(nutrition.protein) || 0,
      fat: Number(nutrition.fat) || 0,
      carb: Number(nutrition.carb) || 0,
      calories: Number(nutrition.calories) || 0,
    });
  } catch (e) {
    console.warn("gemini-nutrition: 呼び出し失敗", e);
    res.status(502).json({ error: "fetch-error" });
  }
}
