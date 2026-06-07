import { readFile } from "node:fs/promises";

/** A set of public ATS boards to ingest (design doc §9.2/§9.3). */
export interface BoardConfig {
  greenhouse: string[]; // board tokens
  lever: string[]; // company slugs
}

const EMPTY: BoardConfig = { greenhouse: [], lever: [] };

/**
 * Load board tokens from a JSON file (INGEST_BOARDS_FILE), shaped like
 * packages/db/seed/board_tokens.example.json. Returns an empty config if unset.
 */
export async function loadBoardConfig(file?: string): Promise<BoardConfig> {
  const path = file ?? process.env.INGEST_BOARDS_FILE;
  if (!path) return EMPTY;
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<BoardConfig>;
  return {
    greenhouse: Array.isArray(parsed.greenhouse) ? parsed.greenhouse : [],
    lever: Array.isArray(parsed.lever) ? parsed.lever : [],
  };
}

export function countBoards(config: BoardConfig): number {
  return config.greenhouse.length + config.lever.length;
}
