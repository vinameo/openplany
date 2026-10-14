import { type ReactNode, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n";
import {
  applyMemberListQuery,
  DEFAULT_MEMBER_SORT,
  type MemberRowView,
  type MemberSort,
} from "./memberListView";
import { MembersTable } from "./MembersTable";
import { MembersToolbar } from "./MembersToolbar";
import type { RoleScheme } from "./roleScheme";

export type MembersListState<M> =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      members: readonly M[];
      total: number;
      truncated: boolean;
      listMax: number;
    };

export interface MembersListViewProps<
  R extends string,
  M extends MemberRowView<R>,
> {
  scheme: RoleScheme<R>;
  state: MembersListState<M>;
  canSeeEmail: boolean;
  canAddMember: boolean;
  onAddMember: () => void;
  title?: string;
  note?: ReactNode;
  alerts?: ReactNode;
  roleHint?: (m: M) => string | null;
  roleBadge?: (m: M) => ReactNode;
  roleControl?: (m: M, roleHint?: string | null) => ReactNode | null;
  isReadOnly?: (m: M) => boolean;
  emptyState?: ReactNode;
  inheritedRow?: (m: M) => boolean;
  noneAddedNote?: ReactNode;
  truncatedMessage?: (shown: number, total: number) => string;
}

export function MembersListView<R extends string, M extends MemberRowView<R>>({
  scheme,
  state,
  canSeeEmail,
  canAddMember,
  onAddMember,
  title,
  note,
  alerts,
  roleHint,
  roleBadge,
  roleControl,
  isReadOnly,
  emptyState,
  inheritedRow,
  noneAddedNote,
  truncatedMessage,
}: MembersListViewProps<R, M>) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<R[]>([]);
  const [sort, setSort] = useState<MemberSort>(DEFAULT_MEMBER_SORT);

  const resolvedTitle = title ?? t("members:title");

  const clearSearchAndFilters = () => {
    setSearch("");
    setRoles([]);
  };

  const rawMembers = state.status === "ready" ? state.members : undefined;
  const filteredMembers = useMemo(
    () =>
      applyMemberListQuery(
        rawMembers ?? [],
        { search, roles, sort },
        { canSeeEmail, scheme, pinned: inheritedRow },
      ),
    [rawMembers, search, roles, sort, canSeeEmail, scheme, inheritedRow],
  );

  if (state.status === "loading") {
    return (
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Skeleton height={28} width={120} />
          <Skeleton height={20} width={40} radius="xl" />
        </Group>
        <Stack gap="xs">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </Stack>
      </Stack>
    );
  }

  if (state.status === "error") {
    return (
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Title order={2}>{resolvedTitle}</Title>
        </Group>
        <Alert color="red" role="alert">
          <Group justify="space-between" align="center">
            <Text size="sm">{t("workspace:settings.members.loadError")}</Text>
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={state.retry}
            >
              {t("common:actions.tryAgain")}
            </Button>
          </Group>
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="xs" align="center">
        <Title order={2}>{resolvedTitle}</Title>
        <Badge variant="light" color="gray" size="sm">
          {state.total}
        </Badge>
      </Group>

      {note}

      {state.truncated && (
        <Alert color="yellow" role="alert">
          {truncatedMessage
            ? truncatedMessage(state.listMax, state.total)
            : t("members:truncated", {
                shown: formatNumber(state.listMax),
                total: formatNumber(state.total),
              })}
        </Alert>
      )}

      {alerts}

      {state.members.length === 0 && emptyState ? (
        emptyState
      ) : (
        <>
          <MembersToolbar
            scheme={scheme}
            search={search}
            onSearchChange={setSearch}
            selectedRoles={roles}
            onRolesChange={setRoles}
            canAddMember={canAddMember}
            onAddMember={onAddMember}
          />

          {filteredMembers.length === 0 ? (
            <Stack align="center" gap="xs" py="xl">
              <Text size="sm" c="dimmed">
                {t("members:noMembersMatch")}
              </Text>
              <Button
                variant="subtle"
                size="sm"
                onClick={clearSearchAndFilters}
              >
                {t("members:clearSearchAndFilters")}
              </Button>
            </Stack>
          ) : (
            <>
              <MembersTable
                members={filteredMembers}
                scheme={scheme}
                canSeeEmail={canSeeEmail}
                currentSort={sort}
                onSortChange={setSort}
                roleHint={roleHint}
                roleBadge={roleBadge}
                roleControl={roleControl}
                isReadOnly={isReadOnly}
                inheritedRow={inheritedRow}
              />
              {state.total === 0 && noneAddedNote ? (
                typeof noneAddedNote === "string" ? (
                  <Text size="sm" c="dimmed">
                    {noneAddedNote}
                  </Text>
                ) : (
                  noneAddedNote
                )
              ) : null}
            </>
          )}
        </>
      )}
    </Stack>
  );
}
