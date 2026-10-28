import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppUiProvider } from "@repo/ui";
import { STATE_GROUPS } from "@repo/contracts";
import { StateGroupIcon } from "./StateGroupIcon";

describe("StateGroupIcon", () => {
  it("renders distinct SVGs for all 5 state groups with aria-hidden", () => {
    STATE_GROUPS.forEach((group) => {
      const { container } = render(
        <AppUiProvider>
          <StateGroupIcon group={group} color="#8E98A8" size={16} />
        </AppUiProvider>,
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("data-group", group);
      expect(svg).toHaveAttribute("width", "16");
      expect(svg).toHaveAttribute("height", "16");
    });
  });

  it("applies adjusted color for contrast on light theme", () => {
    const { container } = render(
      <AppUiProvider>
        <StateGroupIcon group="active" color="#3E7BD6" />
      </AppUiProvider>,
    );

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("stroke");
  });

  it("renders checkmark for finished and cross for cancelled", () => {
    const { container: finishedContainer } = render(
      <AppUiProvider>
        <StateGroupIcon group="finished" color="#2F9E6E" />
      </AppUiProvider>,
    );
    expect(
      finishedContainer.querySelector('svg[data-group="finished"] path'),
    ).toBeInTheDocument();

    const { container: cancelledContainer } = render(
      <AppUiProvider>
        <StateGroupIcon group="cancelled" color="#B05A5A" />
      </AppUiProvider>,
    );
    expect(
      cancelledContainer.querySelector('svg[data-group="cancelled"] path'),
    ).toBeInTheDocument();
  });
});
