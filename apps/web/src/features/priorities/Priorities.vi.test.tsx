import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { PriorityListResponse, ProjectListItem } from "@repo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { jsonResponse, mockFetch } from "../../test/fetchMock";
import { stubMatchMedia } from "../../test/mediaQuery";
import { PriorityPicker } from "./PriorityPicker";
import { priorityLabel } from "./priorityLabel";

const mockVietnamesePriorities: PriorityListResponse = {
  priorities: [
    {
      id: "prio-urgent",
      name: "Urgent",
      defaultKey: "urgent",
      band: "urgent",
      color: "#B05A5A",
      level: "default",
    },
    {
      id: "prio-custom-blocker",
      name: "Blocker",
      defaultKey: null,
      band: "urgent",
      color: "#B05A5A",
      level: "workspace",
    },
    {
      id: "prio-high",
      name: "High",
      defaultKey: "high",
      band: "high",
      color: "#D0642B",
      level: "default",
    },
    {
      id: "prio-medium",
      name: "Medium",
      defaultKey: "medium",
      band: "medium",
      color: "#E08A1E",
      level: "default",
    },
    {
      id: "prio-low",
      name: "Low",
      defaultKey: "low",
      band: "low",
      color: "#3E7BD6",
      level: "default",
    },
    {
      id: "prio-none",
      name: "None",
      defaultKey: "none",
      band: "none",
      color: "#8E98A8",
      level: "default",
    },
  ],
  initialPriorityId: "prio-none",
};

const mockProjectWithPerm: ProjectListItem = {
  id: "proj-1",
  name: "Dự án mẫu",
  identifier: "DAM",
  description: "",
  icon: { name: "square-check", color: "#868E96" },
  coverKey: "cover-01",
  timezone: "Asia/Ho_Chi_Minh",
  effectiveTimezone: "Asia/Ho_Chi_Minh",
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

describe("Priorities in Vietnamese (AC-17, RQ INV-09)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    stubMatchMedia(true);
    setLanguage("vi");
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    cleanup();
    setLanguage("en");
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

  it("translates 5 default priorities into Vietnamese while custom priority preserves its stored name (AC-17, RQ INV-09)", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/DAM/priorities": () =>
        jsonResponse(200, mockVietnamesePriorities),
    });

    const { user } = renderPicker();

    // Default selection is None -> translated to "Không"
    const button = await screen.findByTestId("priority-picker-button");
    expect(button).toHaveTextContent("Không");
    expect(button).toHaveAttribute("aria-label", "Mức ưu tiên: Không");

    // Open dropdown
    await user.click(button);

    // 5 defaults translated to Khẩn cấp, Cao, Trung bình, Thấp, Không
    expect(screen.getByTestId("priority-option-prio-urgent")).toHaveTextContent(
      "Khẩn cấp",
    );
    expect(screen.getByTestId("priority-option-prio-high")).toHaveTextContent(
      "Cao",
    );
    expect(screen.getByTestId("priority-option-prio-medium")).toHaveTextContent(
      "Trung bình",
    );
    expect(screen.getByTestId("priority-option-prio-low")).toHaveTextContent(
      "Thấp",
    );
    expect(screen.getByTestId("priority-option-prio-none")).toHaveTextContent(
      "Không",
    );

    // Custom priority with defaultKey: null displays stored name "Blocker"
    expect(
      screen.getByTestId("priority-option-prio-custom-blocker"),
    ).toHaveTextContent("Blocker");

    // Search placeholder in Vietnamese: "Tìm kiếm"
    const searchInput = screen.getByPlaceholderText("Tìm kiếm");
    expect(searchInput).toBeInTheDocument();

    // Empty search result in Vietnamese: "Không tìm thấy mức ưu tiên"
    await user.type(searchInput, "zzz");
    expect(screen.getByText("Không tìm thấy mức ưu tiên")).toBeInTheDocument();
  });

  it("updates accessible chip label in Vietnamese when a priority is selected (AC-17, AC-20)", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/DAM/priorities": () =>
        jsonResponse(200, mockVietnamesePriorities),
    });

    renderPicker({ value: "prio-urgent" });

    const button = await screen.findByTestId("priority-picker-button");
    expect(button).toHaveTextContent("Khẩn cấp");
    expect(button).toHaveAttribute("aria-label", "Mức ưu tiên: Khẩn cấp");
  });

  it("renders locked chip with Vietnamese tooltip when lacking permission (AC-05, AC-17)", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/DAM/priorities": () =>
        jsonResponse(200, mockVietnamesePriorities),
    });

    const { user } = renderPicker({ project: mockProjectWithoutPerm });

    const button = screen.getByTestId("priority-picker-no-permission");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Không");
    expect(button).toHaveAttribute("aria-label", "Mức ưu tiên: Không");

    await user.hover(button);
    expect(
      await screen.findByText(
        "Bạn không có quyền xem mức ưu tiên của dự án này.",
      ),
    ).toBeInTheDocument();
  });

  it("renders locked chip with Vietnamese tooltip when query fails (AC-06, AC-17)", async () => {
    mockFetch({
      "GET /api/workspaces/acme/projects/DAM/priorities": () =>
        jsonResponse(500, { message: "Internal server error" }),
    });

    const { user } = renderPicker();

    const button = await screen.findByTestId("priority-picker-load-failed");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Không");
    expect(button).toHaveAttribute("aria-label", "Mức ưu tiên: Không");

    await user.hover(button);
    expect(
      await screen.findByText(
        "Không tải được mức ưu tiên. Công việc sẽ được tạo với mức Không.",
      ),
    ).toBeInTheDocument();
  });

  it("verifies priorityLabel helper behavior for both default and custom priorities in Vietnamese", async () => {
    const { t } = await import("i18next");

    expect(priorityLabel({ name: "Urgent", defaultKey: "urgent" }, t)).toBe(
      "Khẩn cấp",
    );
    expect(priorityLabel({ name: "High", defaultKey: "high" }, t)).toBe("Cao");
    expect(priorityLabel({ name: "Medium", defaultKey: "medium" }, t)).toBe(
      "Trung bình",
    );
    expect(priorityLabel({ name: "Low", defaultKey: "low" }, t)).toBe("Thấp");
    expect(priorityLabel({ name: "None", defaultKey: "none" }, t)).toBe(
      "Không",
    );
    expect(priorityLabel({ name: "Blocker", defaultKey: null }, t)).toBe(
      "Blocker",
    );
  });
});
