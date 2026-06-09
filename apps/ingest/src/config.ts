import { readFile } from "node:fs/promises";

/** A set of public ATS boards to ingest (design doc §9.1–§9.3). */
export interface BoardConfig {
  greenhouse: string[]; // board tokens
  lever: string[]; // company slugs
  ashby: string[]; // job-board org slugs
  /** Search queries for Apify-backed, bot-protected boards (optional). */
  wellfound?: string[];
  remotefront?: string[];
}

const EMPTY: BoardConfig = { greenhouse: [], lever: [], ashby: [] };

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
    ashby: Array.isArray(parsed.ashby) ? parsed.ashby : [],
    wellfound: Array.isArray(parsed.wellfound) ? parsed.wellfound : undefined,
    remotefront: Array.isArray(parsed.remotefront) ? parsed.remotefront : undefined,
  };
}

export function countBoards(config: BoardConfig): number {
  return config.greenhouse.length + config.lever.length + config.ashby.length;
}
