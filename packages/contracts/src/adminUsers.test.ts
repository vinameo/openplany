import { describe, expect, it } from "vitest";
import {
  ADMIN_USER_PAGE_MAX,
  ADMIN_USER_SEARCH_MAX,
  ADMIN_USER_SEARCH_TERMS_MAX,
  ADMIN_USER_SORT_KEYS,
  ADMIN_USER_STATUSES,
  ADMIN_USERS_PAGE_SIZE,
  defaultAdminUserOrder,
} from "./adminUsers.js";

describe("adminUsers contracts", () => {
  it("defines expected numeric constants", () => {
    expect(ADMIN_USERS_PAGE_SIZE).toBe(50);
    expect(ADMIN_USER_SEARCH_MAX).toBe(100);
    expect(ADMIN_USER_SEARCH_TERMS_MAX).toBe(5);
    expect(ADMIN_USER_PAGE_MAX).toBe(10_000);
  });

  it("defines expected sort keys and status filters", () => {
    expect(ADMIN_USER_SORT_KEYS).toEqual([
      "createdAt",
      "fullName",
      "displayName",
      "email",
    ]);
    expect(ADMIN_USER_STATUSES).toEqual(["all", "active", "deactivated"]);
  });

  it("defaultAdminUserOrder resolves createdAt -> desc and other columns -> asc (INV-03)", () => {
    expect(defaultAdminUserOrder("createdAt")).toBe("desc");
    expect(defaultAdminUserOrder("fullName")).toBe("asc");
    expect(defaultAdminUserOrder("displayName")).toBe("asc");
    expect(defaultAdminUserOrder("email")).toBe("asc");
  });
});
