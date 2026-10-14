import { describe, expect, it } from 'vitest';
import { getMetadataStorage } from 'class-validator';
import { en } from '@repo/contracts';
import { decodeValidationMessage } from './validation.js';

// Import all DTO classes so their decorator metadata is registered
import { SignInDto } from '../auth/dto/signIn.dto.js';
import { CreateUserDto } from '../admin/dto/createUser.dto.js';
import { UpdateRolePermissionsDto, RolePermissionsChangeDto } from '../admin/roles/dto/updateRolePermissions.dto.js';
import { UpdateProfileDto } from '../users/dto/updateProfile.dto.js';
import { CreateWorkspaceDto } from '../workspaces/dto/createWorkspace.dto.js';
import { UpdateWorkspaceDto } from '../workspaces/dto/updateWorkspace.dto.js';
import { SlugCheckQueryDto } from '../workspaces/dto/slugCheckQuery.dto.js';
import { AddWorkspaceMembersDto, AddWorkspaceMemberDto } from '../workspaces/members/dto/addWorkspaceMembers.dto.js';
import { ChangeWorkspaceRoleDto } from '../workspaces/members/dto/changeWorkspaceRole.dto.js';
import { RoleChangePreviewQueryDto } from '../workspaces/members/dto/roleChangePreviewQuery.dto.js';
import { CreateProjectDto, ProjectIconDto } from '../projects/dto/createProject.dto.js';
import { UpdateProjectDto } from '../projects/dto/updateProject.dto.js';
import { AddProjectMembersDto, AddProjectMemberDto } from '../projects/members/dto/addProjectMembers.dto.js';
import { ChangeProjectRoleDto } from '../projects/members/dto/changeProjectRole.dto.js';
import { MemberCandidateQueryDto } from './memberCandidateQuery.dto.js';

const ALL_DTOS = [
  SignInDto,
  CreateUserDto,
  UpdateRolePermissionsDto,
  RolePermissionsChangeDto,
  UpdateProfileDto,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  SlugCheckQueryDto,
  AddWorkspaceMembersDto,
  AddWorkspaceMemberDto,
  ChangeWorkspaceRoleDto,
  RoleChangePreviewQueryDto,
  CreateProjectDto,
  ProjectIconDto,
  UpdateProjectDto,
  AddProjectMembersDto,
  AddProjectMemberDto,
  ChangeProjectRoleDto,
  MemberCandidateQueryDto,
];

function keyExistsInEnCatalog(key: string): boolean {
  const [ns, ...rest] = key.split(':');
  const path = rest.join(':');
  const nsCatalog = (en as Record<string, Record<string, unknown>>)[ns];
  if (!nsCatalog) return false;
  return nsCatalog[path] !== undefined;
}

describe('DTO Validation Metadata (AC-14, BA M-5)', () => {
  it('every constraint with a custom message uses a valid MessageRef in the en catalog', () => {
    const storage = getMetadataStorage();
    let totalConstraintsWithCustomMessage = 0;

    for (const dto of ALL_DTOS) {
      const metadatas = storage.getTargetValidationMetadatas(dto, '', true, false);
      for (const meta of metadatas) {
        // Skip class-validator internal default message for nested validation
        if (
          meta.type === 'nestedValidation' &&
          typeof meta.message === 'string' &&
          meta.message.includes('must be either object or array')
        ) {
          continue;
        }

        if (meta.message !== undefined && meta.message !== null && meta.message !== '') {
          totalConstraintsWithCustomMessage++;
          const ref = decodeValidationMessage(meta.message);
          expect(
            ref,
            `Expected ${dto.name}.${meta.propertyName} (${meta.name ?? meta.type}) message to decode to a MessageRef, received: ${String(meta.message)}`,
          ).not.toBeNull();

          expect(
            ref?.key,
            `Expected ${dto.name}.${meta.propertyName} MessageRef to have a string key`,
          ).toBeTypeOf('string');

          const exists = keyExistsInEnCatalog(ref!.key);
          expect(
            exists,
            `Key "${ref!.key}" used in ${dto.name}.${meta.propertyName} does not exist in the "en" contracts catalog`,
          ).toBe(true);
        }
      }
    }

    // Verify we tested a substantial set of custom messages across DTOs
    expect(totalConstraintsWithCustomMessage).toBeGreaterThan(25);
  });
});
