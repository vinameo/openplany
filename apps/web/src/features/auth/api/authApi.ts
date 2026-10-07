import type { ApiErrorBody, AuthSession, SignInRequest } from "./authTypes";

export const GENERIC_SIGN_IN_ERROR = "Couldn't sign in. Please try again.";

/** A failed API call, carrying the machine-readable parts of the error body. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    body: Pick<ApiErrorBody, "code" | "message"> &
      Partial<Pick<ApiErrorBody, "fields" | "retryAfterSeconds">>,
    options?: ErrorOptions,
  ) {
    super(body.message, options);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? {};
    this.retryAfterSeconds = body.retryAfterSeconds ?? null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    // Same origin through the Vite proxy, so the session cookie is sent as is.
    response = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch (cause: unknown) {
    throw new ApiRequestError(
      0,
      { code: "NETWORK_ERROR", message: GENERIC_SIGN_IN_ERROR },
      { cause },
    );
  }

  if (response.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause: unknown) {
    throw new ApiRequestError(
      response.status,
      { code: "INVALID_RESPONSE", message: GENERIC_SIGN_IN_ERROR },
      { cause },
    );
  }

  if (response.ok) return body as T;
  throw new ApiRequestError(
    response.status,
    isApiErrorBody(body)
      ? body
      : { code: "UNKNOWN_ERROR", message: GENERIC_SIGN_IN_ERROR },
  );
}

export const authApi = {
  signIn(values: SignInRequest): Promise<AuthSession> {
    return request<AuthSession>("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
  },

  /** Resolves null when nobody is signed in (401). */
  async getSession(): Promise<AuthSession | null> {
    try {
      return await request<AuthSession>("/api/auth/session");
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 401) return null;
      throw error;
    }
  },

  signOut(): Promise<void> {
    return request<void>("/api/auth/sign-out", { method: "POST" });
  },
};
