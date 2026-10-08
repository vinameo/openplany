import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { WorkspaceProvider } from "../WorkspaceProvider";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";

function renderForm() {
  render(
    <AppUiProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <MemoryRouter>
            <CreateWorkspaceForm />
          </MemoryRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </AppUiProvider>,
  );
  return { user: userEvent.setup() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CreateWorkspaceForm", () => {
  it("AC 1: typing 'OpenPlany Dev Team' auto-fills 'openplany-dev-team' and checks availability after debounce", async () => {
    let checkedSlug = "";
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "GET /api/workspaces/slug-check?slug=openplany-dev-team": () => {
        checkedSlug = "openplany-dev-team";
        return jsonResponse(200, {
          slug: "openplany-dev-team",
          available: true,
          reason: null,
        });
      },
    });

    const { user } = renderForm();

    const nameInput = await screen.findByLabelText(/name your workspace/i);
    await user.type(nameInput, "OpenPlany Dev Team");

    const slugInput = screen.getByPlaceholderText(/type or paste a url/i);
    expect(slugInput).toHaveValue("openplany-dev-team");

    expect(await screen.findByText("✓ Available")).toBeInTheDocument();
    expect(checkedSlug).toBe("openplany-dev-team");
  });

  it("AC 2: Vietnamese name 'Công ty Đầu tư Ánh Dương' generates 'cong-ty-dau-tu-anh-duong'", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces/slug-check?slug=cong-ty-dau-tu-anh-duong": () =>
        jsonResponse(200, {
          slug: "cong-ty-dau-tu-anh-duong",
          available: true,
          reason: null,
        }),
    });

    const { user } = renderForm();

    const nameInput = await screen.findByLabelText(/name your workspace/i);
    await user.type(nameInput, "Công ty Đầu tư Ánh Dương");

    const slugInput = screen.getByPlaceholderText(/type or paste a url/i);
    expect(slugInput).toHaveValue("cong-ty-dau-tu-anh-duong");
  });

  it("AC 3: editing URL manually detaches auto-sync; clearing URL re-attaches it", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces/slug-check?slug=acme": () =>
        jsonResponse(200, { slug: "acme", available: true, reason: null }),
      "GET /api/workspaces/slug-check?slug=acme-corp": () =>
        jsonResponse(200, { slug: "acme-corp", available: true, reason: null }),
    });

    const { user } = renderForm();

    const nameInput = await screen.findByLabelText(/name your workspace/i);
    const slugInput = screen.getByPlaceholderText(/type or paste a url/i);

    // Edit slug manually
    await user.type(slugInput, "acme");
    expect(slugInput).toHaveValue("acme");

    // Type more in name -> slug remains untouched
    await user.type(nameInput, " Corp");
    expect(slugInput).toHaveValue("acme");

    // Clear slug completely
    await user.clear(slugInput);
    expect(slugInput).toHaveValue("");

    // Typing in name again re-attaches auto-sync
    await user.type(nameInput, "oration");
    expect(slugInput).toHaveValue("corporation");
  });

  it("AC 4: reserved slug 'admin' shows reserved error immediately without API check, disabling submit", async () => {
    let apiCalled = false;
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces/slug-check?slug=admin": () => {
        apiCalled = true;
        return jsonResponse(200, {
          slug: "admin",
          available: false,
          reason: "RESERVED",
        });
      },
    });

    const { user } = renderForm();

    const slugInput = await screen.findByPlaceholderText(/type or paste a url/i);
    await user.type(slugInput, "admin");

    expect(
      await screen.findByText("This URL is reserved. Choose another one."),
    ).toBeInTheDocument();
    expect(apiCalled).toBe(false);

    const submitBtn = screen.getByRole("button", { name: "Create workspace" });
    expect(submitBtn).toBeDisabled();
  });

  it("AC 4 (TAKEN): API returns TAKEN -> shows already taken error and disables submit", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces/slug-check?slug=existing-slug": () =>
        jsonResponse(200, {
          slug: "existing-slug",
          available: false,
          reason: "TAKEN",
        }),
    });

    const { user } = renderForm();

    const slugInput = await screen.findByPlaceholderText(/type or paste a url/i);
    await user.type(slugInput, "existing-slug");

    expect(
      await screen.findByText("This URL is already taken. Choose another one."),
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: "Create workspace" });
    expect(submitBtn).toBeDisabled();
  });

  it("AC 5: pasting URL extracts the last non-empty path segment", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces/slug-check?slug=acme": () =>
        jsonResponse(200, { slug: "acme", available: true, reason: null }),
    });

    const { user } = renderForm();

    const slugInput = await screen.findByPlaceholderText(/type or paste a url/i);
    await user.click(slugInput);
    await user.paste("https://app.openplany.dev/acme/");

    expect(slugInput).toHaveValue("acme");
  });

  it("AC 6: invalid formats report errors on blur", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    });

    const { user } = renderForm();

    const slugInput = await screen.findByPlaceholderText(/type or paste a url/i);

    // Too short (2 chars)
    await user.type(slugInput, "ab");
    await user.tab();
    expect(
      await screen.findByText("URL must be between 3 and 48 characters"),
    ).toBeInTheDocument();

    // Leading hyphen
    await user.clear(slugInput);
    await user.type(slugInput, "-acme");
    await user.tab();
    expect(
      await screen.findByText(
        "URL can use only lowercase letters, numbers, and single hyphens, and can't start or end with a hyphen",
      ),
    ).toBeInTheDocument();
  });

  it("AC 7: network error on slug-check does not lock the submit button when all fields valid", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces/slug-check?slug=my-cool-org": () =>
        apiError(500, "INTERNAL_ERROR", "Server failure"),
    });

    const { user } = renderForm();

    await user.type(
      await screen.findByLabelText(/name your workspace/i),
      "My Cool Org",
    );
    // select org size
    const select = screen.getByPlaceholderText("Select a range");
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "2-10", hidden: true }));

    const submitBtn = screen.getByRole("button", { name: "Create workspace" });
    await waitFor(() => {
      expect(submitBtn).toBeEnabled();
    });
  });
});
