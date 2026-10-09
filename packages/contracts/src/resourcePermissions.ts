import type {
  ProjectPermission,
  ProjectOwnershipBase,
} from './projectPermissions.js';

export function canOnResource(
  granted: readonly ProjectPermission[],
  base: ProjectOwnershipBase,
  resource: { createdById: string | null },
  actorId: string,
): boolean {
  if (granted.includes(`${base}.any` as ProjectPermission)) return true;
  return (
    resource.createdById !== null &&
    resource.createdById === actorId &&
    granted.includes(`${base}.own` as ProjectPermission)
  );
}
