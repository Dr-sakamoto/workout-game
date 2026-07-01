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

export async function lookupCommunityFood(barcode: string): Promise<CommunityFood | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("community_foods")
    .select("barcode,name,protein,fat,carb,calories")
    .eq("barcode", barcode)
    .single();
  return data ?? null;
}

export async function registerCommunityFood(food: CommunityFood): Promise<void> {
  if (!supabase) return;
  await supabase.from("community_foods").upsert(food, { onConflict: "barcode" });
}
