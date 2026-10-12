import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, Outlet } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it } from "vitest";
import { useRouteHandleMeta } from "./useRouteHandleMeta";

interface TitleMeta {
  title: string;
}

function isTitleMeta(value: unknown): value is TitleMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string"
  );
}

function Title() {
  const meta = useRouteHandleMeta("page", isTitleMeta);
  return <p>{meta?.title ?? "none"}</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <>
            <Title />
            <Outlet />
          </>
        ),
        handle: { page: { title: "Parent" } },
        children: [
          {
            path: "child",
            element: null,
            handle: { page: { title: "Child" } },
          },
          { path: "broken", element: null, handle: { page: { title: 42 } } },
          {
            path: "other",
            element: null,
            handle: { other: { title: "Other" } },
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe("useRouteHandleMeta", () => {
  afterEach(() => cleanup());

  it("returns the deepest matching route's meta", () => {
    renderAt("/child");
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("skips handles that fail the guard or use another key", () => {
    renderAt("/broken");
    expect(screen.getByText("Parent")).toBeInTheDocument();
    cleanup();
    renderAt("/other");
    expect(screen.getByText("Parent")).toBeInTheDocument();
  });
});
