import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type {
  ProjectListItem,
  StateListResponse,
  StateResponse,
} from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../../../routes";
import { makeSession } from "../../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { AuthProvider } from "../../../auth/AuthProvider";
import { makeWorkspace } from "../../../workspaces/test/workspaceFixtures";

const baseWorkspace = makeWorkspace({
  id: "ws-1",
  slug: "the-firsts",
  name: "The Firsts Workspace",
  timezone: "Asia/Ho_Chi_Minh",
  role: "admin",
  permissions: ["workspace.states.manage"],
});

const sampleProject: ProjectListItem = {
  id: "p-11",
  name: "The First Project",
  identifier: "TFP11",
  description: "Initial description",
  icon: { name: "rocket", color: "#15AABF" },
  coverKey: "cover-01",
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
  timezone: null,
  effectiveTimezone: "Asia/Ho_Chi_Minh",
  members: [],
  memberCount: 2,
  role: "admin",
  permissions: [
    "project.settings.view",
    "project.states.view",
    "project.states.manage",
  ],
};

const defaultStates: StateResponse[] = [
  {
    id: "def-backlog",
    name: "Backlog",
    group: "backlog",
    color: "#8E98A8",
    level: "default",
    workItemCount: 0,
  },
  {
    id: "def-todo",
    name: "Todo",
    group: "planned",
    color: "#5B6B82",
    level: "default",
    workItemCount: 1,
  },
  {
    id: "def-in-progress",
    name: "In Progress",
    group: "active",
    color: "#E08A1E",
    level: "default",
    workItemCount: 2,
  },
  {
    id: "ws-qa",
    name: "QA",
    group: "active",
    color: "#3E7BD6",
    level: "workspace",
    workItemCount: 3,
  },
  {
    id: "proj-review",
    name: "Review",
    group: "active",
    color: "#7A5CC7",
    level: "project",
    workItemCount: 4,
  },
  {
    id: "def-done",
    name: "Done",
    group: "finished",
    color: "#2F9E6E",
    level: "default",
    workItemCount: 5,
  },
  {
    id: "def-cancelled",
    name: "Cancelled",
    group: "cancelled",
    color: "#B05A5A",
    level: "default",
    workItemCount: 0,
  },
];

const sampleStatesResponse: StateListResponse = {
  states: defaultStates,
  ownCount: 1,
  ownMax: 50,
  initialStateId: "def-backlog",
};

function renderStatesApp({
  initialEntries = ["/the-firsts/projects/TFP11/settings/states"],
  project = sampleProject,
  workspace = baseWorkspace,
  statesResponse = sampleStatesResponse,
  extraRoutes = {},
}: {
  initialEntries?: string[];
  project?: ProjectListItem;
  workspace?: ReturnType<typeof makeWorkspace>;
  statesResponse?: StateListResponse;
  extraRoutes?: Record<
    string,
    (init?: RequestInit) => Response | Promise<Response>
  >;
} = {}) {
  mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, {
        workspaces: [workspace],
        lastWorkspaceSlug: "the-firsts",
      }),
    "GET /api/workspaces/the-firsts": () => jsonResponse(200, workspace),
    "GET /api/workspaces/the-firsts/projects/TFP11": () =>
      jsonResponse(200, { project }),
    "GET /api/workspaces/the-firsts/projects/TFP11/states": () =>
      jsonResponse(200, statesResponse),
    ...extraRoutes,
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries,
  });

  const utils = render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );

  return { router, ...utils };
}

afterEach(() => {
  cleanup();
  notifications.clean();
  vi.unstubAllGlobals();
});

