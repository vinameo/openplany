import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../../i18n";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { ChangeMyPasswordModal } from "./ChangeMyPasswordModal";

function renderModal() {
  const session = makeSession();
  mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, session),
  });

  render(
    <AppUiProvider>
      <AuthProvider>
        <ChangeMyPasswordModal
          opened={true}
          onClose={vi.fn()}
          user={session.user}
        />
      </AuthProvider>
    </AppUiProvider>,
  );
}

beforeEach(() => {
  setLanguage("vi");
});

afterEach(() => {
  setLanguage("en");
  vi.unstubAllGlobals();
});

describe("ChangeMyPasswordModal (vi)", () => {
  it("AC-19: renders Vietnamese copy for modal title, labels, note, and buttons", async () => {
    renderModal();

    expect(
      screen.getByRole("heading", { name: "Đổi mật khẩu" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu hiện tại *")).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu mới *")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Xác nhận mật khẩu mới *"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Bạn vẫn đăng nhập ở đây. Bạn sẽ bị đăng xuất trên mọi thiết bị khác.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Đổi mật khẩu" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Đóng đổi mật khẩu" }),
    ).toBeInTheDocument();
  });
});
