import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrentProjectContext } from "../../projects/detail/currentProjectContext";
import { ProjectNewWorkItemButton } from "../../projects/detail/ProjectNewWorkItemButton";
import { CreateWorkItemContext } from "../../workItems/create/createWorkItemContext";
import { NewWorkItemButton } from "./NewWorkItemButton";

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
  permissions: ["project.workitems.create"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("NewWorkItemButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders enabled button when onClick is provided and triggers onClick", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <AppUiProvider>
        <NewWorkItemButton onClick={handleClick} />
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "New work item" });
    expect(button).not.toHaveAttribute("aria-disabled");

    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled button with tooltip when disabledHint is non-empty", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <AppUiProvider>
        <NewWorkItemButton
          onClick={handleClick}
          disabledHint="You don't have permission"
        />
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "New work item" });
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();

    await user.hover(button);
    expect(
      await screen.findByText("You don't have permission"),
    ).toBeInTheDocument();
  });

  it("renders disabled button without tooltip when disabledHint is empty string", async () => {
    render(
      <AppUiProvider>
        <NewWorkItemButton disabledHint="" />
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "New work item" });
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it("falls back to ComingSoonHint when no props are passed", async () => {
    const user = userEvent.setup();

    render(
      <AppUiProvider>
        <NewWorkItemButton />
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "New work item" });
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });
});

describe("ProjectNewWorkItemButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is disabled without tooltip when project is loading/null", () => {
    const openCreateWorkItem = vi.fn();

    render(
      <AppUiProvider>
        <CreateWorkItemContext.Provider value={{ openCreateWorkItem }}>
          <CurrentProjectContext
            value={{
              project: null,
              status: "loading",
              retry: vi.fn(),
              reload: vi.fn(),
              applyProjectUpdate: vi.fn(),
            }}
          >
            <ProjectNewWorkItemButton />
          </CurrentProjectContext>
        </CreateWorkItemContext.Provider>
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "New work item" });
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it("is enabled and calls openCreateWorkItem when actor has project.workitems.create", async () => {
    const user = userEvent.setup();
    const openCreateWorkItem = vi.fn();

    render(
      <AppUiProvider>
        <CreateWorkItemContext.Provider value={{ openCreateWorkItem }}>
          <CurrentProjectContext
            value={{
              project: mockProject,
              status: "ready",
              retry: vi.fn(),
              reload: vi.fn(),
              applyProjectUpdate: vi.fn(),
            }}
          >
            <ProjectNewWorkItemButton />
          </CurrentProjectContext>
        </CreateWorkItemContext.Provider>
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "New work item" });
    expect(button).not.toHaveAttribute("aria-disabled");

    await user.click(button);
    expect(openCreateWorkItem).toHaveBeenCalledWith(mockProject);
  });

  it("is disabled with permission tooltip when actor lacks project.workitems.create", async () => {
    const user = userEvent.setup();
    const openCreateWorkItem = vi.fn();
    const viewerProject: ProjectListItem = {
      ...mockProject,
      role: "viewer",
      permissions: [],
    };

    render(
      <AppUiProvider>
        <CreateWorkItemContext.Provider value={{ openCreateWorkItem }}>
          <CurrentProjectContext
            value={{
              project: viewerProject,
              status: "ready",
              retry: vi.fn(),
              reload: vi.fn(),
              applyProjectUpdate: vi.fn(),
            }}
          >
            <ProjectNewWorkItemButton />
          </CurrentProjectContext>
        </CreateWorkItemContext.Provider>
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "New work item" });
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.hover(button);
    expect(
      await screen.findByText(
        "You don't have permission to create work items in this project.",
      ),
    ).toBeInTheDocument();
  });
});
