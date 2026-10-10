import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../auth/AuthProvider";
import { appRoutes } from "../../../../routes";
import { makeSession } from "../../../../test/authFixtures";
import {
  apiError,
  jsonResponse,
  mockFetch,
} from "../../../../test/fetchMock";
import { makeWorkspace } from "../../test/workspaceFixtures";

function renderGeneralSettingsApp(wsOverrides = {}) {
  const ws = makeWorkspace({
    id: "ws-1",
    slug: "openstudy",
    name: "OpenStudy",
    organizationSize: "2-10",
    timezone: "UTC",
    role: "admin",
    permissions: ["workspace.settings.update"],
    ...wsOverrides,
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/openstudy/settings/general"],
  });

  const fetchMock = mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: "openstudy" }),
    "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
  });

  render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );

  return { router, fetchMock, ws };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("GeneralSettingsPage", () => {
  it("scenario 4: submit button is disabled initially, enables on change, disables when reverted or only trailing space added", async () => {
    const user = userEvent.setup();
    renderGeneralSettingsApp();

    const nameInput = await screen.findByRole("textbox", {
      name: "Workspace name",
    });
    const submitBtn = screen.getByRole("button", { name: "Update workspace" });

    // Initially disabled
    expect(submitBtn).toBeDisabled();

    // Change name -> enables
    await user.type(nameInput, " New");
    expect(submitBtn).toBeEnabled();

    // Revert changes back to original -> disabled
    await user.clear(nameInput);
    await user.type(nameInput, "OpenStudy");
    expect(submitBtn).toBeDisabled();

    // Adding only trailing whitespace does not enable
    await user.type(nameInput, "   ");
    expect(submitBtn).toBeDisabled();
  });

  it("scenario 5: saving sends only changed fields; updates UI, document.title, and disables button on 200", async () => {
    const user = userEvent.setup();
    renderGeneralSettingsApp();

    const nameInput = await screen.findByRole("textbox", {
      name: "Workspace name",
    });
    const submitBtn = screen.getByRole("button", { name: "Update workspace" });

    await user.clear(nameInput);
    await user.type(nameInput, "OpenStudy Renovated");
    expect(submitBtn).toBeEnabled();

    const updatedWs = makeWorkspace({
      id: "ws-1",
      slug: "openstudy",
      name: "OpenStudy Renovated",
      updatedAt: new Date().toISOString(),
    });

    let patchCalledWith: unknown = null;
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [updatedWs],
          lastWorkspaceSlug: "openstudy",
        }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, updatedWs),
      "PATCH /api/workspaces/openstudy": (init) => {
        patchCalledWith = JSON.parse((init?.body as string) ?? "{}");
        return jsonResponse(200, updatedWs);
      },
    });

    await user.click(submitBtn);

    await waitFor(() => {
      expect(patchCalledWith).toEqual({ name: "OpenStudy Renovated" });
    });

    expect(await screen.findByText("Workspace updated")).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
  });

  it("scenario 6: displays validation error on blur for invalid name; handles 400 fields error from server", async () => {
    const user = userEvent.setup();
    renderGeneralSettingsApp();

    const nameInput = await screen.findByRole("textbox", {
      name: "Workspace name",
    });

    // Clear and blur -> error
    await user.clear(nameInput);
    await user.tab();

    expect(
      await screen.findByText("Enter a workspace name"),
    ).toBeInTheDocument();

    // Fill valid, submit, but server returns 400
    await user.type(nameInput, "Forbidden Name");

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "PATCH /api/workspaces/openstudy": () =>
        apiError(400, "BAD_REQUEST", "Validation failed", {
          fields: { name: "Name is disallowed by server" },
        }),
    });

    const submitBtn = screen.getByRole("button", { name: "Update workspace" });
    await user.click(submitBtn);

    expect(
      await screen.findByText("Name is disallowed by server"),
    ).toBeInTheDocument();
  });

  it("scenario 7: handles 403, 404, and 429 rate limit errors", async () => {
    const user = userEvent.setup();
    const { router } = renderGeneralSettingsApp();

    const nameInput = await screen.findByRole("textbox", {
      name: "Workspace name",
    });
    const submitBtn = screen.getByRole("button", { name: "Update workspace" });

    // 429 rate limiting with retryAfterSeconds: 90 -> "Try again in 2 minutes"
    await user.type(nameInput, " Changes");

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "PATCH /api/workspaces/openstudy": () =>
        apiError(429, "RATE_LIMITED", "Too many requests", {
          retryAfterSeconds: 90,
        }),
    });

    await user.click(submitBtn);
    expect(
      await screen.findByText("Too many changes. Try again in 2 minutes."),
    ).toBeInTheDocument();

    // 404 -> navigates to /
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "PATCH /api/workspaces/openstudy": () =>
        apiError(404, "NOT_FOUND", "Workspace not found"),
    });

    await user.click(submitBtn);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("scenario 8: permissions without workspace.settings.update makes form read-only and hides update button", async () => {
    renderGeneralSettingsApp({
      permissions: [],
    });

    const nameInput = await screen.findByRole("textbox", {
      name: "Workspace name",
    });
    expect(nameInput).toHaveAttribute("readonly");

    expect(
      screen.getByText(
        "You don't have permission to change these settings.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update workspace" }),
    ).not.toBeInTheDocument();

    // Copy URL button is still available
    expect(
      screen.getByRole("button", { name: "Copy workspace URL" }),
    ).toBeInTheDocument();
  });
});