describe("ProjectStatesPage", () => {
  it("renders three levels of states, level badges, and workItemCount for managers (AC-04, AC-06)", async () => {
    renderStatesApp();

    await waitFor(() => {
      expect(screen.getByText("1 of 50 project states")).toBeInTheDocument();
    });

    // In Progress has Default badge
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    const inProgressRow = screen.getByText("In Progress").closest("li");
    expect(inProgressRow).toHaveTextContent("Default");
    expect(inProgressRow).toHaveTextContent("2 work items");

    // QA has From workspace badge
    expect(screen.getByText("QA")).toBeInTheDocument();
    const qaRow = screen.getByText("QA").closest("li");
    expect(qaRow).toHaveTextContent("From workspace");
    expect(qaRow).toHaveTextContent("3 work items");

    // Review (project level) has no badge, has action menu
    expect(screen.getByText("Review")).toBeInTheDocument();
    const reviewRow = screen.getByText("Review").closest("li");
    expect(reviewRow).not.toHaveTextContent("Default");
    expect(reviewRow).not.toHaveTextContent("From workspace");
    expect(reviewRow).toHaveTextContent("4 work items");
    expect(screen.getByTestId("state-menu-proj-review")).toBeInTheDocument();
  });

  it("hides workItemCount and actions when actor lacks project.states.manage (AC-06)", async () => {
    const viewerProject: ProjectListItem = {
      ...sampleProject,
      permissions: ["project.settings.view", "project.states.view"],
    };

    renderStatesApp({ project: viewerProject });

    await waitFor(() => {
      expect(screen.getByText("1 of 50 project states")).toBeInTheDocument();
    });

    expect(screen.queryByText(/work item/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add state/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("state-menu-proj-review"),
    ).not.toBeInTheDocument();
  });

  it("shows 'Edit in workspace settings' link only when actor has workspace.states.manage (AC-40)", async () => {
    // Case 1: Has workspace.states.manage
    const { unmount } = renderStatesApp();
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Edit in workspace settings/i }),
      ).toBeInTheDocument();
    });
    const link = screen.getByRole("link", {
      name: /Edit in workspace settings/i,
    });
    expect(link).toHaveAttribute("href", "/the-firsts/settings/states");
    unmount();

    // Case 2: Lacks workspace.states.manage
    const noWorkspaceManage = makeWorkspace({
      ...baseWorkspace,
      permissions: [],
    });
    renderStatesApp({ workspace: noWorkspaceManage });
    await waitFor(() => {
      expect(screen.getByText("1 of 50 project states")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: /Edit in workspace settings/i }),
    ).not.toBeInTheDocument();
  });

  it("displays Access Denied when actor lacks project.states.view (AC-48)", async () => {
    const noViewProject: ProjectListItem = {
      ...sampleProject,
      permissions: ["project.settings.view"],
    };

    const statesApiMock = vi.fn();
    renderStatesApp({
      project: noViewProject,
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/states": () => {
          statesApiMock();
          return jsonResponse(200, sampleStatesResponse);
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Access Denied");
    });

    expect(statesApiMock).not.toHaveBeenCalled();
    expect(
      screen.queryByText("1 of 50 project states"),
    ).not.toBeInTheDocument();
  });

  it("handles loading and error states with retry (AC-50)", async () => {
    let callCount = 0;
    renderStatesApp({
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/states": () => {
          callCount++;
          if (callCount === 1) {
            return jsonResponse(500, {
              code: "INTERNAL_ERROR",
              message: "Server error",
            });
          }
          return jsonResponse(200, sampleStatesResponse);
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Couldn't load states.")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: "Try again" });
    const user = userEvent.setup();
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("1 of 50 project states")).toBeInTheDocument();
    });
  });

  it("shows ChangeStateGroupModal on 409 STATE_GROUP_CHANGE_UNCONFIRMED and resubmits with confirmGroupChange: true (AC-39, AC-42)", async () => {
    const user = userEvent.setup();
    let patchCallCount = 0;
    let lastPatchBody: unknown = null;

    renderStatesApp({
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/projects/TFP11/states/proj-review": (
          req,
        ) => {
          patchCallCount++;
          const body = req?.body ? JSON.parse(req.body as string) : {};
          lastPatchBody = body;

          if (patchCallCount === 1) {
            return apiError(
              409,
              "STATE_GROUP_CHANGE_UNCONFIRMED",
              "Confirm group change",
              { count: 12 },
            );
          }

          return jsonResponse(200, {
            state: {
              ...defaultStates[4]!,
              group: "finished",
            },
          });
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-menu-proj-review")).toBeInTheDocument();
    });

    // Open menu and click Edit
    await user.click(screen.getByTestId("state-menu-proj-review"));
    await user.click(screen.getByTestId("state-menu-edit"));

    // Select new group "Finished"
    const groupSelect = screen.getByTestId("state-group-select");
    await user.click(groupSelect);
    const finishedOption = await screen.findByRole("option", {
      name: "Finished",
    });
    await user.click(finishedOption);

    // Save
    await user.click(screen.getByTestId("state-form-save"));

    // Confirmation modal appears with 12 items
    await waitFor(() => {
      expect(screen.getByText('Change group of "Review"?')).toBeInTheDocument();
    });
    expect(
      screen.getByText("12 work items in this state will count as Finished."),
    ).toBeInTheDocument();
    expect(lastPatchBody).toEqual({ group: "finished" });

    // Confirm change
    await user.click(screen.getByRole("button", { name: "Change group" }));

    // Resubmitted with confirmGroupChange: true
    await waitFor(() => {
      expect(lastPatchBody).toEqual({
        group: "finished",
        confirmGroupChange: true,
      });
    });
    expect(patchCallCount).toBe(2);
  });

  it("refetches states on 409 STATE_NAME_TAKEN (AC-49)", async () => {
    const user = userEvent.setup();
    let getStatesCallCount = 0;

    renderStatesApp({
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/states": () => {
          getStatesCallCount++;
          return jsonResponse(200, sampleStatesResponse);
        },
        "POST /api/workspaces/the-firsts/projects/TFP11/states": () => {
          return apiError(
            409,
            "STATE_NAME_TAKEN",
            "A state with this name already exists.",
          );
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("add-state-btn-active")).toBeInTheDocument();
    });
    expect(getStatesCallCount).toBe(1);

    await user.click(screen.getByTestId("add-state-btn-active"));
    const nameInput = screen.getByTestId("state-name-input");
    await user.type(nameInput, "Duplicate");

    await user.click(screen.getByTestId("state-form-save"));

    // Displays name error under input
    await waitFor(() => {
      expect(
        screen.getByText("A state with this name already exists."),
      ).toBeInTheDocument();
    });

    // Refetches query
    await waitFor(() => {
      expect(getStatesCallCount).toBeGreaterThan(1);
    });
  });

  it("opens DeleteStateModal on delete click and sends DELETE with replacementStateId (AC-24)", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    renderStatesApp({
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/states": () => {
          return jsonResponse(200, sampleStatesResponse);
        },
        "DELETE /api/workspaces/the-firsts/projects/TFP11/states/proj-review":
          () => {
            deleteCalled = true;
            return jsonResponse(204, null);
          },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-menu-proj-review")).toBeInTheDocument();
    });

    // Open menu and click Delete
    await user.click(screen.getByTestId("state-menu-proj-review"));
    await user.click(screen.getByTestId("state-menu-delete"));

    // Delete modal opens
    await waitFor(() => {
      expect(screen.getByTestId("delete-state-modal")).toBeInTheDocument();
    });
    expect(screen.getByText('Delete "Review"?')).toBeInTheDocument();

    // Confirm deletion
    await user.click(screen.getByTestId("delete-state-confirm-button"));

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });

    const deleteCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => call[1]?.method === "DELETE");
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toContain(
      "replacementStateId=def-in-progress",
    );

    // Modal closes
    await waitFor(() => {
      expect(
        screen.queryByTestId("delete-state-modal"),
      ).not.toBeInTheDocument();
    });
  });
});
