import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceMemberListResponse } from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import { useAuth } from "../../../auth/useAuth";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { membersApi } from "./api/membersApi";

export type MembersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: WorkspaceMemberListResponse };

export function useWorkspaceMembers(slug: string): {
  state: MembersState;
  reload: () => Promise<void>;
} {
  const { reload: reloadWorkspace } = useCurrentWorkspace();
  const { expireSession } = useAuth();
  const [state, setState] = useState<MembersState>({ status: "loading" });
  const [prevSlug, setPrevSlug] = useState(slug);
  const activeControllerRef = useRef<AbortController | null>(null);

  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setState({ status: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    activeControllerRef.current = controller;

    membersApi.list(slug, controller.signal).then(
      (data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
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
            void reloadWorkspace();
            return;
          }
        }
        const message =
          err instanceof Error ? err.message : "Couldn't load members.";
        setState({ status: "error", message });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [expireSession, reloadWorkspace, slug]);

  const reload = useCallback(async () => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    try {
      const data = await membersApi.list(slug, controller.signal);
      setState({ status: "ready", data });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      if (err instanceof ApiRequestError) {
        if (err.status === 401) {
          expireSession();
          return;
        }
        if (err.status === 403) {
          await reloadWorkspace();
          return;
        }
      }
      const message =
        err instanceof Error ? err.message : "Couldn't load members.";
      setState({ status: "error", message });
    }
  }, [expireSession, reloadWorkspace, slug]);

  return { state, reload };
}

