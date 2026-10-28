import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { StateResponse } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { StateList } from "./list/StateList";

const defaultStates: StateResponse[] = [
  {
    id: "def-backlog",
    name: "Backlog",
    group: "backlog",
    color: "#8E98A8",
    level: "default",
    workItemCount: 0,
  },
  {
    id: "def-todo",
    name: "Todo",
    group: "planned",
    color: "#5B6B82",
    level: "default",
    workItemCount: 1,
  },
  {
    id: "def-in-progress",
    name: "In Progress",
    group: "active",
    color: "#E08A1E",
    level: "default",
    workItemCount: 2,
  },
  {
    id: "ws-qa",
    name: "QA",
    group: "active",
    color: "#3E7BD6",
    level: "workspace",
    workItemCount: 3,
  },
  {
    id: "proj-review",
    name: "Review",
    group: "active",
    color: "#7A5CC7",
    level: "project",
    workItemCount: 4,
  },
  {
    id: "def-done",
    name: "Done",
    group: "finished",
    color: "#2F9E6E",
    level: "default",
    workItemCount: 5,
  },
  {
    id: "def-cancelled",
    name: "Cancelled",
    group: "cancelled",
    color: "#B05A5A",
    level: "default",
    workItemCount: 0,
  },
];

describe("States in Vietnamese (AC-36)", () => {
  beforeEach(() => {
    setLanguage("vi");
  });

  afterEach(() => {
    cleanup();
    setLanguage("en");
  });

  it("renders group names, badges, buttons in Vietnamese while keeping default state names in English (AC-36)", () => {
    render(
      <AppUiProvider>
        <StateList
          states={defaultStates}
          ownLevel="project"
          canManage={true}
          ownCount={1}
          ownMax={50}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    // Group names in Vietnamese
    expect(
      screen.getByRole("heading", { name: "Tồn đọng" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Chưa bắt đầu" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Đang làm" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hoàn thành" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đã huỷ" })).toBeInTheDocument();

    // Default state names remain in English
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Todo")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();

    // Badges in Vietnamese
    expect(screen.getAllByText("Mặc định").length).toBeGreaterThan(0);
    expect(screen.getByText("Từ workspace")).toBeInTheDocument();

    // Buttons and count in Vietnamese
    expect(
      screen.getAllByRole("button", { name: "Thêm trạng thái" }).length,
    ).toBe(5);
    expect(screen.getByText("1/50 trạng thái của dự án")).toBeInTheDocument();
  });

  it("renders form labels in Vietnamese when creating a state", async () => {
    const user = userEvent.setup();
    render(
      <AppUiProvider>
        <StateList
          states={defaultStates}
          ownLevel="project"
          canManage={true}
          ownCount={1}
          ownMax={50}
          onCreate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </AppUiProvider>,
    );

    const addButtons = screen.getAllByRole("button", {
      name: "Thêm trạng thái",
    });
    await user.click(addButtons[0]!);

    expect(screen.getByPlaceholderText("Tên")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
  });
});
