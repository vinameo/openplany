import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import type { PriorityListResponse, ProjectListItem } from "@repo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { jsonResponse, mockFetch } from "../../test/fetchMock";
import { stubMatchMedia } from "../../test/mediaQuery";
import { PriorityPicker } from "./PriorityPicker";

const mockPrioritiesData: PriorityListResponse = {
  priorities: [
    {
      id: "00000000-0000-0000-0000-000000000020",
      defaultKey: "urgent",
      name: "Urgent",
      band: "urgent",
      color: "#EF4444",
      level: "default",
    },
    {
      id: "00000000-0000-0000-0000-000000000021",
      defaultKey: "high",
      name: "High",
      band: "high",
      color: "#F97316",
      level: "default",
    },
    {
      id: "00000000-0000-0000-0000-000000000022",
      defaultKey: "medium",
      name: "Medium",
      band: "medium",
      color: "#F59E0B",
      level: "default",
    },
    {
      id: "00000000-0000-0000-0000-000000000023",
      defaultKey: "low",
      name: "Low",
      band: "low",
      color: "#3B82F6",
      level: "default",
    },
    {
      id: "00000000-0000-0000-0000-000000000024",
      defaultKey: "none",
      name: "None",
      band: "none",
      color: "#6B7280",
      level: "default",
    },
  ],
  initialPriorityId: "00000000-0000-0000-0000-000000000024",
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
  permissions: ["project.workitems.create", "project.workitems.view"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockProjectWithoutPerm: ProjectListItem = {
  ...mockProjectWithPerm,
  permissions: ["project.workitems.create"],
};

describe("PriorityPicker", () => {
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
      onChange?: (id: string | null) => void;
    } = {},
  ) {
    const user = userEvent.setup();
    const onChange = props.onChange ?? vi.fn();
    const project = props.project ?? mockProjectWithPerm;

    const res = render(
      <AppUiProvider>
        <QueryClientProvider client={queryClient}>
          <PriorityPicker
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

  it("locks chip with noPermission tooltip and skips fetch when actor lacks project.workitems.view", async () => {
    let fetchCalled = false;
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/priorities": () => {
        fetchCalled = true;
        return jsonResponse(200, mockPrioritiesData);
      },
    });

    const { user } = renderPicker({ project: mockProjectWithoutPerm });

    const btn = screen.getByTestId("priority-picker-no-permission");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveTextContent("None");
    expect(fetchCalled).toBe(false);

    await user.hover(btn);
    expect(
      await screen.findByText(
        "You don't have permission to view this project's priorities.",
      ),
    ).toBeInTheDocument();
  });

  it("renders aria-disabled fallback with loadFailed tooltip when fetching priorities fails", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/priorities": () => {
        return jsonResponse(500, { message: "Internal server error" });
      },
    });

    const { user } = renderPicker();

    const btn = await screen.findByTestId("priority-picker-load-failed");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveTextContent("None");

    await user.hover(btn);
    expect(
      await screen.findByText(
        "Couldn't load priorities. The work item will be created with no priority.",
      ),
    ).toBeInTheDocument();
  });

  it("focuses locked chip with Tab and shows tooltip; Enter, Space, and click do not open dropdown", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/priorities": () => {
        return jsonResponse(500, { message: "Internal server error" });
      },
    });

    const { user } = renderPicker();

    const btn = await screen.findByTestId("priority-picker-load-failed");
    expect(btn).toBeInTheDocument();

    await user.tab();
    expect(btn).toHaveFocus();

    expect(
      await screen.findByText(
        "Couldn't load priorities. The work item will be created with no priority.",
      ),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(
      screen.queryByTestId("priority-picker-dropdown"),
    ).not.toBeInTheDocument();

    await user.keyboard(" ");
    expect(
      screen.queryByTestId("priority-picker-dropdown"),
    ).not.toBeInTheDocument();

    await user.click(btn);
    expect(
      screen.queryByTestId("priority-picker-dropdown"),
    ).not.toBeInTheDocument();
  });

  it("AC-01: renders 5 priority options in order, defaults to None, searches, and selects", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/priorities": () =>
        jsonResponse(200, mockPrioritiesData),
    });

    const { user, onChange } = renderPicker();

    const button = await screen.findByTestId("priority-picker-button");
    expect(button).toHaveTextContent("None");
    expect(button).toHaveAttribute("aria-label", "Priority: None");

    // Open dropdown
    await user.click(button);

    // 5 options present in order: Urgent, High, Medium, Low, None
    expect(
      screen.getByTestId(
        "priority-option-00000000-0000-0000-0000-000000000020",
      ),
    ).toHaveTextContent("Urgent");
    expect(
      screen.getByTestId(
        "priority-option-00000000-0000-0000-0000-000000000021",
      ),
    ).toHaveTextContent("High");
    expect(
      screen.getByTestId(
        "priority-option-00000000-0000-0000-0000-000000000022",
      ),
    ).toHaveTextContent("Medium");
    expect(
      screen.getByTestId(
        "priority-option-00000000-0000-0000-0000-000000000023",
      ),
    ).toHaveTextContent("Low");
    expect(
      screen.getByTestId(
        "priority-option-00000000-0000-0000-0000-000000000024",
      ),
    ).toHaveTextContent("None");

    // Search filter
    const searchInput = screen.getByTestId("priority-picker-search");
    await user.type(searchInput, "urg");
    expect(
      screen.getByTestId(
        "priority-option-00000000-0000-0000-0000-000000000020",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(
        "priority-option-00000000-0000-0000-0000-000000000021",
      ),
    ).toBeNull();

    // Search not found
    await user.type(searchInput, "xyz");
    expect(screen.getByText("No priorities found")).toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);

    // Select Urgent
    await user.click(
      screen.getByTestId(
        "priority-option-00000000-0000-0000-0000-000000000020",
      ),
    );
    expect(onChange).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000020",
    );
  });

  it("calls onChange(null) when selecting None (initialPriorityId) (RQ D14, D30)", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/OPS/priorities": () =>
        jsonResponse(200, mockPrioritiesData),
    });

    const { user, onChange } = renderPicker({
      value: "00000000-0000-0000-0000-000000000020", // Currently Urgent
    });

    const button = await screen.findByTestId("priority-picker-button");
    expect(button).toHaveTextContent("Urgent");

    await user.click(button);

    const noneOpt = screen.getByTestId(
      "priority-option-00000000-0000-0000-0000-000000000024",
    );
    await user.click(noneOpt);

    // Selecting None (the initial priority) should call onChange with null
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("translates priority names in Vietnamese and supports NFC search (RQ INV-09, AC-29)", async () => {
    const { setLanguage } = await import("../../i18n/language");
    setLanguage("vi");

    try {
      mockFetch({
        "GET /api/workspaces/acme/projects/OPS/priorities": () =>
          jsonResponse(200, mockPrioritiesData),
      });

      const { user } = renderPicker();

      const button = await screen.findByTestId("priority-picker-button");
      expect(button).toHaveTextContent("Không");
      expect(button).toHaveAttribute("aria-label", "Mức ưu tiên: Không");

      await user.click(button);

      expect(
        screen.getByTestId(
          "priority-option-00000000-0000-0000-0000-000000000020",
        ),
      ).toHaveTextContent("Khẩn cấp");

      // Search using decomposed NFD query
      const searchInput = screen.getByTestId("priority-picker-search");
      const nfdQuery = "khẩn".normalize("NFD");
      await user.type(searchInput, nfdQuery);

      expect(
        screen.getByTestId(
          "priority-option-00000000-0000-0000-0000-000000000020",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(
          "priority-option-00000000-0000-0000-0000-000000000021",
        ),
      ).toBeNull();
    } finally {
      const { setLanguage } = await import("../../i18n/language");
      setLanguage("en");
    }
  });
});
