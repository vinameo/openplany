import { vi } from "vitest";

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiError(
  statusCode: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(statusCode, {
    statusCode,
    code,
    message,
    requestId: "req-1",
    ...extra,
  });
}

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

const defaultHandlers: Record<string, Handler> = {
  "GET /api/workspaces": () =>
    jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
};

/** Stubs fetch with one handler per "METHOD /path"; unknown routes fail the test. */
export function mockFetch(routes: Record<string, Handler>) {
  const allRoutes = { ...defaultHandlers, ...routes };
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const key = `${init?.method ?? "GET"} ${String(input)}`;
      const handler = allRoutes[key];
      if (handler === undefined) throw new Error(`Unexpected request: ${key}`);
      return handler(init);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
