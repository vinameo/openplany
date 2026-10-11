import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type { CreateProjectRequest, ProjectListItem } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { CreateProjectModal } from "./CreateProjectModal";

const mockWorkspace = {
  id: "ws-1",
  slug: "acme",
  name: "Acme",
  timezone: "UTC",
  role: "admin" as const,
  permissions: ["workspace.projects.create"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockReloadWorkspace = vi.fn().mockResolvedValue(undefined);

vi.mock("../../workspaces/currentWorkspace/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspace: mockWorkspace,
    reload: mockReloadWorkspace,
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CreateProjectModal", () => {
  function renderModal(
    props: {
      opened?: boolean;
      onClose?: () => void;
      onCreated?: (p: ProjectListItem) => void;
    } = {},
  ) {
    const user = userEvent.setup();
    const onClose = props.onClose ?? vi.fn();
    const onCreated = props.onCreated ?? vi.fn();

    render(
      <AppUiProvider>
        <CreateProjectModal
          opened={props.opened ?? true}
          onClose={onClose}
          onCreated={onCreated}
          slug="acme"
        />
      </AppUiProvider>,
    );

    return { user, onClose, onCreated };
  }

  it("auto-suggests uppercase ID from name until touched, and does not render Public or Lead chips", async () => {
    const { user } = renderModal();

    expect(
      screen.getByRole("heading", { name: "Create project" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/public/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lead/i)).not.toBeInTheDocument();

    const nameInput = screen.getByLabelText("Project name");
    const idInput = screen.getByLabelText("Project ID");

    await user.type(nameInput, "Mobile App");
    expect(idInput).toHaveValue("MA");

    // Manually touch Project ID:
    await user.clear(idInput);
    await user.type(idInput, "ios");
    // Converts to uppercase automatically:
    expect(idInput).toHaveValue("IOS");

    // Changing name again does NOT overwrite touched ID:
    await user.type(nameInput, " v2");
    expect(idInput).toHaveValue("IOS");
  });

  it("submitting empty name displays error and does not call API", async () => {
    let called = false;
    mockFetch({
      "POST /api/workspaces/acme/projects": () => {
        called = true;
        return jsonResponse(201, {});
      },
    });

    const { user } = renderModal();
    const createBtn = screen.getByRole("button", { name: "Create project" });

    await user.click(createBtn);

    expect(await screen.findByText("Enter a project name")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("shows discard confirmation modal when closing dirty form", async () => {
    const { user, onClose } = renderModal();

    const nameInput = screen.getByLabelText("Project name");
    await user.type(nameInput, "Work in progress");

    const closeBtn = screen.getByRole("button", { name: "Close" });
    await user.click(closeBtn);

    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    const discardBtn = screen.getByRole("button", { name: "Discard" });
    await user.click(discardBtn);

    expect(onClose).toHaveBeenCalled();
  });

  it("handles 409 conflict errors by setting field error on specific input", async () => {
    mockFetch({
      "POST /api/workspaces/acme/projects": () =>
        apiError(409, "PROJECT_NAME_TAKEN", "Name taken", {
          fields: { name: "A project with this name already exists" },
        }),
    });

    const { user } = renderModal();
    const nameInput = screen.getByLabelText("Project name");
    await user.type(nameInput, "Existing Project");

    const createBtn = screen.getByRole("button", { name: "Create project" });
    await user.click(createBtn);

    expect(
      await screen.findByText("A project with this name already exists"),
    ).toBeInTheDocument();
  });

  it("shows an alert when the server rejects a field that has no input (icon, cover)", async () => {
    mockFetch({
      "POST /api/workspaces/acme/projects": () =>
        apiError(400, "VALIDATION_ERROR", "Check the highlighted fields", {
          fields: { "icon.color": "Use a color like #1A2B3C" },
        }),
    });

    const { user } = renderModal();
    await user.type(screen.getByLabelText("Project name"), "Icon Drift");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      await screen.findByText("Check the icon and cover, then try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create project" }),
    ).toBeEnabled();
  });

  it("blocks control characters in the description before calling the API", async () => {
    const fetchSpy = vi.fn(() => jsonResponse(201, {}));
    mockFetch({ "POST /api/workspaces/acme/projects": fetchSpy });

    const { user } = renderModal();
    await user.type(screen.getByLabelText("Project name"), "Bell");
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "ring\u0007" },
    });
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      await screen.findByText("Contains characters that aren't allowed"),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles 403 forbidden by showing alert, calling reloadWorkspace, and disabling create button", async () => {
    mockFetch({
      "POST /api/workspaces/acme/projects": () =>
        apiError(403, "FORBIDDEN", "Forbidden"),
    });

    const { user } = renderModal();
    const nameInput = screen.getByLabelText("Project name");
    await user.type(nameInput, "New Project");

    const createBtn = screen.getByRole("button", { name: "Create project" });
    await user.click(createBtn);

    expect(
      await screen.findByText(
        "You no longer have permission to create projects",
      ),
    ).toBeInTheDocument();
    expect(mockReloadWorkspace).toHaveBeenCalled();
    expect(createBtn).toBeDisabled();
  });

  it("successful creation calls onCreated, shows notification, sends valid body without leadId/visibility, and closes", async () => {
    let capturedBody: CreateProjectRequest | null = null;
    const notifySpy = vi.spyOn(notifications, "show");

    const sampleCreatedProject: ProjectListItem = {
      id: "p-new",
      name: "Brand New",
      identifier: "BN",
      description: "Sample",
      icon: { name: "square-check", color: "#868E96" },
      coverKey: "cover-01",
      createdAt: new Date().toISOString(),
      members: [],
      memberCount: 0,
      role: "admin",
      permissions: ["project.members.view"],
    };

    mockFetch({
      "POST /api/workspaces/acme/projects": (init) => {
        capturedBody = JSON.parse(init?.body as string) as CreateProjectRequest;
        return jsonResponse(201, { project: sampleCreatedProject });
      },
    });

    const { user, onCreated, onClose } = renderModal();

    await user.type(screen.getByLabelText("Project name"), "Brand New");
    await user.type(screen.getByLabelText("Description"), "Sample");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(sampleCreatedProject),
    );
    expect(onClose).toHaveBeenCalled();
    expect(notifySpy).toHaveBeenCalledWith({ message: "Project created" });

    // Assert body did not leak forbidden fields
    expect(capturedBody).toBeDefined();
    expect(capturedBody!.name).toBe("Brand New");
    expect(capturedBody!.identifier).toBe("BN");
    expect(
      "leadId" in (capturedBody as unknown as Record<string, unknown>),
    ).toBe(false);
    expect(
      "visibility" in (capturedBody as unknown as Record<string, unknown>),
    ).toBe(false);
  });

  it("allows picking a different icon and color and sends it in the request body", async () => {
    let capturedBody: CreateProjectRequest | undefined;

    mockFetch({
      "POST /api/workspaces/acme/projects": (init) => {
        capturedBody = JSON.parse(init?.body as string) as CreateProjectRequest;
        return jsonResponse(201, {
          project: {
            id: "p-icon",
            name: "Rocket Project",
            identifier: "RP",
            description: "",
            icon: { name: "rocket", color: "#15AABF" },
            coverKey: "cover-01",
            createdAt: new Date().toISOString(),
            members: [],
            memberCount: 0,
            role: "admin",
            permissions: ["project.members.view"],
          },
        });
      },
    });

    const { user } = renderModal();

    await user.type(screen.getByLabelText("Project name"), "Rocket Project");

    // Click icon button to open picker
    await user.click(screen.getByRole("button", { name: "Change icon" }));

    // Select Cyan color
    await user.click(screen.getByRole("radio", { name: "Cyan" }));

    // Filter to rocket icon and select
    await user.type(
      screen.getByRole("textbox", { name: "Search icons" }),
      "rocket",
    );
    await user.click(screen.getByRole("radio", { name: "rocket" }));

    // Submit form
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody!.icon).toEqual({
      name: "rocket",
      color: "#15AABF",
    });
  });

  it("allows selecting a cover preset via Change cover button and sends coverKey in body (AC-20)", async () => {
    let capturedBody: CreateProjectRequest | undefined;

    mockFetch({
      "POST /api/workspaces/acme/projects": (init) => {
        capturedBody = JSON.parse(init?.body as string) as CreateProjectRequest;
        return jsonResponse(201, {
          project: {
            id: "p-cover",
            name: "Cover Project",
            identifier: "CP",
            description: "",
            icon: { name: "square-check", color: "#868E96" },
            coverKey: "cover-03",
            createdAt: new Date().toISOString(),
            members: [],
            memberCount: 0,
            role: "admin",
            permissions: ["project.members.view"],
          },
        });
      },
    });

    const { user } = renderModal();

    await user.type(screen.getByLabelText("Project name"), "Cover Project");

    // Click Change cover to open picker
    await user.click(screen.getByRole("button", { name: "Change cover" }));

    // Select Cover 3
    await user.click(screen.getByRole("radio", { name: "Cover 3" }));

    // Submit form
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody!.coverKey).toBe("cover-03");
  });

  it("does not show discard confirmation when closing modal if no text was entered", async () => {
    const { user, onClose } = renderModal();

    // Changing cover should not make the form dirty
    await user.click(screen.getByRole("button", { name: "Change cover" }));
    await user.click(screen.getByRole("radio", { name: "Cover 2" }));

    // Click Close (×)
    await user.click(screen.getByLabelText("Close"));

    // Discard modal should not appear
    expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });
});
