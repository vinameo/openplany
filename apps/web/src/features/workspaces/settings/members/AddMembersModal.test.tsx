import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type { MemberCandidate, WorkspaceRole } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../../auth/authContext";
import { CurrentWorkspaceContext } from "../../currentWorkspace/currentWorkspaceContext";
import { makeSession } from "../../../../test/authFixtures";
import { makeWorkspace } from "../../test/workspaceFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { AddMembersModal } from "./AddMembersModal";

function renderModal({
  opened = true,
  onClose = vi.fn(),
  onSuccess = vi.fn(),
  reloadWorkspace = vi.fn().mockResolvedValue(undefined),
  addableRoles = ["admin", "member", "guest"] as WorkspaceRole[],
}: {
  opened?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  reloadWorkspace?: () => Promise<void>;
  addableRoles?: WorkspaceRole[];
} = {}) {
  const authValue: AuthContextValue = {
    state: {
      status: "authenticated",
      session: makeSession(),
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    expireSession: vi.fn(),
  };

  const ws = makeWorkspace({
    id: "ws-1",
    slug: "openstudy",
    name: "OpenStudy",
    role: "admin",
  });

  const wsValue = {
    workspace: ws,
    applyWorkspaceUpdate: vi.fn(),
    reload: reloadWorkspace,
  };

  const result = render(
    <AppUiProvider>
      <Notifications />
      <AuthContext.Provider value={authValue}>
        <CurrentWorkspaceContext.Provider value={wsValue}>
          <AddMembersModal
            opened={opened}
            onClose={onClose}
            slug="openstudy"
            addableRoles={addableRoles}
            onSuccess={onSuccess}
          />
        </CurrentWorkspaceContext.Provider>
      </AuthContext.Provider>
    </AppUiProvider>,
  );

  return { ...result, onClose, onSuccess, reloadWorkspace };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("AddMembersModal", () => {
  const candidates: MemberCandidate[] = [
    {
      userId: "u-1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      displayName: "alice_s",
      avatarUrl: null,
      alreadyMember: false,
    },
    {
      userId: "u-2",
      email: "bob@example.com",
      firstName: "Bob",
      lastName: "Jones",
      displayName: "bob_j",
      avatarUrl: null,
      alreadyMember: false,
    },
  ];

  it("adds 2 members + 1 empty row -> calls API, shows notification, closes modal (AC-20)", async () => {
    let postBody: { members: { userId: string; role: string }[] } | null = null;
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/openstudy/members": async (init) => {
        postBody = JSON.parse(init?.body as string);
        return jsonResponse(201, {
          members: [
            {
              userId: "u-1",
              firstName: "Alice",
              lastName: "Smith",
              displayName: "alice_s",
              email: "alice@example.com",
              role: "member",
            },
            {
              userId: "u-2",
              firstName: "Bob",
              lastName: "Jones",
              displayName: "bob_j",
              email: "bob@example.com",
              role: "guest",
            },
          ],
        });
      },
    });

    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const reloadWorkspace = vi.fn();

    renderModal({ onClose, onSuccess, reloadWorkspace });

    // Row 1: Select Alice
    const row1Input = screen.getByRole("textbox", { name: "Email" });
    await user.type(row1Input, "ali");
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /alice@example\.com/i }));

    // Click "+ Add more" to add Row 2
    await user.click(screen.getByRole("button", { name: "+ Add more" }));

    // Row 2: Select Bob
    const inputs = screen.getAllByRole("textbox", { name: "Email" });
    expect(inputs).toHaveLength(1); // row 1 is now an avatar preview div, so inputs[0] is row 2
    await user.type(inputs[0]!, "bob");
    await waitFor(() => {
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /bob@example\.com/i }));

    // Change Bob's role to Guest
    const roleSelects = screen.getAllByRole("combobox", { name: "Role" });
    await user.click(roleSelects[1]!);
    await user.click(await screen.findByRole("option", { name: "Guest" }));

    // Click "+ Add more" to add an empty Row 3
    await user.click(screen.getByRole("button", { name: "+ Add more" }));

    // Click "Add member" button in footer
    const addBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(addBtn);

    await waitFor(() => {
      expect(postBody).toEqual({
        members: [
          { userId: "u-1", role: "member" },
          { userId: "u-2", role: "guest" },
        ],
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(reloadWorkspace).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("handles 409 conflict and maps error to specific row (AC-20)", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/openstudy/members": () =>
        apiError(409, "MEMBERS_NOT_ADDABLE", "Some people couldn't be added", {
          fields: {
            "members.1.userId": "Already a member of this workspace",
          },
        }),
    });

    const user = userEvent.setup();
    renderModal();

    // Select Alice for row 1
    const row1Input = screen.getByRole("textbox", { name: "Email" });
    await user.type(row1Input, "ali");
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /alice@example\.com/i }));

    // Add row 2 and select Bob
    await user.click(screen.getByRole("button", { name: "+ Add more" }));
    const row2Input = screen.getByRole("textbox", { name: "Email" });
    await user.type(row2Input, "bob");
    await waitFor(() => {
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /bob@example\.com/i }));

    // Submit
    const addBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(addBtn);

    // Error mapped to Bob's row
    await waitFor(() => {
      expect(
        screen.getByText("Already a member of this workspace"),
      ).toBeInTheDocument();
    });
  });

  it("shows admin notice when Admin role is selected, hides when Member selected (AC-24)", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal({
      addableRoles: ["admin", "member", "guest"],
    });

    // Default role is Member -> no notice
    expect(
      screen.queryByText(
        "Admins can manage everyone in this workspace, including you.",
      ),
    ).not.toBeInTheDocument();

    // Change role to Admin
    const roleSelect = screen.getByRole("combobox", { name: "Role" });
    await user.click(roleSelect);
    const adminOption = await screen.findByRole("option", { name: "Admin" });
    await user.click(adminOption);

    // Admin notice appears
    expect(
      screen.getByText(
        "Admins can manage everyone in this workspace, including you.",
      ),
    ).toBeInTheDocument();

    // Change role back to Member
    await user.click(roleSelect);
    const memberOption = await screen.findByRole("option", { name: "Member" });
    await user.click(memberOption);

    // Notice disappears
    expect(
      screen.queryByText(
        "Admins can manage everyone in this workspace, including you.",
      ),
    ).not.toBeInTheDocument();
  });

  it("prompts 'Discard changes?' when closing with selected candidate, closes directly when empty (AC-21)", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    const onClose = vi.fn();

    // 1. Empty modal -> close directly
    const { unmount } = renderModal({ onClose });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    unmount();

    // 2. Modal with selected candidate -> prompts discard confirmation
    const onClose2 = vi.fn();
    renderModal({ onClose: onClose2 });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ali");
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /alice@example\.com/i }));

    // Click Cancel
    const cancelBtn2 = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn2);

    // Confirm dialog is shown
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onClose2).not.toHaveBeenCalled();

    // Click "Keep editing"
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(onClose2).not.toHaveBeenCalled();

    // Click Cancel again, then click "Discard"
    await user.click(cancelBtn2);
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it("handles 403 by closing modal, showing error notification, and reloading workspace", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/openstudy/members": () =>
        apiError(403, "FORBIDDEN", "You don't have permission to do this"),
    });

    const user = userEvent.setup();
    const onClose = vi.fn();
    const reloadWorkspace = vi.fn();

    renderModal({ onClose, reloadWorkspace });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ali");
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /alice@example\.com/i }));

    const addBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(addBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(reloadWorkspace).toHaveBeenCalled();
    });
  });
});
