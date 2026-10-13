import { MEMBER_MESSAGES } from '@repo/contracts';

/**
 * Returns a fields map containing `members.<i>.userId` mapped to MEMBER_MESSAGES.rowDuplicate
 * for every member row whose userId was already seen in a prior row.
 * Returns an empty object when there are no duplicates.
 */
export function duplicateMemberRowFields(
  members: readonly { userId: string }[],
): Record<string, string> {
  const seenUserIds = new Set<string>();
  const duplicateFields: Record<string, string> = {};

  members.forEach((m, index) => {
    if (seenUserIds.has(m.userId)) {
      duplicateFields[`members.${index}.userId`] = MEMBER_MESSAGES.rowDuplicate;
    } else {
      seenUserIds.add(m.userId);
    }
  });

  return duplicateFields;
}
