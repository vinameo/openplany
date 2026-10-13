import {
  MEMBER_CANDIDATE_QUERY_MIN,
  MEMBER_MESSAGES,
  type MemberCandidate,
} from "@repo/contracts";
import {
  useMemberCandidateSearch,
  type MemberCandidateState,
} from "../../../members/useMemberCandidateSearch";
import { membersApi, workspaceMemberKeys } from "./api/membersApi";

export type { MemberCandidateState };

export function useMemberCandidates(
  slug: string,
  query: string,
): MemberCandidateState<MemberCandidate> {
  return useMemberCandidateSearch<MemberCandidate>({
    queryKey: (q) => workspaceMemberKeys.candidates(slug, q),
    fetcher: (q, signal) => membersApi.searchCandidates(slug, q, signal),
    query,
    isReady: (trimmed) => trimmed.length >= MEMBER_CANDIDATE_QUERY_MIN,
    notReadyHint: MEMBER_MESSAGES.candidateQueryTooShort,
  });
}
