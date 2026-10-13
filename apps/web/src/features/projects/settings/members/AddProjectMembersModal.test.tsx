import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppUiProvider } from "@repo/ui";
import type { ProjectMemberCandidate, ProjectRole } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { AddProjectMembersModal } from "./AddProjectMembersModal";

import { CurrentProjectContext } from "../../detail/currentProjectContext";
import type { SubmitOutcome } from "../../../members/AddMembersModalFrame";
import { SOMETHING_WENT_WRONG } from "../../../members/membersMessages";
import { projectKeys } from "../../api/projectQueries";

function renderModal({
  opened = true,
  onClose = vi.fn(),
  slug = "ws-1",
  identifier = "P1",
  addableRoles = [
    "admin",
    "contributor",
    "commenter",
    "viewer",
  ] as ProjectRole[],
  canSeeEmail = true,
  onSubmit,
  reload = vi.fn().mockResolvedValue(undefined),
}: {
  opened?: boolean;
  onClose?: () => void;
  slug?: string;
  identifier?: string;
  addableRoles?: ProjectRole[];
  canSeeEmail?: boolean;
  onSubmit?: (
    body: { members: { userId: string; role: ProjectRole }[] },
    rowIdByIndex: readonly string[],
  ) => Promise<SubmitOutcome>;
  reload?: () => Promise<void>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const projectContextValue = {
    project: null,
    status: "ready" as const,
    retry: vi.fn(),
    reload,
    applyProjectUpdate: vi.fn(),
  };

  const result = render(
    <QueryClientProvider client={queryClient}>
      <CurrentProjectContext.Provider value={projectContextValue}>
        <AppUiProvider>
          <Notifications />
          <AddProjectMembersModal
            opened={opened}
            onClose={onClose}
            slug={slug}
            identifier={identifier}
            addableRoles={addableRoles}
            canSeeEmail={canSeeEmail}
            onSubmit={onSubmit}
          />
        </AppUiProvider>
      </CurrentProjectContext.Provider>
    </QueryClientProvider>,
  );

  return { ...result, onClose, queryClient, onSubmit, reload };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

const candidates: ProjectMemberCandidate[] = [
  {
    userId: "u-alice",
    email: "alice@openplany.dev",
    firstName: "Alice",
    lastName: "Smith",
    displayName: "Alice Smith",
    avatarUrl: null,
    status: "addable",
    addableRoles: ["admin", "contributor", "commenter", "viewer"],
  },
  {
    userId: "u-hoa",
    email: "hoa@openplany.dev",
    firstName: "Hoa",
    lastName: "Le",
    displayName: "Hoa Le",
    avatarUrl: null,
    status: "already_member",
    addableRoles: [],
  },
  {
    userId: "u-kai",
    email: "kai@openplany.dev",
    firstName: "Kai",
    lastName: "Tran",
    displayName: "Kai Tran",
    avatarUrl: null,
    status: "workspace_admin",
    addableRoles: [],
  },
  {
    userId: "u-binh",
    email: "binh@openplany.dev",
    firstName: "Binh",
    lastName: "Pham",
    displayName: "Binh Pham",
    avatarUrl: null,
    status: "addable",
    addableRoles: ["viewer"],
  },
  {
    userId: "u-admin-cli",
    email: "admin@localhost",
    firstName: "Admin",
    lastName: "Local",
    displayName: "Admin Local",
    avatarUrl: null,
    status: "addable",
    addableRoles: ["admin", "contributor", "commenter", "viewer"],
  },
];

describe("AddProjectMembersModal", () => {
  it("AC-08: does not call API when query is too short or not a full email in exact mode", async () => {
    let fetchCount = 0;
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () => {
        fetchCount += 1;
        return jsonResponse(200, { candidates });
      },
    });

    const user = userEvent.setup();

    // 1. In contains mode: typing 1 char shows "Type at least 3 characters"
    const { unmount } = renderModal({ canSeeEmail: true });
    const inputContains = screen.getByRole("textbox", { name: "Email" });
    await user.type(inputContains, "a");
    expect(screen.getByText("Type at least 3 characters")).toBeInTheDocument();
    expect(fetchCount).toBe(0);

    // type 2 more chars
    await user.type(inputContains, "li");
    await waitFor(() => {
      expect(screen.getByText("alice@openplany.dev")).toBeInTheDocument();
    });
    expect(fetchCount).toBeGreaterThan(0);
    unmount();

    // 2. In exact mode: typing partial email shows "Type the full email address"
    fetchCount = 0;
    renderModal({ canSeeEmail: false });
    const inputExact = screen.getByRole("textbox", { name: "Email" });
    await user.type(inputExact, "alice@");
    expect(screen.getByText("Type the full email address")).toBeInTheDocument();
    expect(fetchCount).toBe(0);

    // type full email
    await user.type(inputExact, "openplany.dev");
    await waitFor(() => {
      expect(screen.getByText("alice@openplany.dev")).toBeInTheDocument();
    });
    expect(fetchCount).toBeGreaterThan(0);
  });

  it("AC-10: shows dimmed labels for already member and workspace admin", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "test");

    await waitFor(() => {
      expect(screen.getByText("Already in this project")).toBeInTheDocument();
      expect(
        screen.getByText("Workspace Admin · has access"),
      ).toBeInTheDocument();
    });

    const alreadyMemberOption = screen.getByRole("option", {
      name: /hoa@openplany\.dev/i,
    });
    expect(alreadyMemberOption).toHaveAttribute(
      "data-combobox-disabled",
      "true",
    );

    const wsAdminOption = screen.getByRole("option", {
      name: /kai@openplany\.dev/i,
    });
    expect(wsAdminOption).toHaveAttribute("data-combobox-disabled", "true");
  });

  it("AC-13: clamps role and displays notice when candidate workspace role restricts project role", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal();

    // Initial role is Contributor (DEFAULT_ADDED_PROJECT_ROLE)
    const roleSelect = screen.getByRole("combobox", { name: "Role" });
    expect(roleSelect).toHaveValue("Contributor");

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "binh");

    await waitFor(() => {
      expect(screen.getByText("binh@openplany.dev")).toBeInTheDocument();
    });

    // Select Binh (workspace guest)
    await user.click(
      screen.getByRole("option", { name: /binh@openplany\.dev/i }),
    );

    // Role lowered to Viewer automatically
    expect(roleSelect).toHaveValue("Viewer");
    expect(
      screen.getByText("Limited to Viewer by their workspace role."),
    ).toBeInTheDocument();
  });

  it("AC-19: shows Already selected for candidates chosen in another row", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal();

    // Row 1: Select Alice
    const input1 = screen.getByRole("textbox", { name: "Email" });
    await user.type(input1, "ali");
    await waitFor(() => {
      expect(screen.getByText("alice@openplany.dev")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    // Add Row 2
    await user.click(screen.getByRole("button", { name: "+ Add more" }));

    // Row 2: Search Alice again
    const input2 = screen.getByRole("textbox", { name: "Email" });
    await user.type(input2, "ali");

    await waitFor(() => {
      expect(screen.getByText("Already selected")).toBeInTheDocument();
    });
    const optionAlice = screen.getByRole("option", {
      name: /alice@openplany\.dev/i,
    });
    expect(optionAlice).toHaveAttribute("data-combobox-disabled", "true");
  });

  it("AC-21: hides + Add more when row count reaches 20", async () => {
    const user = userEvent.setup();
    renderModal();

    const addMoreBtn = screen.getByRole("button", { name: "+ Add more" });

    // Add 19 more rows (total 20 rows)
    for (let i = 1; i < 20; i++) {
      await user.click(addMoreBtn);
    }

    // At 20 rows, "+ Add more" button is hidden
    expect(
      screen.queryByRole("button", { name: "+ Add more" }),
    ).not.toBeInTheDocument();
  });

  it("AC-24: displays notice when Project Admin role is selected", async () => {
    const user = userEvent.setup();
    renderModal();

    const roleSelect = screen.getByRole("combobox", { name: "Role" });
    await user.click(roleSelect);
    await user.click(
      await screen.findByRole("option", { name: "Project Admin" }),
    );

    expect(
      screen.getByText(
        "Project Admins can manage everyone in this project, including you.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-25: confirms discard changes when dirty, closes directly when clean", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = renderModal({ onClose });

    // Clean modal: clicking Cancel button closes directly
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    // Dirty modal with selected candidate
    const onCloseDirty = vi.fn();
    renderModal({ onClose: onCloseDirty });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ali");
    await waitFor(() => {
      expect(screen.getByText("alice@openplany.dev")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    // Clicking Cancel opens discard confirmation
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onCloseDirty).not.toHaveBeenCalled();

    // Click Discard confirms
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onCloseDirty).toHaveBeenCalledTimes(1);
  });

  it("AC-42: in exact mode, typing admin@localhost qualifies as a full email", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    renderModal({ canSeeEmail: false });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "admin@localhost");

    await waitFor(() => {
      expect(screen.getByText("admin@localhost")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /admin@localhost/i }));
    expect(screen.getByText("Admin Local")).toBeInTheDocument();
  });

  it("shows 429 rate limit error when candidate search exceeds limit", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        apiError(429, "RATE_LIMITED", "Too many searches", {
          retryAfterSeconds: 45,
        }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "test");

    await waitFor(() => {
      expect(
        screen.getByText("Too many searches. Try again in 45 seconds."),
      ).toBeInTheDocument();
    });
  });

  it("AC-13: shows error under role select when server rejects with fields members.0.role, and clears error when role changed", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(409, "MEMBERS_NOT_ADDABLE", "Some people couldn't be added", {
          fields: {
            "members.0.role":
              "This role is above what their workspace role allows.",
          },
        }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /alice@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    expect(
      await screen.findByText(
        "This role is above what their workspace role allows.",
      ),
    ).toBeInTheDocument();

    // Selecting another role clears the role error
    const roleSelect = screen.getByRole("combobox", { name: "Role" });
    await user.click(roleSelect);
    await user.click(screen.getByRole("option", { name: "Project Admin" }));

    await waitFor(() => {
      expect(
        screen.queryByText(
          "This role is above what their workspace role allows.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("AC-17 & AC-20: shows error under email input when server rejects with fields members.0.userId, and clears error when candidate changed", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(409, "MEMBERS_NOT_ADDABLE", "Some people couldn't be added", {
          fields: {
            "members.0.userId":
              "This person is already a member of this project",
          },
        }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /alice@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    expect(
      await screen.findByText(
        "This person is already a member of this project",
      ),
    ).toBeInTheDocument();

    // Clearing candidate clears the error
    const clearBtn = screen.getByRole("button", { name: "Clear selection" });
    await user.click(clearBtn);

    await waitFor(() => {
      expect(
        screen.queryByText("This person is already a member of this project"),
      ).not.toBeInTheDocument();
    });
  });

  it("AC-23: shows You can't assign this role toast, closes modal, and reloads project on 403 roleNotAllowed", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(403, "FORBIDDEN", "You can't assign this role"),
    });

    const user = userEvent.setup();
    const reload = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ reload, onClose });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /alice@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    expect(
      await screen.findByText("You can't assign this role"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(reload).toHaveBeenCalled();
    });
  });

  it("AC-23: shows You don't have permission to do this toast, closes modal, and reloads project on generic 403", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(403, "FORBIDDEN", "Access denied"),
    });

    const user = userEvent.setup();
    const reload = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ reload, onClose });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /alice@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    expect(
      await screen.findByText("You don't have permission to do this"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(reload).toHaveBeenCalled();
    });
  });

  it("AC-22: closes modal and reloads project on 404", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(404, "PROJECT_NOT_FOUND", "Project not found"),
    });

    const user = userEvent.setup();
    const reload = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ reload, onClose });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /alice@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(reload).toHaveBeenCalled();
    });
  });

  it("marks the member list stale on 403 so addableRoles is refetched", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(403, "FORBIDDEN", "You don't have permission to do this"),
    });

    const user = userEvent.setup();
    const { queryClient } = renderModal();
    queryClient.setQueryData(projectKeys.members("ws-1", "P1"), {
      members: [],
      total: 0,
      truncated: false,
      addableRoles: ["admin", "contributor"],
    });

    await user.type(screen.getByRole("textbox", { name: "Email" }), "alice");
    await user.click(
      await screen.findByRole("option", { name: /alice@openplany\.dev/i }),
    );
    await user.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() => {
      expect(
        queryClient.getQueryState(projectKeys.members("ws-1", "P1"))
          ?.isInvalidated,
      ).toBe(true);
    });
  });

  it("shows a generic alert instead of an unhandled rejection when submit throws", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));

    const user = userEvent.setup();
    renderModal({ onSubmit });

    await user.type(screen.getByRole("textbox", { name: "Email" }), "alice");
    await user.click(
      await screen.findByRole("option", { name: /alice@openplany\.dev/i }),
    );
    await user.click(screen.getByRole("button", { name: "Add member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      SOMETHING_WENT_WRONG,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "members.add.submit_failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("shows 429 rate limit alert with retryAfterSeconds on add submit", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(429, "RATE_LIMITED", "Too many attempts", {
          retryAfterSeconds: 20,
        }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /alice@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    expect(
      await screen.findByText("Too many attempts. Try again in 20 seconds."),
    ).toBeInTheDocument();
  });

  it("shows checkFields alert when 409 fields do not match any row", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(409, "MEMBERS_NOT_ADDABLE", "Some people couldn't be added", {
          fields: {
            "members.99.userId": "Unknown row error",
          },
        }),
    });

    const user = userEvent.setup();
    renderModal();

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /alice@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /alice@openplany\.dev/i }),
    );

    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    expect(
      await screen.findByText("Check the highlighted fields"),
    ).toBeInTheDocument();
  });

  it("AC-35: renders full-screen modal when viewport is mobile (< 48em)", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 48em)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    renderModal();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // In Mantine 7, fullScreen modal applies data-full-screen or full-screen class
    expect(dialog.className).toMatch(/content/i);
  });

  it("connects roleNotice, notice(row), error, and roleError via aria-describedby", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, { candidates }),
      "POST /api/workspaces/ws-1/projects/P1/members": () =>
        apiError(409, "MEMBERS_NOT_ADDABLE", "Some people couldn't be added", {
          fields: {
            "members.0.userId": "This person is no longer in this workspace.",
            "members.0.role":
              "This role is above what their workspace role allows.",
          },
        }),
    });

    const user = userEvent.setup();
    renderModal();

    // 1. Select Binh Pham who is limited to Guest
    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "binh");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /binh@openplany\.dev/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /binh@openplany\.dev/i }),
    );

    // roleNotice is displayed
    const roleNotice = screen.getByText(
      "Limited to Viewer by their workspace role.",
    );
    expect(roleNotice).toHaveAttribute("id");
    const roleSelect = screen.getByRole("combobox", { name: "Role" });
    expect(roleSelect.getAttribute("aria-describedby")).toContain(
      roleNotice.id,
    );

    // 2. Submit to trigger 409 field errors
    const submitBtn = screen.getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    const candidateError = await screen.findByText(
      "This person is no longer in this workspace.",
    );
    const roleError = await screen.findByText(
      "This role is above what their workspace role allows.",
    );

    expect(candidateError).toHaveAttribute("id");
    expect(roleError).toHaveAttribute("id");

    // Email component wrapper has aria-describedby containing candidateError id
    const emailWrapper = screen.getByLabelText("Email");
    expect(emailWrapper.getAttribute("aria-describedby")).toContain(
      candidateError.id,
    );

    // Role select has aria-describedby containing roleError id
    expect(roleSelect.getAttribute("aria-describedby")).toContain(roleError.id);
  });
});
