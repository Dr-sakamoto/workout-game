const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

export interface GeminiFoodResult {
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

function imageToBase64Part(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  return { inlineData: { mimeType, data } };
}

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

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          imageToBase64Part(frontDataUrl),
          imageToBase64Part(backDataUrl),
          { text: prompt },
        ],
      }],
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
