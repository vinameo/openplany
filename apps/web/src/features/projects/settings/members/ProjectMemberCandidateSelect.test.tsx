import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppUiProvider } from "@repo/ui";
import type {
  ProjectMemberCandidate,
  EnforcedWorkspacePermission,
} from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { CurrentWorkspaceContext } from "../../../workspaces/currentWorkspace/currentWorkspaceContext";
import { makeWorkspace } from "../../../workspaces/test/workspaceFixtures";
import { ProjectMemberCandidateSelect } from "./ProjectMemberCandidateSelect";
import { setLanguage, translate } from "../../../../i18n/language";

const ADD_TO_WORKSPACE_LINK = translate("project:members.addToWorkspaceLink");
const ALREADY_IN_PROJECT_LABEL = translate("project:members.alreadyInProject");
const NO_WORKSPACE_MEMBER_FOUND = translate(
  "project:members.noWorkspaceMemberFound",
);
const TYPE_FULL_EMAIL = translate("project:members.typeFullEmail");
const WORKSPACE_ADMIN_CANDIDATE_LABEL = translate(
  "project:members.workspaceAdminCandidate",
);

function renderSelect({
  slug = "ws-1",
  identifier = "P1",
  value = null,
  onChange = vi.fn(),
  canSeeEmail = true,
  canAddWorkspaceMember,
  selectedUserIds = [],
  error = null,
  disabled = false,
  permissions = ["workspace.members.add"],
}: {
  slug?: string;
  identifier?: string;
  value?: ProjectMemberCandidate | null;
  onChange?: (candidate: ProjectMemberCandidate | null) => void;
  canSeeEmail?: boolean;
  canAddWorkspaceMember?: boolean;
  selectedUserIds?: readonly string[];
  error?: string | null;
  disabled?: boolean;
  permissions?: EnforcedWorkspacePermission[];
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const ws = makeWorkspace({
    id: "ws-1",
    slug,
    name: "Workspace 1",
    role: "member",
    permissions,
  });

  const wsContextValue = {
    workspace: ws,
    applyWorkspaceUpdate: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
  };

  const result = render(
    <QueryClientProvider client={queryClient}>
      <CurrentWorkspaceContext.Provider value={wsContextValue}>
        <AppUiProvider>
          <ProjectMemberCandidateSelect
            slug={slug}
            identifier={identifier}
            value={value}
            onChange={onChange}
            canSeeEmail={canSeeEmail}
            canAddWorkspaceMember={canAddWorkspaceMember}
            selectedUserIds={selectedUserIds}
            error={error}
            disabled={disabled}
          />
        </AppUiProvider>
      </CurrentWorkspaceContext.Provider>
    </QueryClientProvider>,
  );

  return { ...result, onChange, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const candidateAlice: ProjectMemberCandidate = {
  userId: "u-alice",
  email: "alice@openplany.dev",
  firstName: "Alice",
  lastName: "Smith",
  displayName: "Alice Smith",
  avatarUrl: null,
  status: "addable",
  addableRoles: ["admin", "contributor", "commenter", "viewer"],
};

const candidateAlready: ProjectMemberCandidate = {
  userId: "u-bob",
  email: "bob@openplany.dev",
  firstName: "Bob",
  lastName: "Jones",
  displayName: "Bob Jones",
  avatarUrl: null,
  status: "already_member",
  addableRoles: [],
};

const candidateAdmin: ProjectMemberCandidate = {
  userId: "u-carol",
  email: "carol@openplany.dev",
  firstName: "Carol",
  lastName: "Danvers",
  displayName: "Carol Danvers",
  avatarUrl: null,
  status: "workspace_admin",
  addableRoles: [],
};

describe("ProjectMemberCandidateSelect", () => {
  it("AC-08: in exact mode (canSeeEmail=false), shows hint and does not fetch when input is not full email", async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();

    renderSelect({ canSeeEmail: false });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "an@");

    await waitFor(() => {
      expect(screen.getByText(TYPE_FULL_EMAIL)).toBeInTheDocument();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { canSeeEmail: false, typed: "an@", key: "project:members.typeFullEmail" },
    {
      canSeeEmail: true,
      typed: "an",
      key: "members:errors.candidateQueryTooShort",
    },
  ] as const)(
    "INV-10: the hint for canSeeEmail=$canSeeEmail follows a language switch",
    async ({ canSeeEmail, typed, key }) => {
      mockFetch({});
      const user = userEvent.setup();
      renderSelect({ canSeeEmail });

      await user.type(screen.getByRole("textbox", { name: "Email" }), typed);
      const english = translate(key);
      expect(await screen.findByText(english)).toBeInTheDocument();

      act(() => setLanguage("vi"));

      const vietnamese = translate(key);
      expect(vietnamese).not.toBe(english);
      expect(await screen.findByText(vietnamese)).toBeInTheDocument();
      expect(screen.queryByText(english)).not.toBeInTheDocument();
    },
  );

  it("AC-08: in exact mode, calls API and displays candidate when input looks like a full email", async () => {
    const fetchMock = mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, {
          candidates: [candidateAlice],
          truncated: false,
        }),
    });
    const user = userEvent.setup();

    renderSelect({ canSeeEmail: false });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice@openplany.dev");

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("alice@openplany.dev")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("AC-42: in exact mode, admin@localhost triggers candidate search API call", async () => {
    const candidateLocal: ProjectMemberCandidate = {
      userId: "u-local",
      email: "admin@localhost",
      firstName: "Admin",
      lastName: "Local",
      displayName: "Local Admin",
      avatarUrl: null,
      status: "addable",
      addableRoles: ["contributor"],
    };

    const fetchMock = mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, {
          candidates: [candidateLocal],
          truncated: false,
        }),
    });
    const user = userEvent.setup();

    renderSelect({ canSeeEmail: false });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "admin@localhost");

    await waitFor(() => {
      expect(screen.getByText("Admin Local")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("contains mode (canSeeEmail=true): shows hint when query is < 3 characters and does not fetch", async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();

    renderSelect({ canSeeEmail: true });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "al");

    await waitFor(() => {
      expect(
        screen.getByText("Type at least 3 characters"),
      ).toBeInTheDocument();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("contains mode: calls API and displays candidates when query is >= 3 characters", async () => {
    const fetchMock = mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, {
          candidates: [candidateAlice],
          truncated: false,
        }),
    });
    const user = userEvent.setup();

    renderSelect({ canSeeEmail: true });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ali");

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("AC-10: displays disabled labels for already_member and workspace_admin candidates", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, {
          candidates: [candidateAlready, candidateAdmin],
          truncated: false,
        }),
    });
    const user = userEvent.setup();

    renderSelect({ canSeeEmail: true });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "cand");

    await waitFor(() => {
      expect(screen.getByText(ALREADY_IN_PROJECT_LABEL)).toBeInTheDocument();
      expect(
        screen.getByText(WORKSPACE_ADMIN_CANDIDATE_LABEL),
      ).toBeInTheDocument();
    });
  });

  it("AC-26: when no candidates found and user has workspace.members.add, displays empty message and Add to workspace link", async () => {
    mockFetch({
      "GET /api/workspaces/my-team/projects/P1/member-candidates": () =>
        jsonResponse(200, {
          candidates: [],
          truncated: false,
        }),
    });
    const user = userEvent.setup();

    renderSelect({
      canSeeEmail: true,
      canAddWorkspaceMember: true,
      slug: "my-team",
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "unknown@domain.com");

    await waitFor(() => {
      expect(screen.getByText(NO_WORKSPACE_MEMBER_FOUND)).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: ADD_TO_WORKSPACE_LINK });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/my-team/settings/members");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("AC-26: when no candidates found and user lacks workspace.members.add, displays only empty message without link", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, {
          candidates: [],
          truncated: false,
        }),
    });
    const user = userEvent.setup();

    renderSelect({
      canSeeEmail: true,
      canAddWorkspaceMember: false,
      permissions: [],
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "unknown@domain.com");

    await waitFor(() => {
      expect(screen.getByText(NO_WORKSPACE_MEMBER_FOUND)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("link", { name: ADD_TO_WORKSPACE_LINK }),
    ).not.toBeInTheDocument();
  });

  it("AC-11: shows rate limit message when candidate search returns 429", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        apiError(429, "RATE_LIMITED", "Too many requests", {
          retryAfterSeconds: 45,
        }),
    });
    const user = userEvent.setup();

    renderSelect({ canSeeEmail: true });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "search");

    await waitFor(() => {
      expect(
        screen.getByText("Too many searches. Try again in 45 seconds."),
      ).toBeInTheDocument();
    });
  });

  it("selects a candidate and clears selection", async () => {
    mockFetch({
      "GET /api/workspaces/ws-1/projects/P1/member-candidates": () =>
        jsonResponse(200, {
          candidates: [candidateAlice],
          truncated: false,
        }),
    });
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = renderSelect({
      canSeeEmail: true,
      value: null,
      onChange,
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "alice@openplany.dev");

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Alice Smith"));
    expect(onChange).toHaveBeenCalledWith(candidateAlice);

    // Rerender with candidate selected
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AppUiProvider>
          <ProjectMemberCandidateSelect
            slug="ws-1"
            identifier="P1"
            value={candidateAlice}
            onChange={onChange}
            canSeeEmail={true}
          />
        </AppUiProvider>
      </QueryClientProvider>,
    );

    const clearButton = screen.getByRole("button", { name: "Clear selection" });
    expect(clearButton).toBeInTheDocument();
    await user.click(clearButton);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
