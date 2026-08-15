// ASM/GSM parsing helpers — ported from admin_backend's nse-scrape.provider.ts (this service now
// owns the surveillance scrape; the trading app reads the result back via GET /securities).
export function extractSurveillanceRows(
  payload: unknown,
): Array<Record<string, string>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, string>>;
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as Record<string, unknown>).data)
  ) {
    return (payload as Record<string, unknown>).data as Array<
      Record<string, string>
    >;
  }
  return [];
}

/**
 * ASM arrives bucketed by tenure — `{ longterm: { data: [...] }, shortterm: { data: [...] } }` —
 * unlike GSM's flat array, so it needs its own extractor that preserves which bucket a row came
 * from. Falls back to the flat/`.data` shapes so an API change to either form still parses.
 */
export function extractAsmRows(
  payload: unknown,
): Array<{ bucket: string; row: Record<string, string> }> {
  const flat = extractSurveillanceRows(payload);
  if (flat.length > 0) return flat.map((row) => ({ bucket: "", row }));

  if (!payload || typeof payload !== "object") return [];
  const out: Array<{ bucket: string; row: Record<string, string> }> = [];
  for (const [bucket, value] of Object.entries(
    payload as Record<string, unknown>,
  )) {
    for (const row of extractSurveillanceRows(value)) out.push({ bucket, row });
  }
  return out;
}

const ROMAN_DIGITS: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

/** "Stage II" -> 2, "Stage 3" -> 3, "LXII" -> 62, unparseable -> null. */
export function romanOrArabicToNumber(text: string): number | null {
  const arabic = text.match(/\d+/)?.[0];
  if (arabic) return Number(arabic);

  const roman = text
    .toUpperCase()
    .match(/[IVXLCDM]+/g)
    ?.pop();
  if (!roman) return null;

  let total = 0;
  for (let i = 0; i < roman.length; i += 1) {
    const current = ROMAN_DIGITS[roman[i]];
    const next = ROMAN_DIGITS[roman[i + 1]];
    total += next && current < next ? -current : current;
  }
  return total > 0 ? total : null;
}

/** Merges parsed ASM (bucketed by tenure) + GSM (flat) surveillance lists into one
 * symbol -> stage map. Values follow `securities.surveillance`'s convention:
 * null | ASM_ST | ASM_LT1 | GSM_1..6 | ESM. GSM wins over ASM when a symbol appears in both — it
 * is the stricter regime. */
export function mergeSurveillanceLists(lists: {
  asm: unknown;
  gsm: unknown;
}): Map<string, string> {
  const bySymbol = new Map<string, string>();

  // ASM's stage lives in `asmSurvIndicator` as a roman numeral ("Stage I"/"Stage II"); tenure
  // (long/short term) comes from the bucket key, falling back to `survDesc` when unbucketed.
  for (const { bucket, row } of extractAsmRows(lists.asm)) {
    const symbol = row.symbol || row.Symbol;
    if (!symbol) continue;
    const desc = `${row.survDesc ?? ""} ${row.survCode ?? ""}`.toUpperCase();
    const isLongTerm =
      bucket === "longterm" ||
      desc.includes("LONG TERM") ||
      desc.includes("LTASM");
    const stageNum = romanOrArabicToNumber(row.asmSurvIndicator ?? "") ?? 1;
    bySymbol.set(symbol, isLongTerm ? `ASM_LT${stageNum}` : "ASM_ST");
  }

  // GSM is a flat array. The stage number is stated in `survDesc` ("... GSM stage 0"); NSE's
  // `gsmStage` field is a roman-numeral internal sequence code (e.g. "LXII" = 62), NOT the 0-6
  // stage, so reading it as the stage is wrong — hence survDesc first.
  for (const row of extractSurveillanceRows(lists.gsm)) {
    const symbol = row.symbol || row.Symbol;
    if (!symbol) continue;
    const stageNum =
      String(row.survDesc ?? "").match(/GSM\s*stage\s*(\d+)/i)?.[1] ??
      String(row.survCode ?? "").match(/GSM\s*(\d+)/i)?.[1] ??
      String(row.stage ?? row.category ?? "").match(/\d+/)?.[0];
    bySymbol.set(symbol, stageNum ? `GSM_${stageNum}` : "GSM_1");
  }

  return bySymbol;
}
