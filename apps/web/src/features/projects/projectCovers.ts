import {
  DEFAULT_PROJECT_COVER,
  isProjectCoverKey,
  PROJECT_COVER_KEYS,
  type MessageKey,
  type ProjectCoverKey,
} from "@repo/contracts";
import { translate } from "../../i18n/language";
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
  labelKey: MessageKey;
  readonly label: string;
}

export const PROJECT_COVERS = {
  "cover-01": {
    full: cover01,
    thumb: cover01Thumb,
    labelKey: "project:covers.cover1",
    get label(): string {
      return translate(this.labelKey);
    },
  },
  "cover-02": {
    full: cover02,
    thumb: cover02Thumb,
    labelKey: "project:covers.cover2",
    get label(): string {
      return translate(this.labelKey);
    },
  },
  "cover-03": {
    full: cover03,
    thumb: cover03Thumb,
    labelKey: "project:covers.cover3",
    get label(): string {
      return translate(this.labelKey);
    },
  },
  "cover-04": {
    full: cover04,
    thumb: cover04Thumb,
    labelKey: "project:covers.cover4",
    get label(): string {
      return translate(this.labelKey);
    },
  },
  "cover-05": {
    full: cover05,
    thumb: cover05Thumb,
    labelKey: "project:covers.cover5",
    get label(): string {
      return translate(this.labelKey);
    },
  },
  "cover-06": {
    full: cover06,
    thumb: cover06Thumb,
    labelKey: "project:covers.cover6",
    get label(): string {
      return translate(this.labelKey);
    },
  },
  "cover-07": {
    full: cover07,
    thumb: cover07Thumb,
    labelKey: "project:covers.cover7",
    get label(): string {
      return translate(this.labelKey);
    },
  },
  "cover-08": {
    full: cover08,
    thumb: cover08Thumb,
    labelKey: "project:covers.cover8",
    get label(): string {
      return translate(this.labelKey);
    },
  },
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
