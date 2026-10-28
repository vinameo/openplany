import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem } from "@repo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { stubMatchMedia } from "../../../test/mediaQuery";
import { WorkItemPropertyChips } from "./WorkItemPropertyChips";

const mockProject: ProjectListItem = {
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
  role: "contributor",
  permissions: ["project.workitems.create", "project.states.view"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("WorkItemPropertyChips", () => {
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
  });

  const renderChips = (project: ProjectListItem = mockProject) => {
    return render(
      <AppUiProvider>
        <QueryClientProvider client={queryClient}>
          <WorkItemPropertyChips
            slug="acme"
            project={project}
            selectedStateId={null}
            onSelectState={vi.fn()}
          />
        </QueryClientProvider>
      </AppUiProvider>,
    );
  };

  it("renders State chip first followed by 6 coming soon chips", () => {
    renderChips();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);

    // First button is state picker (loading or initial fallback: Backlog)
    expect(buttons[0]).toHaveTextContent("Backlog");

    const comingSoonLabels = [
      "Priority",
      "Assignees",
      "Labels",
      "Start date",
      "Due date",
      "Add parent",
    ];

    comingSoonLabels.forEach((label, index) => {
      expect(buttons[index + 1]).toHaveTextContent(label);
    });
  });

  it("marks all coming soon chips as aria-disabled, focusable, and non-submitting", () => {
    renderChips();

    const buttons = screen.getAllByRole("button");
    const comingSoonButtons = buttons.slice(1);
    expect(comingSoonButtons).toHaveLength(6);

    comingSoonButtons.forEach((btn) => {
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(btn).toHaveAttribute("tabindex", "0");
      expect(btn).toHaveAttribute("type", "button");
    });
  });

  it("wraps coming soon chips in ComingSoonHint which shows tooltip on hover/focus", async () => {
    const user = userEvent.setup();
    renderChips();

    const priorityChip = screen.getByRole("button", { name: "Priority" });
    await user.hover(priorityChip);

    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });
});
