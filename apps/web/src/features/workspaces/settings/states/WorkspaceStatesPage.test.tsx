import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type { StateListResponse, StateResponse } from "@repo/contracts";
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
  permissions: ["workspace.settings.view", "workspace.states.manage"],
});

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

function renderWorkspaceStatesApp({
  initialEntries = ["/the-firsts/settings/states"],
  workspace = baseWorkspace,
  statesResponse = sampleStatesResponse,
  extraRoutes = {},
}: {
  initialEntries?: string[];
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
    "GET /api/workspaces/the-firsts/states": () =>
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

describe("WorkspaceStatesPage", () => {
  it("renders workspace states, Default badges, and workItemCount for managers (AC-02)", async () => {
    renderWorkspaceStatesApp();

    await waitFor(() => {
      expect(screen.getByText("1 of 50 workspace states")).toBeInTheDocument();
    });

    // Default state In Progress has Default badge and no action menu
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    const inProgressRow = screen.getByText("In Progress").closest("li");
    expect(inProgressRow).toHaveTextContent("Default");
    expect(inProgressRow).toHaveTextContent("2 work items");
    expect(
      screen.queryByTestId("state-menu-def-in-progress"),
    ).not.toBeInTheDocument();

    // Workspace state QA has no level badge, has action menu
    expect(screen.getByText("QA")).toBeInTheDocument();
    const qaRow = screen.getByText("QA").closest("li");
    expect(qaRow).not.toHaveTextContent("Default");
    expect(qaRow).not.toHaveTextContent("From workspace");
    expect(qaRow).toHaveTextContent("3 work items");
    expect(screen.getByTestId("state-menu-ws-qa")).toBeInTheDocument();
  });

  it("hides workItemCount and actions when member lacks workspace.states.manage (AC-03)", async () => {
    const viewerWorkspace = makeWorkspace({
      ...baseWorkspace,
      permissions: ["workspace.settings.view"],
    });

    renderWorkspaceStatesApp({ workspace: viewerWorkspace });

    await waitFor(() => {
      expect(screen.getByText("1 of 50 workspace states")).toBeInTheDocument();
    });

    expect(screen.queryByText(/work item/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add state/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("state-menu-ws-qa")).not.toBeInTheDocument();
  });

  it("displays Access Denied when member lacks workspace.settings.view (AC-01)", async () => {
    const noViewWorkspace = makeWorkspace({
      ...baseWorkspace,
      permissions: [],
    });

    const statesApiMock = vi.fn();
    renderWorkspaceStatesApp({
      workspace: noViewWorkspace,
      extraRoutes: {
        "GET /api/workspaces/the-firsts/states": () => {
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
      screen.queryByText("1 of 50 workspace states"),
    ).not.toBeInTheDocument();
  });

  it("handles loading and error states with retry (AC-50)", async () => {
    let callCount = 0;
    renderWorkspaceStatesApp({
      extraRoutes: {
        "GET /api/workspaces/the-firsts/states": () => {
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
      expect(screen.getByText("1 of 50 workspace states")).toBeInTheDocument();
    });
  });

  it("shows ChangeStateGroupModal on 409 STATE_GROUP_CHANGE_UNCONFIRMED and resubmits with confirmGroupChange: true (AC-39, AC-42)", async () => {
    const user = userEvent.setup();
    let patchCallCount = 0;
    let lastPatchBody: unknown = null;

    renderWorkspaceStatesApp({
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/states/ws-qa": (req) => {
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
              ...defaultStates[3]!,
              group: "finished",
            },
          });
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-menu-ws-qa")).toBeInTheDocument();
    });

    // Open menu and click Edit
    await user.click(screen.getByTestId("state-menu-ws-qa"));
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
      expect(screen.getByText('Change group of "QA"?')).toBeInTheDocument();
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
    // The saved change closes the edit row
    await waitFor(() => {
      expect(screen.queryByTestId("state-name-input")).not.toBeInTheDocument();
    });
  });

  it("keeps the edit row open with the name error when the confirmed change hits STATE_NAME_TAKEN", async () => {
    const user = userEvent.setup();
    let patchCallCount = 0;

    renderWorkspaceStatesApp({
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/states/ws-qa": () => {
          patchCallCount++;
          if (patchCallCount === 1) {
            return apiError(
              409,
              "STATE_GROUP_CHANGE_UNCONFIRMED",
              "Confirm group change",
              { count: 2 },
            );
          }
          return apiError(409, "STATE_NAME_TAKEN", "Name taken", {
            fields: { name: "A state with this name already exists." },
          });
        },
      },
    });

    await user.click(await screen.findByTestId("state-menu-ws-qa"));
    await user.click(screen.getByTestId("state-menu-edit"));
    const nameInput = screen.getByTestId("state-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "Review");
    await user.click(screen.getByTestId("state-group-select"));
    await user.click(await screen.findByRole("option", { name: "Finished" }));
    await user.click(screen.getByTestId("state-form-save"));

    await user.click(
      await screen.findByRole("button", { name: "Change group" }),
    );

    expect(
      await screen.findByText("A state with this name already exists."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("state-name-input")).toHaveValue("Review");
    expect(screen.queryByText('Change group of "QA"?')).not.toBeInTheDocument();
  });

  it("keeps the edit row open when the group change is cancelled", async () => {
    const user = userEvent.setup();

    renderWorkspaceStatesApp({
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/states/ws-qa": () =>
          apiError(
            409,
            "STATE_GROUP_CHANGE_UNCONFIRMED",
            "Confirm group change",
            { count: 2 },
          ),
      },
    });

    await user.click(await screen.findByTestId("state-menu-ws-qa"));
    await user.click(screen.getByTestId("state-menu-edit"));
    await user.click(screen.getByTestId("state-group-select"));
    await user.click(await screen.findByRole("option", { name: "Finished" }));
    await user.click(screen.getByTestId("state-form-save"));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(
        screen.queryByText('Change group of "QA"?'),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("state-name-input")).toBeInTheDocument();
  });

  it("opens DeleteStateModal on delete click and sends DELETE with replacementStateId (AC-25)", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    renderWorkspaceStatesApp({
      extraRoutes: {
        "GET /api/workspaces/the-firsts/states": () => {
          return jsonResponse(200, sampleStatesResponse);
        },
        "DELETE /api/workspaces/the-firsts/states/ws-qa": () => {
          deleteCalled = true;
          return jsonResponse(204, null);
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("state-menu-ws-qa")).toBeInTheDocument();
    });

    // Open menu and click Delete
    await user.click(screen.getByTestId("state-menu-ws-qa"));
    await user.click(screen.getByTestId("state-menu-delete"));

    // Delete modal opens
    await waitFor(() => {
      expect(screen.getByTestId("delete-state-modal")).toBeInTheDocument();
    });
    expect(screen.getByText('Delete "QA"?')).toBeInTheDocument();

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
