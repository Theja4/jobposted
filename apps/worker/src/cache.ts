import type { AtsType } from "@jobposted/shared";
import type { CachedStructure, FieldMapCacheStore } from "@jobposted/field-match";
import { db } from "./supabase";

/** Supabase-backed field-map structure cache (jobposted.field_map_cache, design doc §11.2). */
export const supabaseCache: FieldMapCacheStore = {
  async get(atsType: AtsType, company: string): Promise<CachedStructure | null> {
    const { data } = await db()
      .from("field_map_cache")
      .select("structure")
      .eq("ats_type", atsType)
      .eq("company", company)
      .maybeSingle();
    return (data?.structure as CachedStructure | undefined) ?? null;
  },
  async set(atsType: AtsType, company: string, structure: CachedStructure): Promise<void> {
    await db()
      .from("field_map_cache")
      .upsert(
        { ats_type: atsType, company, structure, updated_at: new Date().toISOString() },
        { onConflict: "ats_type,company" },
      );
  },
};
