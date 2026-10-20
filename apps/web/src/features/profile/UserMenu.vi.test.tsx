import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { AuthProvider } from "../auth/AuthProvider";
import { makeSession } from "../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../test/fetchMock";
import { UserMenu } from "./UserMenu";

function renderUserMenu(session = makeSession()) {
  mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, session),
    "POST /api/auth/sign-out": () => new Response(null, { status: 204 }),
  });

  render(
    <AppUiProvider>
      <AuthProvider>
        <UserMenu user={session.user} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { user: userEvent.setup() };
}

beforeEach(() => {
  setLanguage("vi");
});

afterEach(() => {
  setLanguage("en");
  vi.unstubAllGlobals();
});

describe("UserMenu (vi)", () => {
  it("AC-19: renders Vietnamese copy for trigger label, header, and menu items", async () => {
    const session = makeSession();
    const { user } = renderUserMenu(session);

    const trigger = await screen.findByRole("button", {
      name: `Menu tài khoản – ${session.user.displayName}`,
    });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByText("Sửa hồ sơ")).toBeInTheDocument();
    expect(screen.getByText("Đổi mật khẩu")).toBeInTheDocument();
    expect(screen.getByText("Đăng xuất")).toBeInTheDocument();
  });
});
