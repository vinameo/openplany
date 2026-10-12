import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectListItem } from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { useAuth } from "../../auth/useAuth";
import { projectsApi } from "../api/projectsApi";

export type ProjectState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; project: ProjectListItem }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "error"; message: string };

export function useProject(
  slug: string,
  identifier: string | null,
): {
  state: ProjectState;
  retry: () => void;
} {
  const { expireSession } = useAuth();
  const [state, setState] = useState<ProjectState>(() =>
    identifier ? { status: "loading" } : { status: "idle" },
  );
  const [prevKey, setPrevKey] = useState(`${slug}:${identifier ?? ""}`);
  const [retrySeq, setRetrySeq] = useState(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  const key = `${slug}:${identifier ?? ""}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setState(identifier ? { status: "loading" } : { status: "idle" });
  }

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRetrySeq((s) => s + 1);
  }, []);

  useEffect(() => {
    if (!identifier) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    activeControllerRef.current = controller;

    projectsApi.get(slug, identifier, controller.signal).then(
      (res) => {
        if (!cancelled) {
          setState({ status: "ready", project: res.project });
        }
      },
      (err: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        if (err instanceof ApiRequestError) {
          if (err.status === 401) {
            expireSession();
            return;
          }
          if (err.status === 403) {
            setState({ status: "forbidden" });
            return;
          }
          if (err.status === 404) {
            setState({ status: "not_found" });
            return;
          }
        }
        const message =
          err instanceof Error ? err.message : "Couldn't load this project.";
        setState({ status: "error", message });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [expireSession, identifier, retrySeq, slug]);

  return { state, retry };
}
