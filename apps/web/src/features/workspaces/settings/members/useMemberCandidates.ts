import { useEffect, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import {
  MEMBER_CANDIDATE_QUERY_MIN,
  type MemberCandidate,
} from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import { membersApi } from "./api/membersApi";

export type MemberCandidateState =
  | { status: "too_short" }
  | { status: "loading" }
  | { status: "ready"; candidates: MemberCandidate[] }
  | { status: "error"; message?: string; retryAfterSeconds?: number | null };

export function useMemberCandidates(
  slug: string,
  query: string,
): MemberCandidateState {
  const trimmed = query.trim();
  const [debouncedQuery] = useDebouncedValue(trimmed, 250);
  const [asyncState, setAsyncState] = useState<{
    query: string;
    slug: string;
    state: MemberCandidateState;
  }>({
    query: "",
    slug: "",
    state: { status: "too_short" },
  });

  useEffect(() => {
    if (debouncedQuery.length < MEMBER_CANDIDATE_QUERY_MIN) {
      return;
    }

    const controller = new AbortController();

    membersApi
      .searchCandidates(slug, debouncedQuery, controller.signal)
      .then((res) => {
        setAsyncState({
          query: debouncedQuery,
          slug,
          state: { status: "ready", candidates: res.candidates },
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiRequestError && err.status === 429) {
          setAsyncState({
            query: debouncedQuery,
            slug,
            state: {
              status: "error",
              retryAfterSeconds: err.retryAfterSeconds ?? 60,
            },
          });
          return;
        }
        setAsyncState({
          query: debouncedQuery,
          slug,
          state: { status: "error" },
        });
      });

    return () => {
      controller.abort();
    };
  }, [slug, debouncedQuery]);

  if (trimmed.length < MEMBER_CANDIDATE_QUERY_MIN) {
    return { status: "too_short" };
  }

  if (
    debouncedQuery !== trimmed ||
    asyncState.query !== debouncedQuery ||
    asyncState.slug !== slug
  ) {
    return { status: "loading" };
  }

  return asyncState.state;
}
