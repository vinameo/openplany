import { describe, expect, it } from "vitest";
import {
  parseUsersListParams,
  toUsersSearchParams,
  type UsersListParams,
} from "./usersListParams.js";

describe("usersListParams", () => {
  it("parses empty search params to defaults", () => {
    const params = parseUsersListParams(new URLSearchParams());
    expect(params).toEqual({
      search: "",
      status: "all",
      sort: "createdAt",
      order: "desc",
      page: 1,
    });
  });

  it("parses valid search, status, admin, sort, order, page", () => {
    const sp = new URLSearchParams(
      "search=an&status=deactivated&admin=only&sort=email&order=asc&page=3",
    );
    const params = parseUsersListParams(sp);
    expect(params).toEqual({
      search: "an",
      status: "deactivated",
      admin: "only",
      sort: "email",
      order: "asc",
      page: 3,
    });
  });

  it("cleans illegal control characters and truncates search to 100 characters", () => {
    const longString = "a".repeat(120);
    const sp = new URLSearchParams(`search=hello\u0000world\n${longString}`);
    const params = parseUsersListParams(sp);
    expect(params.search).not.toContain("\u0000");
    expect(params.search).not.toContain("\n");
    expect(params.search.length).toBeLessThanOrEqual(100);
  });

  it("falls back to default for invalid status, admin, sort, order, page", () => {
    const sp = new URLSearchParams(
      "status=invalid&admin=yes&sort=unknown&order=sideways&page=-5",
    );
    const params = parseUsersListParams(sp);
    expect(params).toEqual({
      search: "",
      status: "all",
      sort: "createdAt",
      order: "desc",
      page: 1,
    });
  });

  it("toUsersSearchParams serializes only non-default values", () => {
    const defaultParams: UsersListParams = {
      search: "",
      status: "all",
      sort: "createdAt",
      order: "desc",
      page: 1,
    };
    expect(toUsersSearchParams(defaultParams).toString()).toBe("");

    const customParams: UsersListParams = {
      search: "kai",
      status: "active",
      admin: "only",
      sort: "fullName",
      order: "asc",
      page: 2,
    };
    const sp = toUsersSearchParams(customParams);
    expect(sp.get("search")).toBe("kai");
    expect(sp.get("status")).toBe("active");
    expect(sp.get("admin")).toBe("only");
    expect(sp.get("sort")).toBe("fullName");
    expect(sp.get("order")).toBe("asc");
    expect(sp.get("page")).toBe("2");
  });
});
