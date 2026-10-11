import { type FindOptionsWhere, IsNull } from 'typeorm';
import type { Project } from './entities/project.entity.js';
import type { ProjectMember } from './entities/projectMember.entity.js';

export const ACTIVE_PROJECT: FindOptionsWhere<Project> = {
  deletedAt: IsNull(),
};

export const ACTIVE_PROJECT_MEMBER: FindOptionsWhere<ProjectMember> = {
  isActive: true,
};
