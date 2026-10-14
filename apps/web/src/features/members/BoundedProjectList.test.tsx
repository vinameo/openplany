import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it } from "vitest";
import type { ProjectRef } from "@repo/contracts";
import { BoundedProjectList } from "./BoundedProjectList";

describe("BoundedProjectList", () => {
  const sampleProjects: ProjectRef[] = [
    { id: "p-1", name: "Website", identifier: "WEB" },
    { id: "p-2", name: "Mobile App", identifier: "MOB" },
  ];

  it("renders nothing when list is empty and total is 0", () => {
    const { container } = render(
      <AppUiProvider>
        <BoundedProjectList projects={[]} total={0} hiddenCount={0} />
      </AppUiProvider>,
    );

    expect(container.querySelector(".mantine-Group-root")).toBeNull();
  });

  it("renders projects with name and identifier", () => {
    render(
      <AppUiProvider>
        <BoundedProjectList
          projects={sampleProjects}
          total={2}
          hiddenCount={0}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText(/Website \(WEB\)/)).toBeInTheDocument();
    expect(screen.getByText(/Mobile App \(MOB\)/)).toBeInTheDocument();
  });

  it("calculates M correctly: 25 total, 10 projects, hiddenCount = 2 -> and 13 more and 2 projects you cannot see", () => {
    const tenProjects: ProjectRef[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      name: `Project ${i}`,
      identifier: `P${i}`,
    }));

    render(
      <AppUiProvider>
        <BoundedProjectList projects={tenProjects} total={25} hiddenCount={2} />
      </AppUiProvider>,
    );

    expect(screen.getByText(/and 13 more/)).toBeInTheDocument();
    expect(
      screen.getByText(/and 2 projects you can't see/),
    ).toBeInTheDocument();
  });

  it("handles single hidden project correctly", () => {
    render(
      <AppUiProvider>
        <BoundedProjectList
          projects={sampleProjects}
          total={3}
          hiddenCount={1}
        />
      </AppUiProvider>,
    );

    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    expect(screen.getByText(/and 1 project you can't see/)).toBeInTheDocument();
  });
});
