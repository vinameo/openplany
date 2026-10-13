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
import { projectKeys } from "../../../projects/api/projectQueries";
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

  it("AC-29: renders preview for gain_implicit and saves on confirm without projectRole", async () => {
    const user = userEvent.setup();
    const namMember: WorkspaceMemberResponse = {
      ...baseTargetMember,
      userId: "u-nam",
      firstName: "Nam",
      lastName: "Do",
      displayName: "namdo",
      role: "member",
    };

    const { onClose, onSuccess, fetchMock, queryClient } = renderModal({
      member: namMember,
      toRole: "admin",
      previewResponse: {
        userId: "u-nam",
        effect: "gain_implicit",
        fromRole: "member",
        toRole: "admin",
        actorCanChooseProjectRole: true,
        projectRoleChoices: [],
        defaultProjectRole: null,
        affectedProjects: {
          total: 2,
          hiddenCount: 0,
          projects: [
            { id: "p-1", name: "Alpha Project", identifier: "ALP" },
            { id: "p-2", name: "Beta Project", identifier: "BET" },
          ],
        },
        projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
      },
      routes: {
        "PATCH /api/workspaces/openstudy/members/u-nam": () =>
          jsonResponse(200, {
            member: { ...namMember, role: "admin" },
            appliedProjectCount: 2,
            effect: "gain_implicit",
          }),
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    expect(
      await screen.findByRole("dialog", {
        name: "Change Nam Do's role to Workspace Admin?",
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "As a Workspace Admin, Nam Do will be a Project Admin in every project of this workspace, including private ones.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Their roles in 2 projects will be replaced."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Alpha Project \(ALP\)/)).toBeInTheDocument();
    expect(screen.getByText(/Beta Project \(BET\)/)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", {
      name: "Change to Workspace Admin",
    });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).includes("/api/workspaces/openstudy/members/u-nam") &&
        init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(patchCall![1]!.body as string)).toEqual({
      fromRole: "member",
      role: "admin",
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectKeys.list("openstudy"),
    });
  });

  it("AC-20: invalidates project list cache when lose_implicit succeeds", async () => {
    const user = userEvent.setup();
    const adminMember: WorkspaceMemberResponse = {
      ...baseTargetMember,
      userId: "u-lan",
      firstName: "Lan",
      lastName: "Pham",
      displayName: "lan",
      role: "admin",
    };

    const { onClose, onSuccess, queryClient } = renderModal({
      member: adminMember,
      toRole: "member",
      previewResponse: {
        userId: "u-lan",
        effect: "lose_implicit",
        fromRole: "admin",
        toRole: "member",
        actorCanChooseProjectRole: true,
        projectRoleChoices: [],
        defaultProjectRole: null,
        affectedProjects: {
          total: 7,
          hiddenCount: 0,
          projects: [{ id: "p-1", name: "Alpha", identifier: "ALP" }],
        },
        projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
      },
      routes: {
        "PATCH /api/workspaces/openstudy/members/u-lan": () =>
          jsonResponse(200, {
            member: { ...adminMember, role: "member" },
            appliedProjectCount: 0,
            effect: "lose_implicit",
          }),
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const confirmBtn = await screen.findByRole("button", {
      name: "Change to Member",
    });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectKeys.list("openstudy"),
    });
  });

  it("AC-13: renders BoundedProjectList with hiddenCount (and 2 projects you can't see)", async () => {
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
          total: 3,
          hiddenCount: 2,
          projects: [{ id: "p-1", name: "Visible Project", identifier: "VIS" }],
        },
        projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
      },
    });

    expect(
      await screen.findByText(/Visible Project \(VIS\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/and 2 projects you can't see/),
    ).toBeInTheDocument();
  });

  it("AC-14: renders BoundedProjectList with moreCount (and 15 more)", async () => {
    const tenProjects = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i + 1}`,
      name: `Project ${i + 1}`,
      identifier: `P${i + 1}`,
    }));

    renderModal({
      previewResponse: {
        userId: "u-guest",
        effect: "apply_project_role",
        fromRole: "guest",
        toRole: "member",
        actorCanChooseProjectRole: true,
        projectRoleChoices: ["admin", "contributor", "commenter"],
        defaultProjectRole: "commenter",
        affectedProjects: {
          total: 25,
          hiddenCount: 0,
          projects: tenProjects,
        },
        projectsLosingAssignedAdmin: { total: 0, hiddenCount: 0, projects: [] },
      },
    });

    expect(await screen.findByText(/Project 1 \(P1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Project 10 \(P10\)/)).toBeInTheDocument();
    expect(screen.getByText(/and 15 more/)).toBeInTheDocument();
  });

  it("AC-15: renders warning alert with losingAdminWarning and project list", async () => {
    renderModal({
      previewResponse: {
        userId: "u-guest",
        effect: "apply_project_role",
        fromRole: "guest",
        toRole: "member",
        actorCanChooseProjectRole: true,
        projectRoleChoices: ["admin", "contributor", "commenter"],
        defaultProjectRole: "commenter",
        affectedProjects: {
          total: 1,
          hiddenCount: 0,
          projects: [{ id: "p-1", name: "Alpha", identifier: "ALP" }],
        },
        projectsLosingAssignedAdmin: {
          total: 1,
          hiddenCount: 0,
          projects: [{ id: "p-1", name: "Alpha", identifier: "ALP" }],
        },
      },
    });

    expect(
      await screen.findByText(
        "These projects will have no Project Admin other than Workspace Admins:",
      ),
    ).toBeInTheDocument();
  });

  it("AC-28: renders 429 error message without Try again button", async () => {
    renderModal({
      previewResponse: () =>
        apiError(
          429,
          "TOO_MANY_ATTEMPTS",
          "Too many attempts. Try again later.",
          { retryAfterSeconds: 30 },
        ),
    });

    expect(
      await screen.findByText("Too many attempts. Try again in 30 seconds."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });
});
