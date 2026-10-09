import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications, notifications } from "@mantine/notifications";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";

function renderRoute(options?: {
  isInstanceAdmin?: boolean;
  extraMocks?: Parameters<typeof mockFetch>[0];
}) {
  const isInstanceAdmin = options?.isInstanceAdmin ?? true;
  mockFetch({
    "GET /api/auth/session": () =>
      jsonResponse(
        200,
        makeSession({
          user: { ...makeSession().user, isInstanceAdmin },
        }),
      ),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    ...options?.extraMocks,
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/create-user"],
  });
  render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { router, user: userEvent.setup() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("CreateUserRoute", () => {
  it("renders page with title 'Create user' and inputs for instance admin", async () => {
    renderRoute({ isInstanceAdmin: true });

    expect(await screen.findByRole("heading", { name: "Create user" })).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("redirects non-instance admin away to /", async () => {
    const { router } = renderRoute({ isInstanceAdmin: false });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("successful creation (201) submits form, shows toast, and navigates", async () => {
    const { user, router } = renderRoute({
      isInstanceAdmin: true,
      extraMocks: {
        "POST /api/admin/users": () =>
          jsonResponse(201, {
            id: "new-user-1",
            email: "an@openplany.dev",
            firstName: "An",
            lastName: "Nguyen",
            displayName: "An Nguyen",
            isInstanceAdmin: false,
            createdAt: "2026-10-09T10:00:00.000Z",
          }),
      },
    });

    await user.type(await screen.findByLabelText(/first name/i), "An");
    await user.type(screen.getByLabelText(/last name/i), "Nguyen");
    await user.type(screen.getByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");

    const submitBtn = screen.getByRole("button", { name: "Create user" });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    expect(await screen.findByText(/User created/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("Cancel button navigates to / when opened without history", async () => {
    const { user, router } = renderRoute({ isInstanceAdmin: true });

    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });
});
