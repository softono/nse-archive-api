import { describe, test, expect } from "vitest";
import { extractAsmRows, extractSurveillanceRows, romanOrArabicToNumber } from "@/parse/surveillance";

// Fixtures are trimmed verbatim from real archived ASM/GSM payloads. The shapes differ between
// the two endpoints, which is exactly what a naive implementation gets wrong: ASM is bucketed by
// tenure, GSM is a flat array. Ported from admin_backend's surveillance-parse.test.ts (2026-08)
// when this parsing logic moved here.
const ASM_PAYLOAD = {
  longterm: {
    data: [
      {
        asmSurvIndicator: "Stage I",
        symbol: "21STCENMGM",
        survCode: "LTASM - I (13)",
        survDesc: "Long Term Additional Surveillance Measure (LTASM) - Stage I",
      },
      {
        asmSurvIndicator: "Stage II",
        symbol: "A2ZINFRA",
        survCode: "LTASM - II (14)",
        survDesc: "Long Term Additional Surveillance Measure (LTASM) - Stage II",
      },
    ],
  },
  shortterm: {
    data: [
      {
        asmSurvIndicator: "Stage I",
        symbol: "SOMESTASM",
        survCode: "STASM - I (20)",
        survDesc: "Short Term Additional Surveillance Measure (STASM) - Stage I",
      },
    ],
  },
};

const GSM_PAYLOAD = [
  {
    symbol: "AGSTRA",
    gsmStage: "LXII",
    survCode: "IBC - Receipt & GSM 0 (62)",
    survDesc:
      "Insolvency and Bankruptcy Code (IBC) - Receipt of Disclosure or Recommenced scrip and GSM stage 0",
  },
  {
    symbol: "ANKITMETAL",
    gsmStage: "IV",
    survCode: "GSM 4 (4)",
    survDesc: "Graded Surveillance Measure - GSM stage 4",
  },
];

describe("ASM payload extraction (§14.3)", () => {
  test("reads the nested longterm/shortterm buckets rather than dropping every row", () => {
    const rows = extractAsmRows(ASM_PAYLOAD);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.row.symbol)).toEqual(["21STCENMGM", "A2ZINFRA", "SOMESTASM"]);
  });

  test("preserves which tenure bucket each row came from", () => {
    const rows = extractAsmRows(ASM_PAYLOAD);
    expect(rows.find((r) => r.row.symbol === "A2ZINFRA")?.bucket).toBe("longterm");
    expect(rows.find((r) => r.row.symbol === "SOMESTASM")?.bucket).toBe("shortterm");
  });

  test("still parses a flat array, so an API shape change degrades rather than breaks", () => {
    const rows = extractAsmRows([{ symbol: "FLAT", asmSurvIndicator: "Stage I" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].row.symbol).toBe("FLAT");
  });

  test("returns empty for an unrecognised payload instead of throwing", () => {
    expect(extractAsmRows(null)).toEqual([]);
    expect(extractAsmRows("nonsense")).toEqual([]);
  });
});

describe("GSM payload extraction", () => {
  test("reads the flat array shape", () => {
    expect(extractSurveillanceRows(GSM_PAYLOAD)).toHaveLength(2);
  });
});

describe("romanOrArabicToNumber", () => {
  test.each([
    ["Stage I", 1],
    ["Stage II", 2],
    ["Stage 3", 3],
    ["IV", 4],
    ["LXII", 62],
  ])("parses %s -> %i", (input, expected) => {
    expect(romanOrArabicToNumber(input)).toBe(expected);
  });

  test("returns null when there is nothing numeric to read", () => {
    expect(romanOrArabicToNumber("")).toBeNull();
    expect(romanOrArabicToNumber("Stage")).toBeNull();
  });
});

describe("GSM stage resolution", () => {
  // survDesc carries the real 0-6 stage; `gsmStage` is an internal sequence code ("LXII" = 62)
  // and must NOT be read as the stage.
  function gsmStageFor(row: Record<string, string>): string {
    const stageNum =
      String(row.survDesc ?? "").match(/GSM\s*stage\s*(\d+)/i)?.[1] ??
      String(row.survCode ?? "").match(/GSM\s*(\d+)/i)?.[1] ??
      String(row.stage ?? row.category ?? "").match(/\d+/)?.[0];
    return stageNum ? `GSM_${stageNum}` : "GSM_1";
  }

  test("reads the stage from survDesc, not the roman sequence code", () => {
    expect(gsmStageFor(GSM_PAYLOAD[0])).toBe("GSM_0");
    expect(gsmStageFor(GSM_PAYLOAD[1])).toBe("GSM_4");
  });

  test("does not collapse every row to GSM_1", () => {
    const stages = GSM_PAYLOAD.map(gsmStageFor);
    expect(new Set(stages).size).toBeGreaterThan(1);
  });
});
