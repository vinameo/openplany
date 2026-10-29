import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem, StateListResponse } from "@repo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { jsonResponse, mockFetch } from "../../test/fetchMock";
import { stubMatchMedia } from "../../test/mediaQuery";
import { StatePicker } from "./StatePicker";

const mockDefaultStates: StateListResponse = {
  states: [
    {
      id: "state-backlog",
      name: "Backlog",
      group: "backlog",
      color: "#8E98A8",
      level: "default",
    },
    {
      id: "state-planned",
      name: "Planned",
      group: "planned",
      color: "#5B6B82",
      level: "default",
    },
    {
      id: "state-in-progress",
      name: "In Progress",
      group: "active",
      color: "#E08A1E",
      level: "default",
    },
    {
      id: "state-done",
      name: "Done",
      group: "finished",
      color: "#2F9E6E",
      level: "default",
    },
    {
      id: "state-cancelled",
      name: "Cancelled",
      group: "cancelled",
      color: "#B05A5A",
      level: "default",
    },
  ],
  initialStateId: "state-backlog",
  ownCount: 0,
  ownMax: 20,
};

const mockProjectWithPerm: ProjectListItem = {
  id: "proj-1",
  name: "Operations",
  identifier: "OPS",
  description: "",
  icon: { name: "square-check", color: "#868E96" },
  coverKey: "cover-01",
  timezone: "UTC",
  effectiveTimezone: "UTC",
  members: null,
  memberCount: 0,
  role: "admin",
  permissions: ["project.workitems.create", "project.states.view"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockProjectWithoutPerm: ProjectListItem = {
  ...mockProjectWithPerm,
  permissions: ["project.workitems.create"],
};

describe("StatePicker", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    stubMatchMedia(true);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function renderPicker(
    props: {
      project?: ProjectListItem;
      value?: string | null;
      onChange?: (id: string) => void;
    } = {},
  ) {
    const user = userEvent.setup();
    const onChange = props.onChange ?? vi.fn();
    const project = props.project ?? mockProjectWithPerm;

    const res = render(
      <AppUiProvider>
        <QueryClientProvider client={queryClient}>
          <StatePicker
            slug="acme"
            project={project}
            value={props.value ?? null}
            onChange={onChange}
          />
        </QueryClientProvider>
      </AppUiProvider>,
    );

    return { user, onChange, ...res };
  }

  it("locks chip with noPermission tooltip and skips fetch when actor lacks project.states.view (AC-35)", async () => {
    let fetchCalled = false;
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/states": () => {
        fetchCalled = true;
        return jsonResponse(200, mockDefaultStates);
      },
    });

    const { user } = renderPicker({ project: mockProjectWithoutPerm });

    const btn = screen.getByTestId("state-picker-no-permission");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Backlog");
    expect(fetchCalled).toBe(false);

    await user.hover(btn);
    expect(
      await screen.findByText(
        "You don't have permission to view this project's states.",
      ),
    ).toBeInTheDocument();
  });

  it("renders disabled fallback with loadFailed tooltip when fetching states fails", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/states": () => {
        return jsonResponse(500, { message: "Internal server error" });
      },
    });

    const { user } = renderPicker();

    const btn = await screen.findByTestId("state-picker-load-failed");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Backlog");

    await user.hover(btn);
    expect(
      await screen.findByText(
        "Couldn't load states. The work item will be created in Backlog.",
      ),
    ).toBeInTheDocument();
  });

  it("renders flat list when only default states exist, supports search, and selects option (AC-05, AC-28)", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/states": () =>
        jsonResponse(200, mockDefaultStates),
    });

    const { user, onChange } = renderPicker();

    // Defaults to initial state (Backlog)
    const button = await screen.findByTestId("state-picker-button");
    expect(button).toHaveTextContent("Backlog");

    // Open dropdown
    await user.click(button);

    // All 5 options are present flat
    expect(
      screen.getByTestId("state-option-state-backlog"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("state-option-state-planned"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("state-option-state-in-progress"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("state-option-state-done")).toBeInTheDocument();
    expect(
      screen.getByTestId("state-option-state-cancelled"),
    ).toBeInTheDocument();

    // No group headers since only default states exist
    expect(screen.queryByText("Active")).toBeNull();

    // Search filter
    const searchInput = screen.getByTestId("state-picker-search");
    await user.type(searchInput, "prog");
    expect(
      screen.getByTestId("state-option-state-in-progress"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("state-option-state-backlog")).toBeNull();

    // Search not found
    await user.type(searchInput, "xyz");
    expect(screen.getByText("No states found")).toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);

    // Select Done
    await user.click(screen.getByTestId("state-option-state-done"));
    expect(onChange).toHaveBeenCalledWith("state-done");
  });

  it("opens a dropdown wider than the chip so state names stay on one line", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/states": () =>
        jsonResponse(200, mockDefaultStates),
    });

    const { user } = renderPicker();
    await user.click(await screen.findByTestId("state-picker-button"));

    // Its own 240px (15rem), not the chip's width
    expect(screen.getByTestId("state-picker-dropdown").style.width).toContain(
      "15rem",
    );
    expect(screen.getByText("In Progress")).toHaveAttribute(
      "title",
      "In Progress",
    );
  });

  it("renders grouped list when custom states exist (AC-05)", async () => {
    const customStatesData: StateListResponse = {
      states: [
        ...mockDefaultStates.states,
        {
          id: "state-review",
          name: "In Review",
          group: "active",
          color: "#7A5CC7",
          level: "project",
        },
      ],
      initialStateId: "state-backlog",
      ownCount: 1,
      ownMax: 20,
    };

    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/states": () =>
        jsonResponse(200, customStatesData),
    });

    const { user } = renderPicker();
    const button = await screen.findByTestId("state-picker-button");
    await user.click(button);

    // Group header Active is present
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByTestId("state-option-state-review")).toBeInTheDocument();
  });
});
