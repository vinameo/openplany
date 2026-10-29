import type { TransformFnParams } from 'class-transformer';
import { MEMBER_MESSAGE_REFS, type MessageRef } from '@repo/contracts';

/**
 * `@Transform` for a member row's `userId`. Postgres returns UUIDs in
 * lowercase, so ids are compared and looked up in that form; an uppercase id
 * would otherwise miss every row read back and slip past the duplicate check.
 */
export function toCanonicalUserId({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

/**
 * Returns a fields map containing `members.<i>.userId` mapped to MEMBER_MESSAGE_REFS.rowDuplicate
 * for every member row whose userId was already seen in a prior row.
 * Returns an empty object when there are no duplicates.
 */
export function duplicateMemberRowFields(
  members: readonly { userId: string }[],
): Record<string, MessageRef> {
  const seenUserIds = new Set<string>();
  const duplicateFields: Record<string, MessageRef> = {};

  members.forEach((m, index) => {
    if (seenUserIds.has(m.userId)) {
      duplicateFields[`members.${index}.userId`] =
        MEMBER_MESSAGE_REFS.rowDuplicate;
    } else {
      seenUserIds.add(m.userId);
    }
  });

  return duplicateFields;
}

/**
 * `members.<i>.role` mapped to MEMBER_MESSAGE_REFS.chooseRole for every row. Used
 * when the database rejects the batch's roles (foreign key on `roles`), which
 * cannot be pinned to one row.
 */
export function unknownRoleFields(
  members: readonly unknown[],
): Record<string, MessageRef> {
  const fields: Record<string, MessageRef> = {};
  members.forEach((_, index) => {
    fields[`members.${index}.role`] = MEMBER_MESSAGE_REFS.chooseRole;
  });
  return fields;
}
