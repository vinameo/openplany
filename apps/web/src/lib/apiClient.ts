import type { MessageKey } from "@repo/contracts";
import { getLanguage, translate } from "../i18n/index.js";

/** Error response shape shared by every endpoint (auth api-spec 2.1). */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
}

export const GENERIC_ERROR_KEY: MessageKey = "errors:genericError";

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

/**
 * `fallbackMessage` is shown when the failure carries no readable API message;
 * it is translated when the error is thrown, in the language of that moment.
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
  fallbackMessage: MessageKey = GENERIC_ERROR_KEY,
): Promise<T> {
  const lang = getLanguage();
  const headers = {
    Accept: "application/json",
    ...init.headers,
    "Accept-Language": lang,
  };

  let response: Response;
  try {
    // Same origin through the Vite proxy, so the session cookie is sent as is.
    response = await fetch(path, {
      ...init,
      headers,
    });
  } catch (cause: unknown) {
    throw new ApiRequestError(
      0,
      { code: "NETWORK_ERROR", message: translate(fallbackMessage) },
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
      { code: "INVALID_RESPONSE", message: translate(fallbackMessage) },
      { cause },
    );
  }

  if (response.ok) return body as T;
  throw new ApiRequestError(
    response.status,
    isApiErrorBody(body)
      ? body
      : { code: "UNKNOWN_ERROR", message: translate(fallbackMessage) },
  );
}
