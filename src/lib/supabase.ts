import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabase = url && key ? createClient(url, key) : null;

export interface CommunityFood {
  barcode: string;
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

// 誰でも上書き登録できる共有DBなので、負の値・非数・桁違いの異常値が
// 混入しうる(いたずら/入力ミス)。そのまま通すと全ユーザーの記録と
// コンディション計算(EXP補正)を汚染するため、参照時・登録時の両方で
// 常識的な範囲にクランプする。上限は「1食分としてありえない」水準で判定。
const NUTRITION_LIMITS = { protein: 300, fat: 300, carb: 500, calories: 3000 } as const;

function clampNutrient(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.round(n * 10) / 10));
}

function sanitizeFood(food: CommunityFood): CommunityFood {
  return {
    barcode: food.barcode,
    name: normalizeName(String(food.name ?? "")),
    protein: clampNutrient(food.protein, NUTRITION_LIMITS.protein),
    fat: clampNutrient(food.fat, NUTRITION_LIMITS.fat),
    carb: clampNutrient(food.carb, NUTRITION_LIMITS.carb),
    calories: clampNutrient(food.calories, NUTRITION_LIMITS.calories),
  };
}

export async function lookupCommunityFood(barcode: string): Promise<CommunityFood | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("community_foods")
    .select("barcode,name,protein,fat,carb,calories")
    .eq("barcode", barcode)
    .single();
  return data ? sanitizeFood(data) : null;
}

// 誰でも上書き登録できる Wikipedia 的な共有DB。表記ゆれを完全には防げない
// ので、せめて空白まわりだけは投稿のたびに正規化しておく。
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function registerCommunityFood(food: CommunityFood): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("community_foods")
    .upsert(sanitizeFood(food), { onConflict: "barcode" });
}
