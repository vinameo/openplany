import { useTranslation } from "react-i18next";
import {
  MEMBER_CANDIDATE_QUERY_MIN,
  type MemberCandidate,
} from "@repo/contracts";
import {
  useMemberCandidateSearch,
  type MemberCandidateState,
} from "../../../members/useMemberCandidateSearch";
import { membersApi } from "./api/membersApi";
import { workspaceMemberKeys } from "./api/workspaceMemberQueries";

export type { MemberCandidateState };

export function useMemberCandidates(
  slug: string,
  query: string,
): MemberCandidateState<MemberCandidate> {
  const { t } = useTranslation();
  return useMemberCandidateSearch<MemberCandidate>({
    queryKey: (q) => workspaceMemberKeys.candidates(slug, q),
    fetcher: (q, signal) => membersApi.searchCandidates(slug, q, signal),
    query,
    isReady: (trimmed) => trimmed.length >= MEMBER_CANDIDATE_QUERY_MIN,
    notReadyHint: t("members:errors.candidateQueryTooShort"),
  });
}
