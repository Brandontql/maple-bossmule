import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { EquipmentData } from "../shared/types";
import type { OcrEngine, OcrInput } from "./types";

// Schema the model must fill. Structured outputs guarantee the response parses
// to this shape, so we get validated JSON instead of free-form text to scrape.
// Optional fields are modeled as nullable (the model always emits the key).
const EquipmentSchema = z.object({
  name: z.string().describe("The item name exactly as shown."),
  category: z.string().nullable().describe("Item category, e.g. Cape, or null."),
  requiredJob: z.string().nullable().describe("Required job, e.g. Magician, or null."),
  requiredLevel: z.number().nullable().describe("Required level, e.g. 160, or null."),
  set: z.string().nullable().describe("Set name, e.g. 'AbsoLab Set (Magician)', or null."),
  tradable: z.boolean().nullable().describe("false if 'Untradable' is shown, else null."),
  starForce: z.number().nullable().describe("Lit star-force count, or null."),
  stats: z
    .array(
      z.object({
        key: z.string().describe("Normalized key: STR, DEX, INT, LUK, ALL_STAT, MAX_HP, MAX_MP, ATT, MATT, DEF, BOSS_DMG, IED, CRIT_DMG, DMG; UNKNOWN if unclear."),
        isPercent: z.boolean().describe("true for percent lines like 'All Stats +5%'."),
        breakdown: z.object({
          total: z.number().describe("The headline total, e.g. 146."),
          base: z.number().nullable().describe("White component (base), or null."),
          flame: z.number().nullable().describe("TURQUOISE component (flame/bonus stat), or null."),
          starforce: z.number().nullable().describe("Gold component (star force), or null."),
        }),
        raw: z.string().describe("The full raw stat line."),
      }),
    )
    .describe("Base stat lines only — NOT potential lines."),
  potential: z.object({
    tier: z.string().nullable().describe("Legendary / Unique / Epic / Rare, or null."),
    lines: z
      .array(
        z.object({
          raw: z.string().describe("Full raw potential line, e.g. 'INT +13%'."),
          key: z.string().nullable().describe("Normalized key if recognizable, else null."),
          value: z.string().nullable().describe("Value as shown, e.g. '+13%', or null."),
        }),
      )
      .describe("Potential lines, kept separate from base stats."),
  }),
  confidence: z.number().nullable().describe("Your confidence 0..1."),
});

const SYSTEM_PROMPT = `You read MapleStory equipment tooltips from a screenshot and return structured data.
- Transcribe the item name exactly. Read category, required job, required level, and set name if shown. Set tradable=false only if "Untradable" appears.
- Read the lit star-force count (the row of stars above the name) into starForce.
- Each stat line shows a total and a parenthetical breakdown decomposed BY COLOR, not position:
  - WHITE number = base
  - TURQUOISE / cyan number = flame (bonus stat)
  - GOLD / yellow number = star force
  Attribute each component by its color. A line may have only some components (e.g. "INT +107 (15 +92)").
- Normalize each stat key (STR, DEX, INT, LUK, ALL_STAT, MAX_HP, MAX_MP, ATT, MATT, DEF, BOSS_DMG, IED, CRIT_DMG, DMG; UNKNOWN if unclear). Set isPercent true for % lines.
- Put POTENTIAL lines (the colored lines under the Potential heading) into potential.lines, NEVER into stats. Read the potential tier.
- Numbers matter: do not guess. If a digit is ambiguous, prefer what is most visually supported and lower your confidence.`;

const MIME_PATTERN = /^image\/(png|jpeg|gif|webp)$/;

/**
 * Vision-LLM OCR via Claude. Sends the (cropped) tooltip image and gets back
 * validated structured data — far more reliable on game fonts than classic OCR.
 * Requires ANTHROPIC_API_KEY in the environment.
 */
export class VisionLlmEngine implements OcrEngine {
  readonly id = "vision-llm";
  readonly label = "Vision LLM (Claude — most accurate)";

  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to the environment to use the vision engine.",
      );
    }
    if (!this.client) {
      this.client = new Anthropic();
    }
    return this.client;
  }

  async extract(input: OcrInput): Promise<EquipmentData> {
    const client = this.getClient();
    const mediaType = MIME_PATTERN.test(input.mimeType ?? "")
      ? (input.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp")
      : "image/png";

    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: input.image.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Read this equipment tooltip and return the structured data.",
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(EquipmentSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        `Vision engine returned no structured output (stop reason: ${response.stop_reason}).`,
      );
    }

    // Map nullable schema fields onto the optional shared type.
    return {
      name: parsed.name,
      category: parsed.category ?? undefined,
      requiredJob: parsed.requiredJob ?? undefined,
      requiredLevel: parsed.requiredLevel ?? undefined,
      set: parsed.set ?? undefined,
      tradable: parsed.tradable ?? undefined,
      starForce: parsed.starForce ?? undefined,
      stats: parsed.stats.map((s) => ({
        key: s.key,
        isPercent: s.isPercent,
        breakdown: {
          total: s.breakdown.total,
          base: s.breakdown.base ?? undefined,
          flame: s.breakdown.flame ?? undefined,
          starforce: s.breakdown.starforce ?? undefined,
        },
        raw: s.raw,
      })),
      potential: {
        tier: parsed.potential.tier ?? undefined,
        lines: parsed.potential.lines.map((p) => ({
          raw: p.raw,
          key: p.key ?? undefined,
          value: p.value ?? undefined,
        })),
      },
      confidence: parsed.confidence ?? undefined,
    };
  }
}
