// Shared stat-key vocabulary, used by both the Tesseract parser and any
// vision-side post-processing so engines agree on keys. Order matters:
// more specific patterns are tested before broader ones — Magic ATT before
// ATT, and IED ("Ignore Enemy DEF") before DEF, since the IED label contains
// the word "DEF".

/** Normalize a raw stat label to a stable key, or "UNKNOWN" if unrecognized. */
export function normalizeStatKey(label: string): string {
  const l = label.toLowerCase();
  if (/all\s*stat/.test(l)) return "ALL_STAT";
  if (/\bstr\b|strength/.test(l)) return "STR";
  if (/\bdex\b|dexterity/.test(l)) return "DEX";
  if (/\bint\b|intelligence/.test(l)) return "INT";
  if (/\bluk\b|luck/.test(l)) return "LUK";
  if (/magic\s*att|\bmatt\b|m\.?\s*att/.test(l)) return "MATT";
  if (/a[lt]tack\s*power|weapon\s*att|\batt\b|attack/.test(l)) return "ATT";
  if (/ignore|\bied\b/.test(l)) return "IED";
  if (/defen[sc]e|\bdef\b/.test(l)) return "DEF";
  if (/boss/.test(l)) return "BOSS_DMG";
  if (/crit.*dmg|critical\s*damage/.test(l)) return "CRIT_DMG";
  if (/crit/.test(l)) return "CRIT_RATE";
  // Require "max" so utility lines like "HP Recovery Items and Skills
  // Efficiency" or "MP Cost" are NOT mis-keyed as the raw HP/MP stat.
  if (/max\s*hp/.test(l)) return "MAX_HP";
  if (/max\s*mp/.test(l)) return "MAX_MP";
  if (/damage|dmg/.test(l)) return "DMG";
  return "UNKNOWN";
}
