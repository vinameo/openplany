import { useEffect, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import {
  RESERVED_WORKSPACE_SLUGS,
  workspaceSlugProblem,
} from "@repo/contracts";
import { workspaceApi } from "../api/workspaceApi";

export type SlugStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; reason: "RESERVED" | "TAKEN" }
  | { kind: "unknown" };

export function useSlugAvailability(slug: string) {
  const [debouncedSlug] = useDebouncedValue(slug, 300);
  const [cache, setCache] = useState<Record<string, SlugStatus>>({});

  const markTaken = (takenSlug: string) => {
    setCache((prev) => ({
      ...prev,
      [takenSlug]: { kind: "unavailable", reason: "TAKEN" },
    }));
  };

  // Immediate sync evaluation for client-side checks
  const problem = workspaceSlugProblem(slug);
  const isReserved = RESERVED_WORKSPACE_SLUGS.has(slug);

  let status: SlugStatus;
  if (!slug || problem === "INVALID") {
    status = { kind: "idle" };
  } else if (isReserved) {
    status = { kind: "unavailable", reason: "RESERVED" };
  } else if (cache[slug]) {
    status = cache[slug]!;
  } else {
    status = { kind: "checking" };
  }

  useEffect(() => {
    if (!slug || problem === "INVALID" || isReserved) {
      return;
    }

    if (cache[slug]) {
      return;
    }

    if (slug !== debouncedSlug) {
      return;
    }

    const controller = new AbortController();

    workspaceApi
      .checkSlug(debouncedSlug, controller.signal)
      .then((res) => {
        let newStatus: SlugStatus;
        if (res.available) {
          newStatus = { kind: "available" };
        } else if (res.reason === "RESERVED") {
          newStatus = { kind: "unavailable", reason: "RESERVED" };
        } else {
          newStatus = { kind: "unavailable", reason: "TAKEN" };
        }
        setCache((prev) => ({ ...prev, [debouncedSlug]: newStatus }));
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setCache((prev) => ({ ...prev, [debouncedSlug]: { kind: "unknown" } }));
      });

    return () => {
      controller.abort();
    };
  }, [slug, debouncedSlug, problem, isReserved, cache]);

  return { status, markTaken };
}
