import type { EquipmentData, StatLine } from "../shared/types";

/**
 * Best-effort parser that turns raw OCR text (e.g. from Tesseract) into
 * structured EquipmentData. The vision-LLM engine returns structured JSON
 * directly and does not need this; classic OCR returns a flat string, so we
 * apply heuristics tuned for MapleStory equipment tooltips.
 *
 * This is intentionally forgiving: anything it can't classify is still kept as
 * a raw stat line so no information is silently dropped.
 */

const TIER_RE = /\b(Legendary|Unique|Epic|Rare)\b/i;

/** Maps a raw stat label to a normalized key, or "UNKNOWN" if unrecognized. */
function normalizeStatKey(label: string): string {
  const l = label.toLowerCase();
  if (/all\s*stat/.test(l)) return "ALL_STAT";
  if (/\bstr\b|strength/.test(l)) return "STR";
  if (/\bdex\b|dexterity/.test(l)) return "DEX";
  if (/\bint\b|intelligence/.test(l)) return "INT";
  if (/\bluk\b|luck/.test(l)) return "LUK";
  if (/magic\s*att|matt|m\.att|magic attack/.test(l)) return "MATT";
  if (/\batt\b|attack power|weapon att|attack/.test(l)) return "ATT";
  if (/boss/.test(l)) return "BOSS_DMG";
  if (/ignore|defense ignore|ied/.test(l)) return "IED";
  if (/crit.*dmg|critical damage/.test(l)) return "CRIT_DMG";
  if (/crit/.test(l)) return "CRIT_RATE";
  if (/damage|dmg/.test(l)) return "DMG";
  if (/max\s*hp|\bhp\b/.test(l)) return "HP";
  if (/max\s*mp|\bmp\b/.test(l)) return "MP";
  return "UNKNOWN";
}

/** Pulls "+33", "9%", "+12%" style values out of a line. */
function extractValue(line: string): string | null {
  const m = line.match(/([+-]?\s*\d[\d,]*\s*%?)/);
  if (!m) return null;
  return m[1].replace(/\s+/g, "");
}

export function parseTooltipText(text: string): EquipmentData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Item name: first line with at least one letter that isn't purely a stat line.
  const name =
    lines.find((l) => /[A-Za-z]/.test(l) && !/^[+-]?\d/.test(l)) ??
    "Unknown item";

  // Star-force: count ★ glyphs, else fall back to "N Stars".
  let starforce: number | undefined;
  const starLine = lines.find((l) => /★/.test(l));
  if (starLine) {
    starforce = (starLine.match(/★/g) ?? []).length;
  } else {
    const m = text.match(/(\d+)\s*stars?/i);
    if (m) starforce = parseInt(m[1], 10);
  }

  const tierMatch = text.match(TIER_RE);
  const potentialTier = tierMatch
    ? tierMatch[1][0].toUpperCase() + tierMatch[1].slice(1).toLowerCase()
    : undefined;

  // Stat lines: anything containing a numeric "+N" / "N%" value, excluding the
  // name line we already consumed.
  const stats: StatLine[] = [];
  for (const line of lines) {
    if (line === name) continue;
    if (!/[+%]|\d/.test(line)) continue;
    const value = extractValue(line);
    if (!value) continue;
    // Label is the text before the value.
    const label = line.replace(/([+-]?\s*\d[\d,]*\s*%?).*/, "").trim() || line;
    stats.push({ key: normalizeStatKey(label), value, raw: line });
  }

  return {
    name,
    starforce,
    potentialTier,
    stats,
    // Classic OCR has no calibrated confidence; signal "unknown" with undefined.
    confidence: undefined,
  };
}
