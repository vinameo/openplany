import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/apiClient';
import { useMemberCandidateSearch } from './useMemberCandidateSearch';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useMemberCandidateSearch', () => {
  it('returns too_short and does not call fetcher when query is not ready', () => {
    const fetcher = vi.fn();
    const { result } = renderHook(
      () =>
        useMemberCandidateSearch({
          queryKey: (q) => ['candidates', q],
          fetcher,
          query: 'ab',
          isReady: (trimmed) => trimmed.length >= 3,
          notReadyHint: 'Type at least 3 characters',
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current).toEqual({
      status: 'too_short',
      hint: 'Type at least 3 characters',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls fetcher after debounce and returns ready candidates', async () => {
    const mockCandidates = [{ userId: 'u-1', email: 'alice@example.com' }];
    const fetcher = vi.fn().mockResolvedValue({ candidates: mockCandidates });

    const { result } = renderHook(
      () =>
        useMemberCandidateSearch({
          queryKey: (q) => ['candidates', q],
          fetcher,
          query: 'alice',
          isReady: (trimmed) => trimmed.length >= 3,
          notReadyHint: 'Type at least 3 characters',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    if (result.current.status === 'ready') {
      expect(result.current.candidates).toEqual(mockCandidates);
    }
    expect(fetcher).toHaveBeenCalledWith('alice', expect.any(AbortSignal));
  });

  it('maps 429 rate limit error to retryAfterSeconds', async () => {
    const rateLimitError = new ApiRequestError(429, {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      retryAfterSeconds: 45,
    });
    const fetcher = vi.fn().mockRejectedValue(rateLimitError);

    const { result } = renderHook(
      () =>
        useMemberCandidateSearch({
          queryKey: (q) => ['candidates', q],
          fetcher,
          query: 'search',
          isReady: (trimmed) => trimmed.length >= 3,
          notReadyHint: 'Type at least 3 characters',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current).toEqual({
      status: 'error',
      retryAfterSeconds: 45,
    });
  });

  it('maps 400 error with fields.email to message', async () => {
    const validationError = new ApiRequestError(400, {
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      fields: { email: 'Invalid email character' },
    });
    const fetcher = vi.fn().mockRejectedValue(validationError);

    const { result } = renderHook(
      () =>
        useMemberCandidateSearch({
          queryKey: (q) => ['candidates', q],
          fetcher,
          query: 'invalid%',
          isReady: (trimmed) => trimmed.length >= 3,
          notReadyHint: 'Type at least 3 characters',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current).toEqual({
      status: 'error',
      message: 'Invalid email character',
    });
  });
});
