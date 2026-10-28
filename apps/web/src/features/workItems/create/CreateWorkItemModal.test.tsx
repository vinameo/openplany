import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem } from "@repo/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
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
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

  it("handles 403 error by showing alert and triggering reloadProject", async () => {
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
  });
});