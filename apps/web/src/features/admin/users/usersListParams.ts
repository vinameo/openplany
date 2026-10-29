import {
  ADMIN_USER_SEARCH_MAX,
  ADMIN_USER_SORT_KEYS,
  ADMIN_USER_STATUSES,
  type AdminUserSortKey,
  type AdminUserStatusFilter,
  defaultAdminUserOrder,
  type SortOrder,
  USER_NAME_ALLOWED,
} from "@repo/contracts";

export interface UsersListParams {
  search: string;
  status: AdminUserStatusFilter;
  admin?: "only";
  sort: AdminUserSortKey;
  order: SortOrder;
  page: number;
}

export const DEFAULT_USERS_LIST_PARAMS: UsersListParams = {
  search: "",
  status: "all",
  sort: "createdAt",
  order: "desc",
  page: 1,
};

export function cleanSearch(raw: string | null | undefined): string {
  if (!raw) return "";
  return Array.from(raw.normalize("NFC"))
    .filter((ch) => USER_NAME_ALLOWED.test(ch))
    .join("")
    .slice(0, ADMIN_USER_SEARCH_MAX);
}

export function parseUsersListParams(
  searchParams: URLSearchParams,
): UsersListParams {
  const search = cleanSearch(searchParams.get("search"));

  const rawStatus = searchParams.get("status");
  const status: AdminUserStatusFilter =
    rawStatus && (ADMIN_USER_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as AdminUserStatusFilter)
      : "all";

  const rawAdmin = searchParams.get("admin");
  const admin: "only" | undefined = rawAdmin === "only" ? "only" : undefined;

  const rawSort = searchParams.get("sort");
  const sort: AdminUserSortKey =
    rawSort && (ADMIN_USER_SORT_KEYS as readonly string[]).includes(rawSort)
      ? (rawSort as AdminUserSortKey)
      : "createdAt";

  const rawOrder = searchParams.get("order");
  const order: SortOrder =
    rawOrder === "asc" || rawOrder === "desc"
      ? rawOrder
      : defaultAdminUserOrder(sort);

  const rawPage = searchParams.get("page");
  const parsedPage = rawPage ? parseInt(rawPage, 10) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  return {
    search,
    status,
    ...(admin && { admin }),
    sort,
    order,
    page,
  };
}

export function toUsersSearchParams(params: UsersListParams): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.status && params.status !== "all") {
    searchParams.set("status", params.status);
  }

  if (params.admin === "only") {
    searchParams.set("admin", "only");
  }

  const defaultOrder = defaultAdminUserOrder(params.sort);
  if (params.sort !== "createdAt" || params.order !== defaultOrder) {
    searchParams.set("sort", params.sort);
    searchParams.set("order", params.order);
  }

  if (params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  return searchParams;
}
