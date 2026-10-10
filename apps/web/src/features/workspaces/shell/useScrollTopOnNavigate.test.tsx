import { render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollTopOnNavigate } from "./useScrollTopOnNavigate";

function TestComponent() {
  const ref = useRef<HTMLDivElement>(null);
  useScrollTopOnNavigate(ref);
  return <div ref={ref} data-testid="scroll-container" />;
}

describe("useScrollTopOnNavigate", () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollToSpy = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    scrollToSpy.mockRestore();
  });

  it("AC-21: calls scrollTo({ top: 0 }) on mount and whenever pathname changes", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/page-1",
          element: <TestComponent />,
        },
        {
          path: "/page-2",
          element: <TestComponent />,
        },
      ],
      { initialEntries: ["/page-1"] },
    );

    render(<RouterProvider router={router} />);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0 });
    scrollToSpy.mockClear();

    await router.navigate("/page-2");
    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0 });
    });
  });
});
