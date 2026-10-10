import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function TestComponent({ hasChanges }: { hasChanges: boolean }) {
  const { blocked, proceed, stay } = useUnsavedChangesGuard(hasChanges);

  return (
    <div>
      <Link to="/other">Go to other</Link>
      {blocked && (
        <div data-testid="modal">
          <p>Discard unsaved changes?</p>
          <button type="button" onClick={proceed}>
            Discard
          </button>
          <button type="button" onClick={stay}>
            Keep editing
          </button>
        </div>
      )}
    </div>
  );
}

describe("useUnsavedChangesGuard", () => {
  it("allows navigation when hasChanges is false", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <TestComponent hasChanges={false} />,
        },
        {
          path: "/other",
          element: <div>Other page</div>,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("link", { name: "Go to other" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/other");
    });
    expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
  });

  it("blocks navigation when hasChanges is true and allows stay or proceed", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <TestComponent hasChanges={true} />,
        },
        {
          path: "/other",
          element: <div>Other page</div>,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    // Attempt navigation
    await user.click(screen.getByRole("link", { name: "Go to other" }));

    // Navigation should be blocked, stay on "/", modal appears
    await waitFor(() => {
      expect(screen.getByTestId("modal")).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe("/");

    // Click keep editing (stay)
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => {
      expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe("/");

    // Attempt navigation again and click discard (proceed)
    await user.click(screen.getByRole("link", { name: "Go to other" }));
    await waitFor(() => {
      expect(screen.getByTestId("modal")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/other");
    });
  });

  it("attaches beforeunload listener when hasChanges is true", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const router = createMemoryRouter([
      {
        path: "/",
        element: <TestComponent hasChanges={true} />,
      },
    ]);

    const { unmount } = render(<RouterProvider router={router} />);

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });
});

