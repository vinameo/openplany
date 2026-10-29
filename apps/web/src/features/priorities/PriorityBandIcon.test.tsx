import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppUiProvider } from "@repo/ui";
import { PRIORITY_BANDS } from "@repo/contracts";
import { PriorityBandIcon } from "./PriorityBandIcon";

describe("PriorityBandIcon", () => {
  it("renders distinct SVGs for all 5 priority bands with aria-hidden", () => {
    PRIORITY_BANDS.forEach((band) => {
      const { container } = render(
        <AppUiProvider>
          <PriorityBandIcon band={band} color="#6B7280" size={16} />
        </AppUiProvider>,
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("data-band", band);
      expect(svg).toHaveAttribute("width", "16");
      expect(svg).toHaveAttribute("height", "16");
    });
  });

  it("renders exclamation mark for urgent band", () => {
    const { container } = render(
      <AppUiProvider>
        <PriorityBandIcon band="urgent" color="#EF4444" />
      </AppUiProvider>,
    );

    const svg = container.querySelector('svg[data-band="urgent"]');
    expect(svg).toBeInTheDocument();
    expect(svg?.querySelector("rect")).toBeInTheDocument();
    expect(svg?.querySelector("path")).toBeInTheDocument();
  });

  it("renders circled slash for none band", () => {
    const { container } = render(
      <AppUiProvider>
        <PriorityBandIcon band="none" color="#6B7280" />
      </AppUiProvider>,
    );

    const svg = container.querySelector('svg[data-band="none"]');
    expect(svg).toBeInTheDocument();
    expect(svg?.querySelector("circle")).toBeInTheDocument();
    expect(svg?.querySelector("line")).toBeInTheDocument();
  });
});
