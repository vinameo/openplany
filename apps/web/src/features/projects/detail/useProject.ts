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
  | { status: "error" };

/** 403/404 end on an error page; 401 ends the session; anything else is retryable. */
type FailedLoad =
  | { kind: "state"; state: ProjectState }
  | { kind: "unauthenticated" }
  | { kind: "retryable" };

function classifyFailure(err: unknown): FailedLoad {
  if (err instanceof ApiRequestError) {
    if (err.status === 401) return { kind: "unauthenticated" };
    if (err.status === 403) {
      return { kind: "state", state: { status: "forbidden" } };
    }
    if (err.status === 404) {
      return { kind: "state", state: { status: "not_found" } };
    }
  }
  return { kind: "retryable" };
}

export interface UseProjectResult {
  state: ProjectState;
  /** Shows the loading state again and refetches (after an error). */
  retry: () => void;
  /**
   * Refetches while the current project stays on screen, e.g. after another
   * page changed it. Rejects on a retryable failure so the caller can report
   * it; the current project is kept.
   */
  reload: () => Promise<void>;
  /** Puts a project returned by a successful write on screen without a refetch. */
  replace: (project: ProjectListItem) => void;
}

export function useProject(
  slug: string,
  identifier: string | null,
): UseProjectResult {
  const { expireSession } = useAuth();
  const [state, setState] = useState<ProjectState>(() =>
    identifier ? { status: "loading" } : { status: "idle" },
  );
  const [prevKey, setPrevKey] = useState(`${slug}:${identifier ?? ""}`);
  const [retrySeq, setRetrySeq] = useState(0);
  const reloadControllerRef = useRef<AbortController | null>(null);
  /** Key of the project on screen; a reload that finishes after it changed is dropped. */
  const currentKeyRef = useRef(`${slug}:${identifier ?? ""}`);

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

    currentKeyRef.current = `${slug}:${identifier}`;
    let cancelled = false;
    const controller = new AbortController();

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
        const failure = classifyFailure(err);
        if (failure.kind === "unauthenticated") {
          expireSession();
        } else if (failure.kind === "state") {
          setState(failure.state);
        } else {
          setState({ status: "error" });
        }
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [expireSession, identifier, retrySeq, slug]);

  const reload = useCallback(async () => {
    if (!identifier) return;
    reloadControllerRef.current?.abort();
    const controller = new AbortController();
    reloadControllerRef.current = controller;
    const requestKey = `${slug}:${identifier}`;
    const isStale = () =>
      controller.signal.aborted || currentKeyRef.current !== requestKey;

    try {
      const res = await projectsApi.get(slug, identifier, controller.signal);
      if (isStale()) return;
      setState({ status: "ready", project: res.project });
    } catch (err: unknown) {
      if (isStale()) return;
      const failure = classifyFailure(err);
      if (failure.kind === "unauthenticated") {
        expireSession();
        return;
      }
      if (failure.kind === "state") {
        setState(failure.state);
        return;
      }
      throw err;
    }
  }, [expireSession, identifier, slug]);

  const replace = useCallback((project: ProjectListItem) => {
    setState({ status: "ready", project });
  }, []);

  return { state, retry, reload, replace };
}
