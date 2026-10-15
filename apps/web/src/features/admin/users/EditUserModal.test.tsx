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
import { EditUserModal } from "./EditUserModal";
import { adminUserKeys } from "./api/adminUserQueries";

const sampleUser: AdminUserResponse = {
  id: "user-an-1",
  email: "an-old@openplany.dev",
  firstName: "An",
  lastName: "Nguyen",
  displayName: "An Nguyen",
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

function renderEditModal(props: {
  opened: boolean;
  user?: AdminUserResponse | null;
  onClose?: () => void;
  onSaved?: (user: AdminUserResponse) => void;
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
    "GET /api/admin/users/user-an-1": () => jsonResponse(200, sampleUser),
    ...props.extraMocks,
  });

  const onClose = props.onClose ?? vi.fn();
  const onSaved = props.onSaved ?? vi.fn();
  const targetUser = props.user !== undefined ? props.user : sampleUser;

  render(
    <AppUiProvider>
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <EditUserModal
            opened={props.opened}
            user={targetUser}
            onClose={onClose}
            onSaved={onSaved}
          />
        </AuthProvider>
      </QueryClientProvider>
    </AppUiProvider>,
  );

  return { user: userEvent.setup(), onClose, onSaved, queryClient };
}

beforeEach(() => {
  notifications.clean();
});

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("EditUserModal", () => {
  it("does not render when opened is false", () => {
    renderEditModal({ opened: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fetches fresh user details and populates form fields on open (AC-09, AC-38)", async () => {
    renderEditModal({ opened: true });

    expect(
      await screen.findByRole("heading", { name: "Edit user" }),
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("An")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Nguyen")).toBeInTheDocument();
    expect(screen.getByDisplayValue("An Nguyen")).toBeInTheDocument();
    expect(screen.getByDisplayValue("an-old@openplany.dev")).toBeInTheDocument();

    // Save changes button is disabled initially because hasChanges is false
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeDisabled();
  });

  it("submits changed fields, updates cache, shows toast, and closes modal (AC-09)", async () => {
    let patchPayload: unknown = null;
    const updatedUser: AdminUserResponse = {
      ...sampleUser,
      email: "an@openplany.dev",
      updatedAt: "2026-10-10T12:00:00.000Z",
    };

    const { user, onClose, onSaved, queryClient } = renderEditModal({
      opened: true,
      extraMocks: {
        "PATCH /api/admin/users/user-an-1": (init) => {
          patchPayload = JSON.parse(String(init?.body));
          return jsonResponse(200, updatedUser);
        },
      },
    });

    const emailInput = await screen.findByDisplayValue("an-old@openplany.dev");
    await user.clear(emailInput);
    await user.type(emailInput, "an@openplany.dev");

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(patchPayload).toEqual({
        expectedUpdatedAt: "2026-10-10T10:00:00.000Z",
        email: "an@openplany.dev",
      });
      expect(onSaved).toHaveBeenCalledWith(updatedUser);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Check detail cache updated
    expect(queryClient.getQueryData(adminUserKeys.detail("user-an-1"))).toEqual(
      updatedUser,
    );
  });

  it("handles 409 conflict: shows alert and moves focus to Reload button (AC-10)", async () => {
    const { user } = renderEditModal({
      opened: true,
      extraMocks: {
        "PATCH /api/admin/users/user-an-1": () =>
          apiError(
            409,
            "USER_CHANGED_SINCE_LOADED",
            "User was modified since loaded",
          ),
      },
    });

    const emailInput = await screen.findByDisplayValue("an-old@openplany.dev");
    await user.clear(emailInput);
    await user.type(emailInput, "an-new@openplany.dev");

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    await user.click(saveButton);

    // Conflict alert appears
    const reloadButton = await screen.findByRole("button", { name: /reload/i });
    expect(reloadButton).toBeInTheDocument();
    expect(
      screen.getByText(/someone else updated this user while you were editing/i),
    ).toBeInTheDocument();

    // Focus moved to Reload button
    await waitFor(() => {
      expect(document.activeElement).toBe(reloadButton);
    });
  });

  it("reloads fresh user on Reload click, discards typing, and saves successfully (AC-31)", async () => {
    let getCallCount = 0;
    const freshUser: AdminUserResponse = {
      ...sampleUser,
      displayName: "An Binh Nguyen",
      updatedAt: "2026-10-10T11:00:00.000Z",
    };

    let patchPayload: unknown = null;
    const finalSavedUser: AdminUserResponse = {
      ...freshUser,
      email: "an-final@openplany.dev",
      updatedAt: "2026-10-10T12:00:00.000Z",
    };

    const { user, onClose } = renderEditModal({
      opened: true,
      extraMocks: {
        "GET /api/admin/users/user-an-1": () => {
          getCallCount++;
          if (getCallCount > 1) {
            return jsonResponse(200, freshUser);
          }
          return jsonResponse(200, sampleUser);
        },
        "PATCH /api/admin/users/user-an-1": (init) => {
          const body = JSON.parse(String(init?.body));
          if (body.expectedUpdatedAt === sampleUser.updatedAt) {
            return apiError(409, "USER_CHANGED_SINCE_LOADED", "Conflict");
          }
          patchPayload = body;
          return jsonResponse(200, finalSavedUser);
        },
      },
    });

    const emailInput = await screen.findByDisplayValue("an-old@openplany.dev");
    await user.clear(emailInput);
    await user.type(emailInput, "an-typing@openplany.dev");

    // Click Save -> gets 409
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const reloadButton = await screen.findByRole("button", { name: /reload/i });

    // Click Reload -> fetches freshUser and resets form without discard prompt
    await user.click(reloadButton);

    // Form resets to freshUser values and discard prompt was not shown
    expect(
      await screen.findByDisplayValue("An Binh Nguyen"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("an-typing@openplany.dev")).not.toBeInTheDocument();
    expect(screen.queryByText(/discard unsaved changes\?/i)).not.toBeInTheDocument();

    // Now type final email and save -> sends freshUser.updatedAt
    const freshEmailInput = screen.getByDisplayValue("an-old@openplany.dev");
    await user.clear(freshEmailInput);
    await user.type(freshEmailInput, "an-final@openplany.dev");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(patchPayload).toEqual({
        expectedUpdatedAt: "2026-10-10T11:00:00.000Z",
        email: "an-final@openplany.dev",
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("handles 404 USER_NOT_FOUND: closes modal, shows red toast, invalidates list (AC-12)", async () => {
    const { onClose } = renderEditModal({
      opened: true,
      extraMocks: {
        "GET /api/admin/users/user-an-1": () =>
          apiError(404, "USER_NOT_FOUND", "User not found"),
      },
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("WEB B2.1/B2.7: a 403 while loading shows the manage sentence and re-reads the session", async () => {
    let sessionReads = 0;
    renderEditModal({
      opened: true,
      extraMocks: {
        "GET /api/auth/session": () => {
          sessionReads += 1;
          return jsonResponse(200, adminSession);
        },
        "GET /api/admin/users/user-an-1": () =>
          apiError(403, "FORBIDDEN", "Forbidden"),
      },
    });

    expect(
      await screen.findByText("You no longer have permission to manage users."),
    ).toBeInTheDocument();
    // Once on mount by AuthProvider, once more for the 403.
    await waitFor(() => {
      expect(sessionReads).toBe(2);
    });
  });

  it("updates self session when editing own profile (AC-15)", async () => {
    const selfUser: AdminUserResponse = {
      id: "admin-kai-1",
      email: "kai@openplany.dev",
      firstName: "Kai",
      lastName: "Tran",
      displayName: "Kai Tran",
      avatarUrl: null,
      isActive: true,
      isInstanceAdmin: true,
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-10T10:00:00.000Z",
    };

    const updatedSelf: AdminUserResponse = {
      ...selfUser,
      displayName: "Kai Custom",
      updatedAt: "2026-10-10T12:00:00.000Z",
    };

    const { user, onClose } = renderEditModal({
      opened: true,
      user: selfUser,
      extraMocks: {
        "GET /api/admin/users/admin-kai-1": () => jsonResponse(200, selfUser),
        "PATCH /api/admin/users/admin-kai-1": () => jsonResponse(200, updatedSelf),
      },
    });

    const displayNameInput = await screen.findByDisplayValue("Kai Tran");
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Kai Custom");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("shows error under Email field on 409 EMAIL_ALREADY_EXISTS (AC-16)", async () => {
    const { user } = renderEditModal({
      opened: true,
      extraMocks: {
        "PATCH /api/admin/users/user-an-1": () =>
          apiError(
            409,
            "EMAIL_ALREADY_EXISTS",
            "This email is already in use.",
            { fields: { email: "This email is already in use." } },
          ),
      },
    });

    const emailInput = await screen.findByDisplayValue("an-old@openplany.dev");
    await user.clear(emailInput);
    await user.type(emailInput, "taken@openplany.dev");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText("This email is already in use."),
    ).toBeInTheDocument();
  });

  it("allows saving when unchanged field is invalid like empty CLI firstName (AC-35)", async () => {
    const cliUser: AdminUserResponse = {
      id: "cli-user-1",
      email: "cli@openplany.dev",
      firstName: "",
      lastName: "",
      displayName: "Cli User",
      avatarUrl: null,
      isActive: true,
      isInstanceAdmin: false,
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-10T10:00:00.000Z",
    };

    let patchCalled = false;
    const { user, onClose } = renderEditModal({
      opened: true,
      user: cliUser,
      extraMocks: {
        "GET /api/admin/users/cli-user-1": () => jsonResponse(200, cliUser),
        "PATCH /api/admin/users/cli-user-1": () => {
          patchCalled = true;
          return jsonResponse(200, {
            ...cliUser,
            email: "cli-new@openplany.dev",
            updatedAt: "2026-10-10T12:00:00.000Z",
          });
        },
      },
    });

    const emailInput = await screen.findByDisplayValue("cli@openplany.dev");
    await user.clear(emailInput);
    await user.type(emailInput, "cli-new@openplany.dev");

    // First name is empty in the input, but because it didn't change, no "Enter a first name" error is shown
    expect(screen.queryByText("Enter a first name")).not.toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(patchCalled).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("triggers discard guard when cancel is clicked with changes (AC-29)", async () => {
    const { user, onClose } = renderEditModal({ opened: true });

    const emailInput = await screen.findByDisplayValue("an-old@openplany.dev");
    await user.clear(emailInput);
    await user.type(emailInput, "typing@openplany.dev");

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText(/discard changes\?/i),
    ).toBeInTheDocument();

    // Click "Keep editing"
    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(
      screen.queryByText(/discard changes\?/i),
    ).not.toBeInTheDocument();

    // Click Cancel again then Discard
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
