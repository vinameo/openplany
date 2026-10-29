import type { Level } from "./level.js";
import type { StateColor } from "./state.js";

export const PRIORITY_BANDS = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
] as const;
export type PriorityBand = (typeof PRIORITY_BANDS)[number];

export const DEFAULT_PRIORITY_KEYS = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
] as const;
export type DefaultPriorityKey = (typeof DEFAULT_PRIORITY_KEYS)[number];

export const INITIAL_PRIORITY_KEY: DefaultPriorityKey = "none";

// D31: single source of default bands and colors; migration inserts exactly these values
export const DEFAULT_PRIORITIES = [
  { key: "urgent", band: "urgent", color: "#B05A5A" },
  { key: "high", band: "high", color: "#D0642B" },
  { key: "medium", band: "medium", color: "#E08A1E" },
  { key: "low", band: "low", color: "#3E7BD6" },
  { key: "none", band: "none", color: "#8E98A8" },
] as const satisfies readonly {
  key: DefaultPriorityKey;
  band: PriorityBand;
  color: StateColor;
}[];

export const PRIORITY_ERROR_CODES = {
  UNAVAILABLE: "PRIORITY_UNAVAILABLE",
} as const;

export interface PriorityResponse {
  id: string;
  name: string;
  band: PriorityBand;
  color: string;
  level: Level;
  defaultKey: DefaultPriorityKey | null;
}

export interface PriorityListResponse {
  priorities: PriorityResponse[];
  initialPriorityId: string;
}
