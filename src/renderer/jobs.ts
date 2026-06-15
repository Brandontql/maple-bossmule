import type { Character } from "../shared/types";

type Primary = "STR" | "DEX" | "INT" | "LUK";

// Order: INT, STR, DEX, LUK. Patterns are case-insensitive keyword matches.
const JOB_STAT: ReadonlyArray<readonly [RegExp, Primary]> = [
  [/magician|mage|wizard|bishop|arch ?mage|fire|poison|ice|lightning|evan|luminous|battle ?mage|kanna|illium|kinesis|lara|beast ?tamer/, "INT"],
  [/warrior|hero|paladin|dark ?knight|dawn ?warrior|aran|kaiser|hayato|blaster|demon ?slayer|demon ?avenger|mihile|zero|adele/, "STR"],
  [/archer|bowman|hunter|ranger|marksman|sniper|pathfinder|wind ?archer|mercedes|wild ?hunter|kain/, "DEX"],
  [/thief|rogue|assassin|bandit|night ?lord|shadower|dual ?blade|night ?walker|phantom|cadena|hoyoung/, "LUK"],
];

/** Infer a character's primary stat from its job text, or undefined if unknown. */
export function jobToMainStat(job: string | undefined): Primary | undefined {
  if (!job) return undefined;
  const j = job.toLowerCase();
  for (const [re, stat] of JOB_STAT) if (re.test(j)) return stat;
  return undefined;
}

/** The stat a character is built around: explicit override, else inferred from
 *  the job, else undefined (unknown class). */
export function effectiveMainStat(c: Character): string | undefined {
  return c.mainStat ?? jobToMainStat(c.job);
}
