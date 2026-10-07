import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications, notifications } from "@mantine/notifications";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider";
import { appRoutes } from "../../routes";
import { makeSession } from "../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../test/fetchMock";

const SESSION_ROUTE = "GET /api/auth/session";

function renderApp() {
  const router = createMemoryRouter(appRoutes, { initialEntries: ["/"] });
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

async function openProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Edit profile – An Nguyen" }),
  );
  return screen.findByRole("dialog", { name: "Profile" });
}

const signedIn = () => jsonResponse(200, makeSession());

afterEach(() => {
  vi.unstubAllGlobals();
  // The notification store is global: a toast must not leak into the next test.
  notifications.clean();
});

describe("profile popup", () => {
  it("opens from the avatar and name with the current values", async () => {
    mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();

    const dialog = await openProfile(user);

    expect(screen.getByLabelText(/first name/i)).toHaveValue("An");
    expect(screen.getByLabelText(/last name/i)).toHaveValue("Nguyen");
    expect(screen.getByLabelText(/display name/i)).toHaveValue("An Nguyen");
    expect(dialog).toHaveTextContent("an@openplany.dev");
    await waitFor(() =>
      expect(screen.getByLabelText(/first name/i)).toHaveFocus(),
    );
  });

  it("shows the email read-only, without a required marker", async () => {
    mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();
    await openProfile(user);

    const email = screen.getByLabelText("Email");

    expect(email).toHaveValue("an@openplany.dev");
    expect(email).toHaveAttribute("readonly");
    expect(email).not.toBeRequired();
  });

  it("keeps Save disabled until something changes, and again when reverted", async () => {
    mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();
    await openProfile(user);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/display name/i), "x");
    expect(save).toBeEnabled();

    await user.type(screen.getByLabelText(/display name/i), "{Backspace}");
    expect(save).toBeDisabled();
  });

  it("previews the full name while typing", async () => {
    mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();
    const dialog = await openProfile(user);

    await user.clear(screen.getByLabelText(/last name/i));
    await user.type(screen.getByLabelText(/last name/i), "Tran Tran");

    expect(dialog).toHaveTextContent("An Tran Tran");
  });

  it("sends only the changed fields, then updates the head bar and closes", async () => {
    const saved = makeSession().user;
    saved.displayName = "Kai";
    const fetchMock = mockFetch({
      [SESSION_ROUTE]: signedIn,
      "PATCH /api/users/me": () => jsonResponse(200, saved),
    });
    const { user } = renderApp();
    await openProfile(user);

    await user.clear(screen.getByLabelText(/display name/i));
    await user.type(screen.getByLabelText(/display name/i), "  Kai ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByRole("button", { name: "Edit profile – Kai" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Profile updated")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const patch = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(patch?.[1]?.body).toBe(JSON.stringify({ displayName: "Kai" }));
    expect(
      screen.getByRole("heading", { name: "Welcome, Kai" }),
    ).toBeInTheDocument();
  });

  it("blocks a blank first name without calling the API", async () => {
    const fetchMock = mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();
    await openProfile(user);

    await user.clear(screen.getByLabelText(/first name/i));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Enter your first name"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the session check
  });

  it("puts server field errors under the right input", async () => {
    mockFetch({
      [SESSION_ROUTE]: signedIn,
      "PATCH /api/users/me": () =>
        apiError(400, "VALIDATION_ERROR", "Check the highlighted fields", {
          fields: { displayName: "Contains characters that aren't allowed" },
        }),
    });
    const { user } = renderApp();
    await openProfile(user);

    await user.type(screen.getByLabelText(/display name/i), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Contains characters that aren't allowed"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(/display name/i)).toHaveFocus();
  });

  it("keeps the typing and shows an alert when saving fails", async () => {
    mockFetch({
      [SESSION_ROUTE]: signedIn,
      "PATCH /api/users/me": () => {
        throw new TypeError("offline");
      },
    });
    const { user } = renderApp();
    await openProfile(user);

    await user.type(screen.getByLabelText(/display name/i), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save your profile. Please try again.",
    );
    expect(screen.getByLabelText(/display name/i)).toHaveValue("An Nguyenx");
  });

  it("sends the user to sign-in when the session has expired", async () => {
    mockFetch({
      [SESSION_ROUTE]: signedIn,
      "PATCH /api/users/me": () =>
        apiError(401, "UNAUTHENTICATED", "Sign in to continue"),
    });
    const { user, router } = renderApp();
    await openProfile(user);

    await user.type(screen.getByLabelText(/display name/i), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/sign-in"),
    );
  });

  it("closes at once when nothing was changed", async () => {
    mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();
    await openProfile(user);

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("asks before discarding changes, and keeps editing on request", async () => {
    mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();
    await openProfile(user);
    await user.type(screen.getByLabelText(/display name/i), "x");

    await user.keyboard("{Escape}");

    expect(
      await screen.findByText("Discard unsaved changes?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue("An Nguyenx");
  });

  it("discards the changes and starts fresh the next time", async () => {
    mockFetch({ [SESSION_ROUTE]: signedIn });
    const { user } = renderApp();
    await openProfile(user);
    await user.type(screen.getByLabelText(/display name/i), "x");
    await user.keyboard("{Escape}");

    await user.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await openProfile(user);

    expect(screen.getByLabelText(/display name/i)).toHaveValue("An Nguyen");
  });

  it("cannot be dismissed while saving", async () => {
    let finish: (response: Response) => void = () => {};
    mockFetch({
      [SESSION_ROUTE]: signedIn,
      "PATCH /api/users/me": () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }) as unknown as Response,
    });
    const { user } = renderApp();
    await openProfile(user);
    await user.type(screen.getByLabelText(/display name/i), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
    const saved = makeSession().user;
    finish(jsonResponse(200, saved));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
