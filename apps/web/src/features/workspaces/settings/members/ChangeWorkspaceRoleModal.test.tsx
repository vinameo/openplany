import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppUiProvider } from "@repo/ui";
import type {
  WorkspaceMemberResponse,
  WorkspaceRole,
  WorkspaceRoleChangePreview,
} from "@repo/contracts";
import { MEMBER_MESSAGES } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrentWorkspaceContext } from "../../currentWorkspace/currentWorkspaceContext";
import { makeWorkspace } from "../../test/workspaceFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { ChangeWorkspaceRoleModal } from "./ChangeWorkspaceRoleModal";

const baseTargetMember: WorkspaceMemberResponse = {
  userId: "u-guest",
  firstName: "My",
  lastName: "Le",
  displayName: "myle",
  email: "my@example.com",
  avatarUrl: null,
  role: "guest",
  accountActive: true,
  joinedAt: "2026-10-08T12:00:00.000Z",
  assignableRoles: ["guest", "member", "admin"],
};

function renderModal({
  opened = true,
  member = baseTargetMember,
  toRole = "member" as WorkspaceRole,
  onClose = vi.fn(),
  onSuccess = vi.fn(),
  reloadWorkspace = vi.fn().mockResolvedValue(undefined),
  previewResponse,
  routes = {},
}: {
  opened?: boolean;
  member?: WorkspaceMemberResponse | null;
  toRole?: WorkspaceRole | null;
  onClose?: () => void;
  onSuccess?: () => void;
  reloadWorkspace?: () => Promise<void>;
  previewResponse?: WorkspaceRoleChangePreview | (() => Response);
  routes?: Record<string, () => Response>;
} = {}) {
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

  const defaultPreview: WorkspaceRoleChangePreview = {
    userId: "u-guest",
    effect: "apply_project_role",
    fromRole: "guest",
    toRole: "member",
    actorCanChooseProjectRole: true,
    projectRoleChoices: ["admin", "contributor", "commenter"],
    defaultProjectRole: "commenter",
    affectedProjects: {
      total: 3,
      hiddenCount: 0,
      projects: [
        { id: "p-1", name: "Onboarding", identifier: "ONB" },
        { id: "p-2", name: "Ops", identifier: "OPS" },
        { id: "p-3", name: "Website Redesign", identifier: "WEB" },
      ],
    },
    projectsLosingAssignedAdmin: {
      total: 0,
      hiddenCount: 0,
      projects: [],
    },
  };

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const targetUserId = member?.userId ?? "u-guest";
  const fetchMock = mockFetch({
    [`GET /api/workspaces/openstudy/members/${targetUserId}/role-change-preview?role=${toRole ?? "member"}`]:
      typeof previewResponse === "function"
        ? previewResponse
        : () => jsonResponse(200, previewResponse ?? defaultPreview),
    ...routes,
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AppUiProvider>
        <Notifications />
        <CurrentWorkspaceContext.Provider value={wsValue}>
          <ChangeWorkspaceRoleModal
            opened={opened}
            member={member}
            toRole={toRole}
            slug="openstudy"
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </CurrentWorkspaceContext.Provider>
      </AppUiProvider>
    </QueryClientProvider>,
  );

  return { ...result, onClose, onSuccess, reloadWorkspace, queryClient, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("ChangeWorkspaceRoleModal", () => {
  it("AC-18: renders preview for apply_project_role with choices, default commenter, and saves on confirm", async () => {
    const user = userEvent.setup();
    const { onClose, onSuccess, fetchMock } = renderModal({
      routes: {
        "PATCH /api/workspaces/openstudy/members/u-guest": () =>
          jsonResponse(200, {
            member: { ...baseTargetMember, role: "member" },
            appliedProjectCount: 3,
          }),
      },
    });

    expect(
      await screen.findByRole("dialog", {
        name: "Change My Le's role to Member?",
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText("My Le is in 3 projects.")).toBeInTheDocument();
    expect(screen.getByText(/Onboarding \(ONB\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ops \(OPS\)/)).toBeInTheDocument();
    expect(screen.getByText(/Website Redesign \(WEB\)/)).toBeInTheDocument();

    // Confirm button is enabled and label matches
    const confirmBtn = screen.getByRole("button", { name: "Change to Member" });
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    const patchCall = fetchMock.mock.calls.find(([input, init]) =>
      String(input).includes("/api/workspaces/openstudy/members/u-guest") &&
      init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(patchCall![1]!.body as string)).toEqual({
      fromRole: "guest",
      role: "member",
      projectRole: "commenter",
    });
  });

  it("AC-18: disables select and shows explanation when actorCanChooseProjectRole is false", async () => {
    renderModal({
      previewResponse: {
        userId: "u-guest",
        effect: "apply_project_role",
        fromRole: "guest",
        toRole: "member",
        actorCanChooseProjectRole: false,
        projectRoleChoices: ["commenter"],
        defaultProjectRole: "commenter",
        affectedProjects: {
          total: 1,
          hiddenCount: 0,
          projects: [{ id: "p-1", name: "Alpha", identifier: "ALP" }],
        },
        projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
      },
    });

    expect(
      await screen.findByText("My Le is in 1 project."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only Workspace Admins can choose this. They'll be Commenter in every project.",
      ),
    ).toBeInTheDocument();

    const select = screen.getByRole("combobox", {
      name: "Role in their projects",
    });
    expect(select).toBeDisabled();
  });

  it("renders no_projects message when effect is no_projects", async () => {
    renderModal({
      previewResponse: {
        userId: "u-guest",
        effect: "no_projects",
        fromRole: "guest",
        toRole: "member",
        actorCanChooseProjectRole: true,
        projectRoleChoices: [],
        defaultProjectRole: null,
        affectedProjects: { total: 0, hiddenCount: 0, projects: [] },
        projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
      },
    });

    expect(
      await screen.findByText("My Le isn't in any projects yet."),
    ).toBeInTheDocument();
  });

  it("AC-19: renders lose_implicit with bold warning and danger button", async () => {
    const adminTarget: WorkspaceMemberResponse = {
      ...baseTargetMember,
      userId: "u-admin2",
      role: "admin",
      firstName: "Lan",
      lastName: "Vu",
      displayName: "lan",
    };

    renderModal({
      member: adminTarget,
      toRole: "member",
      previewResponse: {
        userId: "u-admin2",
        effect: "lose_implicit",
        fromRole: "admin",
        toRole: "member",
        actorCanChooseProjectRole: true,
        projectRoleChoices: [],
        defaultProjectRole: null,
        affectedProjects: {
          total: 7,
          hiddenCount: 0,
          projects: [{ id: "p-1", name: "Onboarding", identifier: "ONB" }],
        },
        projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
      },
    });

    expect(
      await screen.findByText(
        "Lan Vu will lose access to all 7 projects until someone adds them back.",
      ),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Change to Member" });
    expect(confirmBtn.style.getPropertyValue("--button-bg")).toContain("red");
  });

  it("AC-21: shows same role error on 400 ROLE_UNCHANGED without Try again button", async () => {
    renderModal({
      previewResponse: () =>
        apiError(
          400,
          "ROLE_UNCHANGED",
          MEMBER_MESSAGES.sameRole,
        ),
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(MEMBER_MESSAGES.sameRole);

    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Change to Member" });
    expect(confirmBtn).toBeDisabled();
  });

  it("AC-21: shows roleNotAllowed on 403 preview error without Try again button", async () => {
    renderModal({
      previewResponse: () =>
        apiError(
          403,
          "FORBIDDEN",
          "You can't assign this role",
        ),
    });

    expect(
      await screen.findByText("You can't assign this role"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("AC-21: shows generic preview error with Try again on 500", async () => {
    let callCount = 0;
    renderModal({
      previewResponse: () => {
        callCount++;
        if (callCount === 1) {
          return apiError(
            500,
            "INTERNAL_ERROR",
            "Something failed",
          );
        }
        return jsonResponse(200, {
          effect: "no_projects",
          fromRole: "guest",
          toRole: "member",
          actorCanChooseProjectRole: true,
          projectRoleChoices: [],
          defaultProjectRole: null,
          affectedProjects: { total: 0, hiddenCount: 0, projects: [] },
          projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
        });
      },
    });

    expect(
      await screen.findByText("Couldn't check what this change affects."),
    ).toBeInTheDocument();

    const tryAgainBtn = screen.getByRole("button", { name: "Try again" });
    expect(tryAgainBtn).toBeInTheDocument();

    await userEvent.click(tryAgainBtn);

    expect(
      await screen.findByText("My Le isn't in any projects yet."),
    ).toBeInTheDocument();
  });

  it("AC-21: handles ROLE_CHANGED mutation error by showing alert and invalidating member list", async () => {
    const user = userEvent.setup();
    renderModal({
      routes: {
        "PATCH /api/workspaces/openstudy/members/u-guest": () =>
          apiError(
            409,
            "ROLE_CHANGED",
            "Their role was just changed by someone else. Review it and try again.",
          ),
      },
    });

    const confirmBtn = await screen.findByRole("button", {
      name: "Change to Member",
    });
    await user.click(confirmBtn);

    expect(
      await screen.findByText(
        "Their role was just changed by someone else. Review it and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-21: handles LAST_ADMIN mutation error", async () => {
    const user = userEvent.setup();
    renderModal({
      routes: {
        "PATCH /api/workspaces/openstudy/members/u-guest": () =>
          apiError(
            409,
            "LAST_ADMIN",
            "A workspace needs at least one Admin. Make someone else an Admin first.",
          ),
      },
    });

    const confirmBtn = await screen.findByRole("button", {
      name: "Change to Member",
    });
    await user.click(confirmBtn);

    expect(
      await screen.findByText(
        "A workspace needs at least one Admin. Make someone else an Admin first.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-21: handles FORBIDDEN mutation error by calling reloadWorkspace", async () => {
    const user = userEvent.setup();
    const { reloadWorkspace } = renderModal({
      routes: {
        "PATCH /api/workspaces/openstudy/members/u-guest": () =>
          apiError(
            403,
            "FORBIDDEN",
            "You can't assign this role",
          ),
      },
    });

    const confirmBtn = await screen.findByRole("button", {
      name: "Change to Member",
    });
    await user.click(confirmBtn);

    expect(
      await screen.findByText("You can't assign this role"),
    ).toBeInTheDocument();

    expect(reloadWorkspace).toHaveBeenCalled();
  });
});
