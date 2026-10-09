import { describe, expect, it } from 'vitest';
import { canOnResource } from './resourcePermissions.js';
import type { ProjectPermission } from './projectPermissions.js';

describe('resourcePermissions', () => {
  describe('AC-07: canOnResource', () => {
    const actorId = 'actor-user-1';
    const otherId = 'other-user-2';

    it('grants access when .any permission is present, regardless of createdById', () => {
      const granted: ProjectPermission[] = ['project.workitems.delete.any'];

      // Created by someone else
      expect(
        canOnResource(
          granted,
          'project.workitems.delete',
          { createdById: otherId },
          actorId,
        ),
      ).toBe(true);

      // Created by self
      expect(
        canOnResource(
          granted,
          'project.workitems.delete',
          { createdById: actorId },
          actorId,
        ),
      ).toBe(true);

      // Created by null
      expect(
        canOnResource(
          granted,
          'project.workitems.delete',
          { createdById: null },
          actorId,
        ),
      ).toBe(true);
    });

    it('grants access with .own only when createdById matches actorId', () => {
      const granted: ProjectPermission[] = ['project.workitems.delete.own'];

      // Created by self -> true
      expect(
        canOnResource(
          granted,
          'project.workitems.delete',
          { createdById: actorId },
          actorId,
        ),
      ).toBe(true);

      // Created by someone else -> false
      expect(
        canOnResource(
          granted,
          'project.workitems.delete',
          { createdById: otherId },
          actorId,
        ),
      ).toBe(false);

      // Created by null -> false
      expect(
        canOnResource(
          granted,
          'project.workitems.delete',
          { createdById: null },
          actorId,
        ),
      ).toBe(false);
    });

    it('returns false when neither .any nor .own is present', () => {
      const granted: ProjectPermission[] = ['project.workitems.view'];
      expect(
        canOnResource(
          granted,
          'project.workitems.delete',
          { createdById: actorId },
          actorId,
        ),
      ).toBe(false);
    });

    it('rejects invalid resource ownership base at compile-time (AC-07 / Ticket 07)', () => {
      // @ts-expect-error 'project.workitems.create' is not a ProjectOwnershipBase
      canOnResource([], 'project.workitems.create', { createdById: null }, actorId);
    });
  });
});
