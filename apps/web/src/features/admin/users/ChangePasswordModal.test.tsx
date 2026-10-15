import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications, notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminUserResponse } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { adminUserKeys } from "./api/adminUserQueries";

const targetUser: AdminUserResponse = {
  id: "user-nam-1",
  email: "nam@openplany.dev",
  firstName: "Nam",
  lastName: "Nguyen",
  displayName: "Nam Nguyen",
  avatarUrl: null,
  isActive: true,
  isInstanceAdmin: false,
  createdAt: "2026-10-10T10:00:00.000Z",
  updatedAt: "2026-10-10T10:00:00.000Z",
};

const adminSession = makeSession({
  user: {
    ...makeSession().user,
    id: "admin-kai-1",
    email: "kai@openplany.dev",
    firstName: "Kai",
    lastName: "Tran",
    displayName: "Kai Tran",
    isInstanceAdmin: true,
    isEmailVerified: true,
  },
});

function renderChangePasswordModal(props: {
  opened: boolean;
  user?: AdminUserResponse | null;
  onClose?: () => void;
  onSuccess?: () => void;
  session?: typeof adminSession;
  extraMocks?: Parameters<typeof mockFetch>[0];
  queryClient?: QueryClient;
}) {
  const queryClient =
    props.queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  const session = props.session ?? adminSession;

  mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, session),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    ...props.extraMocks,
  });

  const onClose = props.onClose ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  const user = props.user !== undefined ? props.user : targetUser;

  const result = render(
    <AppUiProvider>
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ChangePasswordModal
            opened={props.opened}
            user={user}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </AuthProvider>
      </QueryClientProvider>
    </AppUiProvider>,
  );

  return { ...result, onClose, onSuccess, queryClient };
}

describe("ChangePasswordModal", () => {
  let showNotificationSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    showNotificationSpy = vi.spyOn(notifications, "show");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    showNotificationSpy.mockRestore();
  });

  it("renders modal with user name, email, lockout note, and password fields", async () => {
    renderChangePasswordModal({ opened: true });

    expect(
      await screen.findByRole("dialog", { name: "Change password" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("For Nam Nguyen (nam@openplany.dev)"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "If Nam Nguyen is locked out after too many failed sign-ins, they still need to wait for the lockout to end.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm password/i)).toBeInTheDocument();
  });

  it("validates password length, matching, and disallows password equal to email (AC-19)", async () => {
    const user = userEvent.setup();
    renderChangePasswordModal({ opened: true });

    const passwordInput = await screen.findByLabelText(/^Password/i);
    const confirmInput = screen.getByLabelText(/^Confirm password/i);

    // Short password (< 8 chars)
    await user.type(passwordInput, "short");
    await user.type(confirmInput, "short");
    await user.tab();

    expect(
      await screen.findByText("Use 8 to 128 characters"),
    ).toBeInTheDocument();

    // Password equals target email
    await user.clear(passwordInput);
    await user.clear(confirmInput);
    await user.type(passwordInput, "nam@openplany.dev");
    await user.type(confirmInput, "nam@openplany.dev");
    await user.tab();

    expect(
      await screen.findByText("Password can't be the same as the email"),
    ).toBeInTheDocument();

    // Mismatched passwords
    await user.clear(passwordInput);
    await user.clear(confirmInput);
    await user.type(passwordInput, "ValidPassword123!");
    await user.type(confirmInput, "DifferentPassword123!");
    await user.tab();

    expect(
      await screen.findByText("Passwords don't match"),
    ).toBeInTheDocument();
  });

  it("AC-17: successfully changes password, shows toast, invalidates detail cache, and closes", async () => {
    const user = userEvent.setup();
    let putCalled = false;
    let putBody: unknown = null;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { onClose, onSuccess } = renderChangePasswordModal({
      opened: true,
      queryClient,
      extraMocks: {
        "PUT /api/admin/users/user-nam-1/password": (init) => {
          putCalled = true;
          putBody = JSON.parse(init?.body as string);
          return new Response(null, { status: 204 });
        },
      },
    });

    const passwordInput = await screen.findByLabelText(/^Password/i);
    const confirmInput = screen.getByLabelText(/^Confirm password/i);

    await user.type(passwordInput, "BrandNewSecret123!");
    await user.type(confirmInput, "BrandNewSecret123!");

    const submitBtn = screen.getByRole("button", { name: "Change password" });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(putCalled).toBe(true);
    });
    expect(putBody).toEqual({ password: "BrandNewSecret123!" });

    expect(showNotificationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Password changed. Nam Nguyen has been signed out everywhere.",
      }),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: adminUserKeys.detail("user-nam-1"),
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("AC-18: renders alert if server returns CANNOT_CHANGE_OWN_PASSWORD", async () => {
    const user = userEvent.setup();
    renderChangePasswordModal({
      opened: true,
      extraMocks: {
        "PUT /api/admin/users/user-nam-1/password": () =>
          apiError(403, "CANNOT_CHANGE_OWN_PASSWORD", "Cannot change own password"),
      },
    });

    const passwordInput = await screen.findByLabelText(/^Password/i);
    const confirmInput = screen.getByLabelText(/^Confirm password/i);

    await user.type(passwordInput, "ValidPassword123!");
    await user.type(confirmInput, "ValidPassword123!");

    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("You can't change your own password here."),
    ).toBeInTheDocument();
  });

  it("AC-29: triggers discard guard when cancel is clicked with unsaved changes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderChangePasswordModal({ opened: true });

    const passwordInput = await screen.findByLabelText(/^Password/i);
    await user.type(passwordInput, "somepassword");

    // Click Cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Discard guard prompt appears
    expect(
      await screen.findByText(/discard changes\?/i),
    ).toBeInTheDocument();

    // Click Keep editing -> prompt dismisses, modal stays
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText(/discard changes\?/i)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Click Cancel again, then click Discard -> modal closes
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes immediately without confirmation when cancel is clicked without changes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderChangePasswordModal({ opened: true });

    await screen.findByRole("dialog", { name: "Change password" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("handles 404 USER_NOT_FOUND by showing red toast and closing", async () => {
    const user = userEvent.setup();
    const { onClose } = renderChangePasswordModal({
      opened: true,
      extraMocks: {
        "PUT /api/admin/users/user-nam-1/password": () =>
          apiError(404, "USER_NOT_FOUND", "User not found"),
      },
    });

    const passwordInput = await screen.findByLabelText(/^Password/i);
    const confirmInput = screen.getByLabelText(/^Confirm password/i);

    await user.type(passwordInput, "ValidPassword123!");
    await user.type(confirmInput, "ValidPassword123!");

    await user.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "red",
          message: "This user no longer exists.",
        }),
      );
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("handles 429 TOO_MANY_ATTEMPTS with rate limit message", async () => {
    const user = userEvent.setup();
    renderChangePasswordModal({
      opened: true,
      extraMocks: {
        "PUT /api/admin/users/user-nam-1/password": () =>
          apiError(429, "TOO_MANY_ATTEMPTS", "Rate limited", {
            retryAfterSeconds: 120,
          }),
      },
    });

    const passwordInput = await screen.findByLabelText(/^Password/i);
    const confirmInput = screen.getByLabelText(/^Confirm password/i);

    await user.type(passwordInput, "ValidPassword123!");
    await user.type(confirmInput, "ValidPassword123!");

    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText(
        "Too many user changes. Please wait a moment and try again.",
      ),
    ).toBeInTheDocument();
  });
});
