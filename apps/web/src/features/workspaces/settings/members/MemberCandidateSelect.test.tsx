import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { MemberCandidate } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../../auth/authContext";
import { makeSession } from "../../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { MemberCandidateSelect } from "./MemberCandidateSelect";

function renderSelect(
  props: React.ComponentProps<typeof MemberCandidateSelect>,
  isInstanceAdmin = false,
) {
  const baseSession = makeSession();
  const authValue: AuthContextValue = {
    state: {
      status: "authenticated",
      session: {
        ...baseSession,
        user: { ...baseSession.user, isInstanceAdmin },
      },
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    expireSession: vi.fn(),
  };

  return render(
    <AppUiProvider>
      <AuthContext.Provider value={authValue}>
        <MemberCandidateSelect {...props} />
      </AuthContext.Provider>
    </AppUiProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemberCandidateSelect", () => {
  const candidates: MemberCandidate[] = [
    {
      userId: "u-1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
      displayName: "alice_s",
      avatarUrl: null,
      alreadyMember: false,
    },
    {
      userId: "u-2",
      email: "bob@example.com",
      firstName: "Bob",
      lastName: "Jones",
      displayName: "bob_j",
      avatarUrl: null,
      alreadyMember: true,
    },
  ];

  it("typing 2 characters does not call API and shows 'Type at least 3 characters'", async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();

    renderSelect({
      slug: "openstudy",
      value: null,
      onChange: vi.fn(),
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ab");

    expect(screen.getByText("Type at least 3 characters")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("typing 3 characters triggers candidate search after debounce and renders candidates", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    const onChange = vi.fn();

    renderSelect({
      slug: "openstudy",
      value: null,
      onChange,
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ali");

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    // Alice is selectable
    const aliceOption = screen.getByRole("option", { name: /alice@example\.com/i });
    expect(aliceOption).not.toHaveAttribute("data-combobox-disabled");

    await user.click(aliceOption);
    expect(onChange).toHaveBeenCalledWith(candidates[0]);
  });

  it("disables option with 'Already a member' when alreadyMember=true", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();

    renderSelect({
      slug: "openstudy",
      value: null,
      onChange: vi.fn(),
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "bob");

    await waitFor(() => {
      expect(screen.getByText("Already a member")).toBeInTheDocument();
    });

    const bobOption = screen.getByRole("option", { name: /bob@example\.com/i });
    expect(bobOption).toHaveAttribute("data-combobox-disabled", "true");
  });

  it("disables option with 'Already selected' when candidate is in selectedUserIds (AC-19)", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();

    renderSelect({
      slug: "openstudy",
      value: null,
      onChange: vi.fn(),
      selectedUserIds: ["u-1"],
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ali");

    await waitFor(() => {
      expect(screen.getByText("Already selected")).toBeInTheDocument();
    });

    const aliceOption = screen.getByRole("option", { name: /alice@example\.com/i });
    expect(aliceOption).toHaveAttribute("data-combobox-disabled", "true");
  });

  it("shows empty state with link to Create user for instance admin", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates: [] }),
    });

    const user = userEvent.setup();

    renderSelect(
      {
        slug: "openstudy",
        value: null,
        onChange: vi.fn(),
      },
      true, // isInstanceAdmin
    );

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "nomatch@example.com");

    await waitFor(() => {
      expect(
        screen.getByText(
          "No user with this email. Ask your instance admin to create the account.",
        ),
      ).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: "Create user" });
    expect(link).toHaveAttribute("href", "/create-user");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });

  it("shows empty state without Create user link for regular user", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates: [] }),
    });

    const user = userEvent.setup();

    renderSelect(
      {
        slug: "openstudy",
        value: null,
        onChange: vi.fn(),
      },
      false, // regular user
    );

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "nomatch@example.com");

    await waitFor(() => {
      expect(
        screen.getByText(
          "No user with this email. Ask your instance admin to create the account.",
        ),
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: "Create user" })).not.toBeInTheDocument();
  });

  it("WEB-35: pressing Enter when typing exact email selects the candidate", async () => {
    mockFetch({
      "GET /api/workspaces/openstudy/member-candidates": () =>
        jsonResponse(200, { candidates }),
    });

    const user = userEvent.setup();
    const onChange = vi.fn();

    renderSelect({
      slug: "openstudy",
      value: null,
      onChange,
    });

    const input = screen.getByRole("textbox", { name: "Email" });
    await user.type(input, "ALICE@EXAMPLE.COM");

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    await user.type(input, "{enter}");
    expect(onChange).toHaveBeenCalledWith(candidates[0]);
  });

  it("renders selected candidate preview with avatar, name, email and clear button", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderSelect({
      slug: "openstudy",
      value: candidates[0]!,
      onChange,
    });

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "Clear selection" });
    await user.click(clearBtn);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
