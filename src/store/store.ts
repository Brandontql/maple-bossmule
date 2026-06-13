import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Character,
  EquipmentEntry,
  TrackerState,
} from "../shared/types";

/**
 * Simple JSON-file-backed store. Good enough for Phase 1; swap for SQLite later
 * if history/querying grows. All writes go through save() so the file stays
 * consistent.
 */
export class Store {
  private state: TrackerState = { characters: [] };
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw) as TrackerState;
      if (!Array.isArray(this.state.characters)) {
        this.state = { characters: [] };
      }
    } catch (err: unknown) {
      // Missing file on first run is expected; anything else we surface.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      this.state = { characters: [] };
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  async getCharacters(): Promise<Character[]> {
    await this.ensureLoaded();
    return this.state.characters;
  }

  async addCharacter(name: string, job?: string): Promise<Character> {
    await this.ensureLoaded();
    const character: Character = {
      id: randomUUID(),
      name,
      job,
      equipment: [],
    };
    this.state.characters.push(character);
    await this.save();
    return character;
  }

  async addEquipment(
    characterId: string,
    entry: EquipmentEntry,
  ): Promise<Character> {
    await this.ensureLoaded();
    const character = this.state.characters.find((c) => c.id === characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    // Replace any existing entry for the same slot (latest wins); a real
    // history view can be added later by keeping prior entries.
    character.equipment = character.equipment.filter(
      (e) => e.slot !== entry.slot,
    );
    character.equipment.push(entry);
    await this.save();
    return character;
  }
}
