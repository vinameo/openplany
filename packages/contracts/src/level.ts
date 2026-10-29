export const LEVELS = ["default", "workspace", "project"] as const;
export type Level = (typeof LEVELS)[number];
