import { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from "../features/auth/authContext";
import { makeSession } from "../test/authFixtures";
import { ServerStateProvider } from "./ServerStateProvider";

function authValue(state: AuthState): AuthContextValue {
  return {
    state,
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    replaceSession: vi.fn(),
    expireSession: vi.fn(),
  };
}

function CachedValue() {
  const client = useQueryClient();
  const [, rerender] = useState(0);
  const value = client.getQueryData<string>(["secret"]) ?? "empty";
  return (
    <>
      <p>{value}</p>
      <button
        type="button"
        onClick={() => {
          client.setQueryData(["secret"], "first user's data");
          rerender((n) => n + 1);
        }}
      >
        store
      </button>
    </>
  );
}

describe("ServerStateProvider", () => {
  afterEach(() => cleanup());

  it("starts an empty cache when the signed-in user changes", () => {
    const first = authValue({
      status: "authenticated",
      session: makeSession(),
    });
    const { rerender } = render(
      <AuthContext value={first}>
        <ServerStateProvider>
          <CachedValue />
        </ServerStateProvider>
      </AuthContext>,
    );
    act(() => screen.getByRole("button", { name: "store" }).click());
    expect(screen.getByText("first user's data")).toBeInTheDocument();

    const second = authValue({
      status: "authenticated",
      session: makeSession({
        user: { ...makeSession().user, id: "user-2" },
      }),
    });
    rerender(
      <AuthContext value={second}>
        <ServerStateProvider>
          <CachedValue />
        </ServerStateProvider>
      </AuthContext>,
    );
    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("keeps the cache while the same user stays signed in", () => {
    const value = authValue({
      status: "authenticated",
      session: makeSession(),
    });
    const { rerender } = render(
      <AuthContext value={value}>
        <ServerStateProvider>
          <CachedValue />
        </ServerStateProvider>
      </AuthContext>,
    );
    act(() => screen.getByRole("button", { name: "store" }).click());
    rerender(
      <AuthContext value={{ ...value }}>
        <ServerStateProvider>
          <CachedValue />
        </ServerStateProvider>
      </AuthContext>,
    );
    expect(screen.getByText("first user's data")).toBeInTheDocument();
  });
});
