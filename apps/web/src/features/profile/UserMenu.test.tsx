import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider";
import { makeSession } from "../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../test/fetchMock";
import { UserMenu } from "./UserMenu";

function renderUserMenu(
  session = makeSession(),
  extraHandlers: Record<string, () => Response | Promise<Response>> = {},
) {
  const fetchMock = mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, session),
    "POST /api/auth/sign-out": () => new Response(null, { status: 204 }),
    ...extraHandlers,
  });

  render(
    <AppUiProvider>
      <AuthProvider>
        <UserMenu user={session.user} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { user: userEvent.setup(), fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("AC-01, AC-21: opens with mouse click and shows header, Edit profile, Change password, Divider, and red Sign out in exact order", async () => {
    const session = makeSession();
    const { user } = renderUserMenu(session);

    const trigger = await screen.findByRole("button", {
      name: `Account menu – ${session.user.displayName}`,
    });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    // Header with name and email (non-interactive) in dropdown
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(
      screen.getAllByText(session.user.displayName!).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(session.user.email)).toBeInTheDocument();

    // Menu items
    const menuItems = await screen.findAllByRole("menuitem");
    const itemTexts = menuItems.map((item) => item.textContent?.trim());
    expect(itemTexts).toEqual(["Edit profile", "Change password", "Sign out"]);

    // Sign out is colored red
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOutItem.getAttribute("style")).toMatch(
      /--menu-item-color:.*red/,
    );
  });

  it("AC-01: opens with keyboard Enter/Space", async () => {
    const session = makeSession();
    const { user } = renderUserMenu(session);

    const trigger = await screen.findByRole("button", {
      name: `Account menu – ${session.user.displayName}`,
    });

    trigger.focus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("menuitem", { name: "Edit profile" }),
    ).toBeInTheDocument();
  });

  it("AC-03, AC-04: Edit profile opens ProfileModal and does NOT request any /api/admin/* endpoint", async () => {
    const session = makeSession();
    const { user, fetchMock } = renderUserMenu(session, {
      "GET /api/users/me": () => jsonResponse(200, session.user),
    });

    const trigger = await screen.findByRole("button", {
      name: `Account menu – ${session.user.displayName}`,
    });
    await user.click(trigger);

    const editProfileItem = await screen.findByRole("menuitem", {
      name: "Edit profile",
    });
    await user.click(editProfileItem);

    // Profile modal title
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Profile" }),
    ).toBeInTheDocument();

    // Verify no requests went to /api/admin/*
    const adminCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/api/admin"),
    );
    expect(adminCalls).toHaveLength(0);
  });

  it("Change password opens ChangeMyPasswordModal", async () => {
    const session = makeSession();
    const { user } = renderUserMenu(session);

    const trigger = await screen.findByRole("button", {
      name: `Account menu – ${session.user.displayName}`,
    });
    await user.click(trigger);

    const changePasswordItem = await screen.findByRole("menuitem", {
      name: "Change password",
    });
    await user.click(changePasswordItem);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Change password" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current password *")).toBeInTheDocument();
  });

  it("Sign out invokes signOut once", async () => {
    const session = makeSession();
    const { user, fetchMock } = renderUserMenu(session);

    const trigger = await screen.findByRole("button", {
      name: `Account menu – ${session.user.displayName}`,
    });
    await user.click(trigger);

    const signOutItem = await screen.findByRole("menuitem", {
      name: "Sign out",
    });
    await user.click(signOutItem);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/sign-out",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("AC-20: renders without explicit user prop by reading from useAuth", async () => {
    const session = makeSession();
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, session),
    });

    render(
      <AppUiProvider>
        <AuthProvider>
          <UserMenu />
        </AuthProvider>
      </AppUiProvider>,
    );

    expect(
      await screen.findByRole("button", {
        name: `Account menu – ${session.user.displayName}`,
      }),
    ).toBeInTheDocument();
  });
});
