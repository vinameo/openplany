import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { ProjectMemberSummary } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "../../test/mediaQuery";
import { ProjectMembersCell } from "./ProjectMembersCell";

function makeMember(
  userId: string,
  first: string,
  last: string,
  opts: Partial<ProjectMemberSummary> = {},
): ProjectMemberSummary {
  return {
    userId,
    firstName: first,
    lastName: last,
    displayName: `${first} ${last}`,
    email: `${first.toLowerCase()}@openplany.dev`,
    accountActive: true,
    ...opts,
  };
}

describe("ProjectMembersCell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a dash with 'Hidden for your role' hint when members is null", () => {
    render(
      <AppUiProvider>
        <ProjectMembersCell members={null} />
      </AppUiProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Hidden for your role" }),
    ).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a plain dash when members is empty array", () => {
    render(
      <AppUiProvider>
        <ProjectMembersCell members={[]} />
      </AppUiProvider>,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hidden for your role" }),
    ).not.toBeInTheDocument();
  });

  it("AC-12: renders 'Deactivated' in hint and applies deactivated class for inactive accounts", () => {
    const member = makeMember("u-deact", "Inactive", "User", {
      accountActive: false,
      email: undefined,
    });

    render(
      <AppUiProvider>
        <ProjectMembersCell members={[member]} />
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", {
      name: "Inactive User, deactivated",
    });
    expect(button).toBeInTheDocument();
    expect(button.className).toMatch(/deactivated/);
  });

  it("AC-13: omits email from aria-label and hint when email key is absent", () => {
    const member = makeMember("u-no-email", "Secret", "Agent", {
      email: undefined,
    });

    render(
      <AppUiProvider>
        <ProjectMembersCell members={[member]} />
      </AppUiProvider>,
    );

    const button = screen.getByRole("button", { name: "Secret Agent" });
    expect(button).toBeInTheDocument();
    expect(button.getAttribute("aria-label")).not.toContain("@");
  });

  it("marks current user with '(you)' in name and aria-label", () => {
    const members = [
      makeMember("u-me", "Kai", "Tran"),
      makeMember("u-other", "Nam", "Nguyen"),
    ];

    render(
      <AppUiProvider>
        <ProjectMembersCell members={members} currentUserId="u-me" />
      </AppUiProvider>,
    );

    expect(
      screen.getByRole("button", {
        name: "Kai Tran (you), kai@openplany.dev",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Nam Nguyen, nam@openplany.dev",
      }),
    ).toBeInTheDocument();
  });

  it("AC-16: renders up to 5 members and condenses remaining into +2 with remaining members listed in order", () => {
    const sevenMembers: ProjectMemberSummary[] = [
      makeMember("u-1", "Kai", "Tran"),
      makeMember("u-2", "Nam", "Nguyen"),
      makeMember("u-3", "An", "Le"),
      makeMember("u-4", "Binh", "Pham"),
      makeMember("u-5", "Cuong", "Vu"),
      makeMember("u-6", "Dung", "Hoang"),
      makeMember("u-7", "Em", "Do"),
    ];

    render(
      <AppUiProvider>
        <ProjectMembersCell members={sevenMembers} />
      </AppUiProvider>,
    );

    expect(screen.getByRole("button", { name: /Kai Tran/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nam Nguyen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /An Le/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Binh Pham/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cuong Vu/ })).toBeInTheDocument();

    const overflowButton = screen.getByRole("button", {
      name: "+2: Dung Hoang, Em Do",
    });
    expect(overflowButton).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  describe("Desktop tooltip", () => {
    beforeEach(() => {
      stubMatchMedia(true);
    });

    it("shows tooltip on keyboard focus", async () => {
      const user = userEvent.setup();
      const member = makeMember("u-1", "Kai", "Tran");

      render(
        <AppUiProvider>
          <ProjectMembersCell members={[member]} />
        </AppUiProvider>,
      );

      const button = screen.getByRole("button", {
        name: "Kai Tran, kai@openplany.dev",
      });
      await user.tab();
      expect(button).toHaveFocus();

      expect(await screen.findByRole("tooltip")).toHaveTextContent("Kai Tran");
    });
  });

  describe("Mobile popover", () => {
    beforeEach(() => {
      stubMatchMedia(false);
    });

    it("opens popover on tap and closes on Escape", () => {
      const member = makeMember("u-1", "Kai", "Tran");

      render(
        <AppUiProvider>
          <ProjectMembersCell members={[member]} />
        </AppUiProvider>,
      );

      const button = screen.getByRole("button", {
        name: "Kai Tran, kai@openplany.dev",
      });

      // Tap on mobile
      act(() => {
        fireEvent.click(button);
      });

      expect(screen.getByText("Kai Tran")).toBeInTheDocument();
      expect(screen.getByText("kai@openplany.dev")).toBeInTheDocument();

      // Press Escape
      act(() => {
        fireEvent.keyDown(button, { key: "Escape" });
      });

      expect(screen.queryByText("kai@openplany.dev")).not.toBeInTheDocument();
    });
  });
});
