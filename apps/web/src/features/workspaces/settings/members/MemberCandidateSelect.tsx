import { useState } from "react";
import { Anchor, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { MemberCandidate } from "@repo/contracts";
import { useAuth } from "../../../auth/useAuth";
import { MemberCandidateCombobox } from "../../../members/MemberCandidateCombobox";
import { useMemberCandidates } from "./useMemberCandidates";

interface MemberCandidateSelectProps {
  slug: string;
  value: MemberCandidate | null;
  onChange: (candidate: MemberCandidate | null) => void;
  selectedUserIds?: readonly string[];
  error?: string | null;
  errorId?: string;
  disabled?: boolean;
}

export function MemberCandidateSelect({
  slug,
  value,
  onChange,
  selectedUserIds = [],
  error,
  errorId,
  disabled = false,
}: MemberCandidateSelectProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { state: authState } = useAuth();
  const isInstanceAdmin =
    authState.status === "authenticated" &&
    Boolean(authState.session.user.isInstanceAdmin);

  const candidateState = useMemberCandidates(slug, search);

  return (
    <MemberCandidateCombobox
      value={value}
      onChange={onChange}
      search={search}
      onSearchChange={setSearch}
      state={candidateState}
      disabledLabel={(c) =>
        c.alreadyMember ? t("members:candidate.alreadyMember") : null
      }
      emptyContent={
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {t("members:candidate.noUserWithEmail")}
          </Text>
          {isInstanceAdmin && (
            <Anchor
              href="/create-user"
              target="_blank"
              rel="noopener"
              size="sm"
            >
              {t("common:actions.createUser")}
            </Anchor>
          )}
        </Stack>
      }
      selectedUserIds={selectedUserIds}
      error={error}
      errorId={errorId}
      disabled={disabled}
    />
  );
}
