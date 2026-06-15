import type {
  EquipmentData,
  StatLine,
  PotentialLine,
} from "../shared/types";
import { normalizeStatKey } from "./normalize";

const TIER_RE = /\b(Legendary|Unique|Epic|Rare)\b/i;
const NOISE_RE =
  /combat power|currently equipped|item description|interact|harvest|^untradable$/i;
const LEVEL_RE = /required\s*level\s*l[vy]\.?\s*(\d+)/i;
const JOB_RE = /required\s*job\s*([A-Za-z ]+)/i;
const SET_RE = /([A-Za-z][A-Za-z ]*\bset\b[^\n]*)/i;
const STARS_RE = /(\d+)\s*stars?\b/i;
const POT_MARKER_RE = /^\s*[=•·*\-]\s+/;

/** A line that is mostly uppercase letters with no lowercase/digits is almost
 *  certainly the star-force glyph row OCR'd as letters (e.g. "KAREE AAARE"). */
function looksLikeStarRow(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  if (/\d/.test(line)) return false;
  return !/[a-z]/.test(letters); // all-caps glyph soup
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** True for OCR gibberish with very few distinct letters — e.g. the star row
 *  read as letters ("KAREE AAARE" or, after preprocessing, "Ahhh h Ahhh h").
 *  Real item names have letter variety. */
function looksLikeGibberish(line: string): boolean {
  const letters = line.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length < 8) return false;
  return new Set(letters).size <= 4;
}

/** Positional breakdown from the parenthetical, e.g. "(15 +52 +79)".
 *  Order is base, star force, flame (color is unavailable to plain OCR). */
function parseParenBreakdown(line: string): {
  base?: number;
  starForce?: number;
  flame?: number;
} {
  const paren = line.match(/\(([^)]*)\)/);
  if (!paren) return {};
  const nums = (paren[1].match(/[+-]?\d[\d,]*/g) ?? [])
    .map((n) => parseInt(n.replace(/,/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const out: { base?: number; starForce?: number; flame?: number } = {};
  if (nums[0] != null) out.base = nums[0];
  if (nums[1] != null) out.starForce = nums[1];
  if (nums[2] != null) out.flame = nums[2];
  return out;
}

/** Strip OCR bullet/colon markers from a potential line for clean display. */
function cleanPotentialText(line: string): string {
  return line
    .replace(POT_MARKER_RE, "")
    .replace(/^[\s=:•·*-]+/, "")
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse the leading number after a stat label, e.g. "+5% (0% +5%)" -> {5,true}. */
function parseLeadingValue(
  rest: string,
): { total: number; isPercent: boolean } | null {
  const m = rest.match(/([+-]?\d[\d,]*)\s*(%?)/);
  if (!m) return null;
  const total = parseInt(m[1].replace(/,/g, ""), 10);
  if (Number.isNaN(total)) return null;
  return { total, isPercent: m[2] === "%" };
}

export function parseTooltipText(text: string): EquipmentData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let requiredLevel: number | undefined;
  let requiredJob: string | undefined;
  let set: string | undefined;
  let tradable: boolean | undefined;
  let starForce: number | undefined;

  // Metadata pre-scan.
  for (const line of lines) {
    if (/untradable/i.test(line)) tradable = false;
    const lvl = line.match(LEVEL_RE);
    if (lvl) requiredLevel = parseInt(lvl[1], 10);
    const job = line.match(JOB_RE);
    if (job && !requiredJob) requiredJob = job[1].trim();
    if (!set && /\bset\b/i.test(line) && !/set\s*effect\s*$/i.test(line)) {
      const sm = line.match(SET_RE);
      if (sm) set = sm[1].trim();
    }
    const sf = line.match(STARS_RE);
    if (sf && !starForce) starForce = parseInt(sf[1], 10);
  }

  // Potential tier (only when "potential" context exists).
  let tier: string | undefined;
  if (/potential/i.test(text)) {
    const tm = text.match(TIER_RE);
    if (tm) tier = cap(tm[1]);
  }

  // Name: first line that is not the star row, noise, metadata, a marker, or a stat.
  const name =
    lines.find(
      (l) =>
        /[A-Za-z]/.test(l) &&
        !looksLikeStarRow(l) &&
        !looksLikeGibberish(l) &&
        !NOISE_RE.test(l) &&
        !LEVEL_RE.test(l) &&
        !/required|untradable|set\s*effect|potential/i.test(l) &&
        !POT_MARKER_RE.test(l) &&
        !/[+\-]\s*\d/.test(l),
    ) ?? "Unknown item";

  const stats: StatLine[] = [];
  const potentialLines: PotentialLine[] = [];
  let inPotential = false;

  for (const line of lines) {
    if (/potential/i.test(line)) {
      inPotential = true;
      continue; // the "Potential : Legendary" header itself isn't a line
    }
    if (line === name) continue;
    if (looksLikeStarRow(line)) continue;
    if (NOISE_RE.test(line)) continue;
    if (LEVEL_RE.test(line) || JOB_RE.test(line) || /set\s*effect/i.test(line)) {
      continue;
    }

    const isPotential = inPotential || POT_MARKER_RE.test(line);
    const clean = line.replace(POT_MARKER_RE, "");
    const valIdx = clean.search(/[+\-]?\s*\d/);

    if (valIdx < 0) {
      continue; // no number -> not a real stat/potential line (drops "= = Cape")
    }

    const label = clean.slice(0, valIdx).replace(/[:：]/g, "").trim();
    const rest = clean.slice(valIdx);
    const parsed = parseLeadingValue(rest);

    if (!parsed) {
      if (isPotential) potentialLines.push({ raw: line });
      continue;
    }

    if (isPotential) {
      potentialLines.push({
        raw: cleanPotentialText(line),
        key: label ? normalizeStatKey(label) : undefined,
        value: rest.replace(/\s+/g, "").replace(/\(.*$/, "") || undefined,
      });
    } else {
      stats.push({
        key: normalizeStatKey(label || line),
        isPercent: parsed.isPercent,
        breakdown: { total: parsed.total, ...parseParenBreakdown(line) },
        raw: line,
      });
    }
  }

  return {
    name,
    requiredLevel,
    requiredJob,
    set,
    tradable,
    starForce,
    stats,
    potential: { tier, lines: potentialLines },
    confidence: undefined,
  };
}
