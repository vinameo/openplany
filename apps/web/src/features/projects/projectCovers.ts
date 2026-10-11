import {
  DEFAULT_PROJECT_COVER,
  isProjectCoverKey,
  PROJECT_COVER_KEYS,
  type ProjectCoverKey,
} from "@repo/contracts";
import cover01 from "./covers/cover-01.webp";
import cover01Thumb from "./covers/cover-01-thumb.webp";
import cover02 from "./covers/cover-02.webp";
import cover02Thumb from "./covers/cover-02-thumb.webp";
import cover03 from "./covers/cover-03.webp";
import cover03Thumb from "./covers/cover-03-thumb.webp";
import cover04 from "./covers/cover-04.webp";
import cover04Thumb from "./covers/cover-04-thumb.webp";
import cover05 from "./covers/cover-05.webp";
import cover05Thumb from "./covers/cover-05-thumb.webp";
import cover06 from "./covers/cover-06.webp";
import cover06Thumb from "./covers/cover-06-thumb.webp";
import cover07 from "./covers/cover-07.webp";
import cover07Thumb from "./covers/cover-07-thumb.webp";
import cover08 from "./covers/cover-08.webp";
import cover08Thumb from "./covers/cover-08-thumb.webp";

export interface ProjectCoverEntry {
  full: string;
  thumb: string;
  label: string;
}

export const PROJECT_COVERS = {
  "cover-01": { full: cover01, thumb: cover01Thumb, label: "Cover 1" },
  "cover-02": { full: cover02, thumb: cover02Thumb, label: "Cover 2" },
  "cover-03": { full: cover03, thumb: cover03Thumb, label: "Cover 3" },
  "cover-04": { full: cover04, thumb: cover04Thumb, label: "Cover 4" },
  "cover-05": { full: cover05, thumb: cover05Thumb, label: "Cover 5" },
  "cover-06": { full: cover06, thumb: cover06Thumb, label: "Cover 6" },
  "cover-07": { full: cover07, thumb: cover07Thumb, label: "Cover 7" },
  "cover-08": { full: cover08, thumb: cover08Thumb, label: "Cover 8" },
} as const satisfies Record<ProjectCoverKey, ProjectCoverEntry>;

export function projectCover(key: string): ProjectCoverEntry {
  if (isProjectCoverKey(key)) {
    return PROJECT_COVERS[key];
  }
  return PROJECT_COVERS[DEFAULT_PROJECT_COVER];
}

export function pickRandomCover(
  random: () => number = Math.random,
): ProjectCoverKey {
  const r = Math.max(0, Math.min(0.999999, random()));
  const index = Math.floor(r * PROJECT_COVER_KEYS.length);
  return PROJECT_COVER_KEYS[index] ?? DEFAULT_PROJECT_COVER;
}
