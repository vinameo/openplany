import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { WorkspaceProvider } from "../WorkspaceProvider";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { NoWorkspaceHome } from "./NoWorkspaceHome";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NoWorkspaceHome", () => {
  it("does not render 'Verify your email' banner even when isEmailVerified is false (WEB-01)", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: {
              ...makeSession().user,
              isEmailVerified: false,
            },
          }),
        ),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    });

    render(
      <AppUiProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <MemoryRouter>
              <NoWorkspaceHome />
            </MemoryRouter>
          </WorkspaceProvider>
        </AuthProvider>
      </AppUiProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "You're not in a workspace yet",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Create one to start planning, or ask your admin to invite you.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole("link", { name: "Create workspace" }).length,
    ).toBeGreaterThanOrEqual(1);

    expect(screen.queryByText(/Verify your email/i)).toBeNull();
    expect(
      screen.queryByText(
        /Check your inbox for a verification link from OpenPlany/i,
      ),
    ).toBeNull();
  });
});
