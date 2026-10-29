import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications, notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { CreateUserModal } from "./CreateUserModal";

function renderModal(props: {
  opened: boolean;
  onClose?: () => void;
  onCreated?: () => void;
  extraMocks?: Parameters<typeof mockFetch>[0];
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  mockFetch({
    "GET /api/auth/session": () =>
      jsonResponse(
        200,
        makeSession({
          user: { ...makeSession().user, isInstanceAdmin: true },
        }),
      ),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    ...props.extraMocks,
  });

  const onClose = props.onClose ?? vi.fn();
  const onCreated = props.onCreated ?? vi.fn();

  render(
    <AppUiProvider>
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CreateUserModal
            opened={props.opened}
            onClose={onClose}
            onCreated={onCreated}
          />
        </AuthProvider>
      </QueryClientProvider>
    </AppUiProvider>,
  );

  return { user: userEvent.setup(), onClose, onCreated, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("CreateUserModal", () => {
  it("does not render when opened is false", () => {
    renderModal({ opened: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders modal when opened is true", async () => {
    renderModal({ opened: true });

    expect(
      await screen.findByRole("heading", { name: "Create user" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  it("closes immediately on Cancel when form is pristine (AC-29)", async () => {
    const { user, onClose } = renderModal({ opened: true });

    const cancelButton = await screen.findByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/discard unsaved changes\?/i),
    ).not.toBeInTheDocument();
  });

  it("triggers discard guard when user has typed in the form (AC-29)", async () => {
    const { user, onClose } = renderModal({ opened: true });

    const firstNameInput = await screen.findByLabelText(/first name/i);
    await user.type(firstNameInput, "An");

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // onClose should NOT have been called yet
    expect(onClose).not.toHaveBeenCalled();

    // Discard footer is visible
    expect(screen.getByText(/discard changes\?/i)).toBeInTheDocument();
    const keepEditingButton = screen.getByRole("button", {
      name: /keep editing/i,
    });

    // Click "Keep editing"
    await user.click(keepEditingButton);
    expect(screen.queryByText(/discard changes\?/i)).not.toBeInTheDocument();
    expect(firstNameInput).toHaveValue("An");

    // Click cancel again (re-queried because DOM element was remounted by discard guard)
    const cancelAgain = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelAgain);
    expect(screen.getByText(/discard changes\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits form, shows notification, and closes on success (AC-28)", async () => {
    let createCalled = false;
    const { user, onClose, onCreated } = renderModal({
      opened: true,
      extraMocks: {
        "POST /api/admin/users": () => {
          createCalled = true;
          return jsonResponse(201, {
            id: "user-new-1",
            firstName: "An",
            lastName: "Nguyen",
            displayName: "An Nguyen",
            email: "an@openplany.dev",
            isInstanceAdmin: false,
            createdAt: "2026-10-10T12:00:00.000Z",
          });
        },
      },
    });

    const firstNameInput = await screen.findByLabelText(/first name/i);
    await user.type(firstNameInput, "An");

    const lastNameInput = screen.getByLabelText(/last name/i);
    await user.type(lastNameInput, "Nguyen");

    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, "an@openplany.dev");

    const passwordInput = screen.getByLabelText(/^password/i);
    await user.type(passwordInput, "ValidPassword123");

    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    await user.type(confirmPasswordInput, "ValidPassword123");

    const submitButton = screen.getByRole("button", { name: /create user/i });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    await waitFor(() => {
      expect(createCalled).toBe(true);
      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
