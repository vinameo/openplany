import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem } from "@repo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../i18n/language";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { stubMatchMedia } from "../../../test/mediaQuery";
import { CreateWorkItemModal } from "./CreateWorkItemModal";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CreateWorkItemModal", () => {
  beforeEach(() => {
    stubMatchMedia(true);
  });
  function renderModal(
    props: {
      opened?: boolean;
      onClose?: () => void;
      reloadProject?: () => void;
      project?: ProjectListItem;
    } = {},
  ) {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const onClose = props.onClose ?? vi.fn();
    const reloadProject = props.reloadProject ?? vi.fn();

    render(
      <AppUiProvider>
        <QueryClientProvider client={queryClient}>
          <CreateWorkItemModal
            opened={props.opened ?? true}
            onClose={onClose}
            slug="acme"
            project={props.project ?? mockProject}
            reloadProject={reloadProject}
          />
        </QueryClientProvider>
      </AppUiProvider>,
    );

    return { user, onClose, reloadProject };
  }

  it("renders modal with project chip, title input, and description textarea", () => {
    renderModal();

    expect(screen.getByText("Create new work item")).toBeInTheDocument();
    expect(screen.getByLabelText("Project: Operations")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Title")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Click to add description"),
    ).toBeInTheDocument();
  });

  it("validates empty title and displays error without calling API", async () => {
    const fetchMock = mockFetch({});
    const { user } = renderModal();

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    expect(await screen.findByText("Enter a title")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits valid form, displays toast notification and closes modal", async () => {
    const notifySpy = vi.spyOn(notifications, "show");
    let capturedBody: unknown;

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": (init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse(201, {
          workItem: {
            id: "wi-1",
            number: 1,
            key: "OPS-1",
            title: "First work item",
            description: "Some description",
            createdById: "user-1",
            createdAt: new Date().toISOString(),
          },
          replayed: false,
        });
      },
    });

    const { user, onClose } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    const descInput = screen.getByPlaceholderText("Click to add description");
    const saveButton = screen.getByRole("button", { name: "Save" });

    await user.type(titleInput, "  First work item  ");
    await user.type(descInput, "Some description");
    await user.click(saveButton);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(capturedBody).toMatchObject({
      title: "First work item",
      description: "Some description",
    });

    expect(notifySpy).toHaveBeenCalledWith({
      title: "OPS-1 created",
      message: "First work item",
    });
  });

  it("handles 403 error by showing alert, locking save, and triggering reloadProject", async () => {
    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": () =>
        apiError(
          403,
          "FORBIDDEN",
          "You can no longer create work items in this project.",
        ),
    });

    const { user, reloadProject } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    await user.type(titleInput, "Valid Title");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    expect(
      await screen.findByText(
        "You can no longer create work items in this project.",
      ),
    ).toBeInTheDocument();
    expect(reloadProject).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();
  });

  it("handles 404 error by showing alert and locking save", async () => {
    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": () =>
        apiError(404, "PROJECT_NOT_FOUND", "This project no longer exists."),
    });

    const { user } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    await user.type(titleInput, "Valid Title");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    expect(
      await screen.findByText("This project no longer exists."),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("preserves idempotency key on network failure / 5xx error and reuses it on retry (AC-11)", async () => {
    const keysSent: string[] = [];

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": (init) => {
        const body = JSON.parse(init?.body as string);
        keysSent.push(body.idempotencyKey);
        return apiError(500, "INTERNAL_ERROR", "Internal server error");
      },
    });

    const { user } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    await user.type(titleInput, "Network Test Task");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    expect(
      await screen.findByText("Couldn't create the work item. Try again."),
    ).toBeInTheDocument();
    expect(keysSent).toHaveLength(1);

    // Click Save again with identical content
    await user.click(saveButton);

    await waitFor(() => {
      expect(keysSent).toHaveLength(2);
    });

    // Key MUST be identical across retries
    expect(keysSent[0]).toBe(keysSent[1]);
  });

  it("reuses idempotency key when editing content away and reverting back (AC-11)", async () => {
    const keysByTitle: Record<string, string[]> = {};

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": (init) => {
        const body = JSON.parse(init?.body as string);
        keysByTitle[body.title] = keysByTitle[body.title] ?? [];
        keysByTitle[body.title].push(body.idempotencyKey);
        return apiError(500, "INTERNAL_ERROR", "Internal server error");
      },
    });

    const { user } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    const saveButton = screen.getByRole("button", { name: "Save" });

    // Step 1: Submit "Task A"
    await user.type(titleInput, "Task A");
    await user.click(saveButton);
    await screen.findByText("Couldn't create the work item. Try again.");
    expect(keysByTitle["Task A"]).toHaveLength(1);
    const keyTaskA = keysByTitle["Task A"][0];

    // Step 2: Edit to "Task B" and submit
    await user.clear(titleInput);
    await user.type(titleInput, "Task B");
    await user.click(saveButton);
    await screen.findByText("Couldn't create the work item. Try again.");
    expect(keysByTitle["Task B"]).toHaveLength(1);
    const keyTaskB = keysByTitle["Task B"][0];
    expect(keyTaskB).not.toBe(keyTaskA);

    // Step 3: Revert to "Task A" and submit
    await user.clear(titleInput);
    await user.type(titleInput, "Task A");
    await user.click(saveButton);
    await screen.findByText("Couldn't create the work item. Try again.");
    expect(keysByTitle["Task A"]).toHaveLength(2);
    expect(keysByTitle["Task A"][1]).toBe(keyTaskA);
  });

  it("reuses idempotency key when only trailing whitespace is added (AC-11)", async () => {
    const keysSent: string[] = [];

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": (init) => {
        const body = JSON.parse(init?.body as string);
        keysSent.push(body.idempotencyKey);
        return apiError(500, "INTERNAL_ERROR", "Internal server error");
      },
    });

    const { user } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    const saveButton = screen.getByRole("button", { name: "Save" });

    await user.type(titleInput, "Task X");
    await user.click(saveButton);
    await screen.findByText("Couldn't create the work item. Try again.");
    expect(keysSent).toHaveLength(1);

    // Add trailing whitespace
    await user.type(titleInput, "   ");
    await user.click(saveButton);
    await screen.findByText("Couldn't create the work item. Try again.");
    expect(keysSent).toHaveLength(2);
    expect(keysSent[0]).toBe(keysSent[1]);
  });

  it("handles 409 WORK_ITEM_REQUEST_REUSED by clearing key from map and generating new key on next save (AC-28)", async () => {
    const keysSent: string[] = [];

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": (init) => {
        const body = JSON.parse(init?.body as string);
        keysSent.push(body.idempotencyKey);
        return apiError(
          409,
          "WORK_ITEM_REQUEST_REUSED",
          "Something changed while saving. Save again to create the work item.",
        );
      },
    });

    const { user } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    const saveButton = screen.getByRole("button", { name: "Save" });

    await user.type(titleInput, "Conflict Task");
    await user.click(saveButton);

    expect(
      await screen.findByText(
        "Something changed while saving. Save again to create the work item.",
      ),
    ).toBeInTheDocument();
    expect(keysSent).toHaveLength(1);
    // Form contents preserved
    expect(titleInput).toHaveValue("Conflict Task");

    // Click Save again with identical content -> MUST generate a fresh key
    await user.click(saveButton);

    await waitFor(() => {
      expect(keysSent).toHaveLength(2);
    });

    expect(keysSent[1]).not.toBe(keysSent[0]);
  });

  it("makes inputs read-only while saving and prevents double submission (AC-11)", async () => {
    let resolveRequest!: (value: Response) => void;
    let requestCount = 0;

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": () => {
        requestCount++;
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      },
    });

    const { user, onClose } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    const descInput = screen.getByPlaceholderText("Click to add description");
    const saveButton = screen.getByRole("button", { name: "Save" });

    await user.type(titleInput, "Slow Save Task");
    await user.type(descInput, "Slow Save Description");

    // Click save
    await user.click(saveButton);

    // Expect inputs to be read-only while in flight
    expect(titleInput).toHaveAttribute("readonly");
    expect(descInput).toHaveAttribute("readonly");
    expect(saveButton).toHaveAttribute("data-loading", "true");

    // Click save again rapidly while request is still pending
    await user.click(saveButton);
    expect(requestCount).toBe(1);

    // Resolve the promise
    resolveRequest(
      jsonResponse(201, {
        workItem: {
          id: "wi-1",
          number: 1,
          key: "OPS-1",
          title: "Slow Save Task",
          description: "Slow Save Description",
          createdById: "user-1",
          createdAt: new Date().toISOString(),
        },
      }),
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("AC-01: renders modal with project chip, title autofocus, description tabs and note, 7 property chips, create more switch off, discard and save buttons", () => {
    stubMatchMedia(true);
    renderModal();

    expect(screen.getByText("Create new work item")).toBeInTheDocument();
    // Non-interactive project chip
    const chip = screen.getByLabelText("Project: Operations");
    expect(chip).toBeInTheDocument();
    expect(chip.tagName.toLowerCase()).not.toBe("button");

    // Title input with data-autofocus
    const titleInput = screen.getByPlaceholderText("Title");
    expect(titleInput).toBeInTheDocument();
    expect(titleInput).toHaveAttribute("data-autofocus");

    // Description Write/Preview tabs, placeholder, "Markdown supported"
    expect(screen.getByRole("tab", { name: "Write" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText("Markdown supported")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Click to add description"),
    ).toBeInTheDocument();

    // 7 disabled property chips in exact D2 order with D3 neutral labels
    const expectedChips = [
      "State",
      "Priority",
      "Assignees",
      "Labels",
      "Start date",
      "Due date",
      "Add parent",
    ];
    expectedChips.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    // Create more switch off
    const createMoreSwitch = screen.getByRole("switch", {
      name: "Create more",
    });
    expect(createMoreSwitch).not.toBeChecked();

    // Discard and Save buttons
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("AC-08: with Create more enabled, saving shows toast, keeps modal open, empties fields, focuses title, keeps switch enabled, and next save uses fresh key", async () => {
    const notifySpy = vi.spyOn(notifications, "show");
    const sentRequests: Array<{
      title: string;
      description: string;
      idempotencyKey: string;
    }> = [];

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": (init) => {
        const body = JSON.parse(init?.body as string);
        sentRequests.push(body);
        const number = sentRequests.length;
        return jsonResponse(201, {
          workItem: {
            id: `wi-${number}`,
            number,
            key: `OPS-${number}`,
            title: body.title,
            description: body.description,
            createdById: "user-1",
            createdAt: new Date().toISOString(),
          },
          replayed: false,
        });
      },
    });

    const { user, onClose } = renderModal();

    const titleInput = screen.getByPlaceholderText("Title");
    const descInput = screen.getByPlaceholderText("Click to add description");
    const createMoreSwitch = screen.getByRole("switch", {
      name: "Create more",
    });
    const saveButton = screen.getByRole("button", { name: "Save" });

    // Enable Create more
    await user.click(createMoreSwitch);
    expect(createMoreSwitch).toBeChecked();

    // Fill first work item
    await user.type(titleInput, "Issue One");
    await user.type(descInput, "Description One");
    await user.click(saveButton);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith({
        title: "OPS-1 created",
        message: "Issue One",
      });
    });

    // Modal must NOT close
    expect(onClose).not.toHaveBeenCalled();

    // Fields emptied and title focused
    expect(titleInput).toHaveValue("");
    expect(descInput).toHaveValue("");
    expect(titleInput).toHaveFocus();

    // Switch stays checked
    expect(createMoreSwitch).toBeChecked();

    // Second work item
    await user.type(titleInput, "Issue Two");
    await user.type(descInput, "Description Two");
    await user.click(saveButton);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith({
        title: "OPS-2 created",
        message: "Issue Two",
      });
    });

    expect(sentRequests).toHaveLength(2);
    expect(sentRequests[0].idempotencyKey).not.toBe(
      sentRequests[1].idempotencyKey,
    );
  });

  it("AC-18: asks before discarding changes; Keep editing retains content; Discard closes immediately when empty", async () => {
    // Sub-case 1: Closing when empty -> closes immediately without prompt
    const { user, onClose } = renderModal();
    const discardButton = screen.getByRole("button", { name: "Discard" });
    await user.click(discardButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("AC-18: prompts confirmation when dirty; Keep editing keeps content; Discard closes", async () => {
    const { user, onClose } = renderModal();
    const titleInput = screen.getByPlaceholderText("Title");
    const discardButton = screen.getByRole("button", { name: "Discard" });

    await user.type(titleInput, "Unsaved Work");
    await user.click(discardButton);

    // Confirmation appears
    expect(
      await screen.findByText("Discard unsaved changes?"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Click "Keep editing"
    const keepEditingButton = screen.getByRole("button", {
      name: "Keep editing",
    });
    await user.click(keepEditingButton);

    // Confirmation gone, text still there
    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
    expect(titleInput).toHaveValue("Unsaved Work");
    expect(onClose).not.toHaveBeenCalled();

    // Click Discard again, then confirm discard
    await user.click(screen.getByRole("button", { name: "Discard" }));
    const confirmDiscardBtn = await screen.findByRole("button", {
      name: "Discard",
    });
    await user.click(confirmDiscardBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("AC-24: formats 429 TOO_MANY_ATTEMPTS with retryAfterMinutes in alert and preserves content", async () => {
    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": () =>
        new Response(
          JSON.stringify({
            status: 429,
            code: "TOO_MANY_ATTEMPTS",
            message: "Too many attempts",
            retryAfterSeconds: 120,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "120",
            },
          },
        ),
    });

    const { user } = renderModal();
    const titleInput = screen.getByPlaceholderText("Title");
    await user.type(titleInput, "Rate limited title");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);

    expect(
      await screen.findByText("Too many requests. Try again in 2 minutes."),
    ).toBeInTheDocument();
    expect(titleInput).toHaveValue("Rate limited title");
  });

  it("AC-20: renders Vietnamese copy when i18n language is vi", async () => {
    setLanguage("vi");

    try {
      renderModal();

      expect(screen.getByText("Tạo công việc mới")).toBeInTheDocument();
      expect(screen.getByLabelText("Dự án: Operations")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Tiêu đề")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Nhấn để thêm mô tả"),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Viết" })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Xem trước" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Hỗ trợ Markdown")).toBeInTheDocument();

      const expectedViChips = [
        "Trạng thái",
        "Mức ưu tiên",
        "Người thực hiện",
        "Nhãn",
        "Ngày bắt đầu",
        "Hạn chót",
        "Thêm công việc cha",
      ];
      expectedViChips.forEach((label) => {
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      });

      expect(
        screen.getByRole("switch", { name: "Tạo tiếp" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Huỷ bỏ" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Lưu" })).toBeInTheDocument();
    } finally {
      setLanguage("en");
    }
  });

  it("AC-22: sets fullScreen on narrow screens (< 768px)", () => {
    stubMatchMedia(false); // Mobile / narrow screen
    renderModal();

    const content = document.querySelector(".mantine-Modal-content");
    expect(content).toHaveAttribute("data-full-screen", "true");
  });
});
