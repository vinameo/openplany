import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { ApiRequestError } from '../../lib/apiClient';

export type MemberCandidateState<C> =
  | { status: 'too_short'; hint: string }
  | { status: 'loading' }
  | { status: 'ready'; candidates: C[] }
  | { status: 'error'; message?: string; retryAfterSeconds?: number | null };

export interface MemberCandidateSearchOptions<C> {
  queryKey: (query: string) => QueryKey;
  fetcher: (query: string, signal: AbortSignal) => Promise<{ candidates: C[] }>;
  query: string;
  isReady: (trimmed: string) => boolean;
  notReadyHint: string;
}

export function useMemberCandidateSearch<C>(
  opts: MemberCandidateSearchOptions<C>,
): MemberCandidateState<C> {
  const trimmed = opts.query.trim();
  const [debouncedQuery] = useDebouncedValue(trimmed, 250);
  const ready = opts.isReady(trimmed);
  const debouncedReady = opts.isReady(debouncedQuery);

  const query = useQuery<{ candidates: C[] }, unknown>({
    queryKey: opts.queryKey(debouncedQuery),
    queryFn: ({ signal }) => opts.fetcher(debouncedQuery, signal),
    enabled: debouncedReady,
    staleTime: 30_000,
    retry: false,
  });

  if (!ready) {
    return { status: 'too_short', hint: opts.notReadyHint };
  }

  if (debouncedQuery !== trimmed || query.isFetching || query.isLoading) {
    return { status: 'loading' };
  }

  if (query.isError) {
    const err = query.error;
    if (err instanceof ApiRequestError) {
      if (err.status === 429) {
        return {
          status: 'error',
          retryAfterSeconds: err.retryAfterSeconds ?? 60,
        };
      }
      if (err.status === 400 && err.fields && err.fields.email) {
        return {
          status: 'error',
          message: err.fields.email,
        };
      }
    }
    return { status: 'error' };
  }

  if (query.data) {
    return { status: 'ready', candidates: query.data.candidates };
  }

  return { status: 'loading' };
}
