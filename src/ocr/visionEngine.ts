import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { EquipmentData } from "../shared/types";
import type { OcrEngine, OcrInput } from "./types";

// Schema the model must fill. Structured outputs guarantee the response parses
// to this shape, so we get validated JSON instead of free-form text to scrape.
// Optional fields are modeled as nullable (the model always emits the key).
const EquipmentSchema = z.object({
  name: z.string().describe("The item name exactly as shown in the tooltip."),
  starforce: z
    .number()
    .nullable()
    .describe("Star-force enhancement count, or null if not shown."),
  potentialTier: z
    .string()
    .nullable()
    .describe("Potential tier, e.g. Legendary / Unique / Epic / Rare, or null."),
  stats: z
    .array(
      z.object({
        key: z
          .string()
          .describe("Normalized stat key, e.g. STR, ATT, BOSS_DMG, IED."),
        value: z.string().describe("The value as shown, e.g. +33 or 9%."),
        raw: z.string().describe("The full raw stat line for verification."),
      }),
    )
    .describe("Every stat / potential / bonus line read from the tooltip."),
  confidence: z
    .number()
    .nullable()
    .describe("Your confidence 0..1 that the reading is correct."),
});

const SYSTEM_PROMPT = `You read MapleStory equipment tooltips from a screenshot and return structured data.
- Transcribe the item name exactly.
- Read the star-force count (the row of filled/empty stars above the name) as an integer.
- Identify the potential tier from the colored potential lines (Legendary, Unique, Epic, Rare).
- For every stat line, normalize the key (STR, DEX, INT, LUK, ATT, MATT, BOSS_DMG, IED, CRIT_DMG, DMG, ALL_STAT, HP, MP; use UNKNOWN if unclear) and keep the exact value (e.g. "+33", "9%") and the full raw line.
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
      starforce: parsed.starforce ?? undefined,
      potentialTier: parsed.potentialTier ?? undefined,
      stats: parsed.stats,
      confidence: parsed.confidence ?? undefined,
    };
  }
}
