// Open Food Facts: 世界最大のオープン食品DB。APIキー不要で、
// スキャンしたバーコードから商品名・栄養成分(100gあたり)を取得できる。
// https://world.openfoodfacts.org/

export interface OpenFoodFactsResult {
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
  perUnit: "100g"; // Open Food Facts の栄養値は 100g あたり
}

const ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
const round1 = (n: unknown) => Math.round((Number(n) || 0) * 10) / 10;

export async function lookupOpenFoodFacts(
  barcode: string,
): Promise<OpenFoodFactsResult | null> {
  const url =
    `${ENDPOINT}/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,product_name_ja,brands,nutriments`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    return null; // オフライン等 → 撮影フォールバックへ
  }
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments ?? {};

  const nameParts = [p.brands, p.product_name_ja || p.product_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!nameParts) return null;

  return {
    name: nameParts,
    protein: round1(n.proteins_100g),
    fat: round1(n.fat_100g),
    carb: round1(n.carbohydrates_100g),
    calories: Math.round(
      Number(n["energy-kcal_100g"]) ||
        // energy_100g は kJ の場合がある → kcal 換算
        (Number(n.energy_100g) ? Number(n.energy_100g) / 4.184 : 0),
    ),
    perUnit: "100g",
  };
}
