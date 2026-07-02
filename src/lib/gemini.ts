const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

export interface GeminiFoodResult {
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

export type GeminiNutrition = Omit<GeminiFoodResult, "name">;

function imageToBase64Part(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  return { inlineData: { mimeType, data } };
}

async function callGeminiForJson<T>(parts: unknown[]): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Gemini の返答をパースできませんでした");
  }
}

// 商品名がまだ分からない場合: 表面＋裏面から名前とPFCの両方を読み取る
export async function analyzeFoodPhotos(
  frontDataUrl: string,
  backDataUrl: string,
): Promise<GeminiFoodResult> {
  const prompt = `この商品の表面と裏面の画像を見て、以下をJSONで返してください。
- name: 商品の正式名称（パッケージに書いてある通り）
- protein: タンパク質(g) ※1食分または100gあたり
- fat: 脂質(g)
- carb: 炭水化物(g)
- calories: カロリー(kcal)

必ず純粋なJSONのみを返してください。コードブロックや説明は不要です。
例: {"name":"カルビー ポテトチップス コンソメパンチ 60g","protein":2.1,"fat":8.3,"carb":12.4,"calories":131}`;

  return callGeminiForJson<GeminiFoodResult>([
    imageToBase64Part(frontDataUrl),
    imageToBase64Part(backDataUrl),
    { text: prompt },
  ]);
}

// 商品名が判明済み（正規名DB由来）の場合: 栄養成分表示だけを読み取る。
// 名前をAIに推測させないことで、コミュニティDB上の表記ゆれを防ぐ。
export async function analyzeNutritionLabel(backDataUrl: string): Promise<GeminiNutrition> {
  const prompt = `この商品パッケージの栄養成分表示の画像を見て、以下をJSONで返してください。
- protein: タンパク質(g) ※1食分または100gあたり
- fat: 脂質(g)
- carb: 炭水化物(g)
- calories: カロリー(kcal)

必ず純粋なJSONのみを返してください。コードブロックや説明は不要です。
例: {"protein":2.1,"fat":8.3,"carb":12.4,"calories":131}`;

  return callGeminiForJson<GeminiNutrition>([imageToBase64Part(backDataUrl), { text: prompt }]);
}
