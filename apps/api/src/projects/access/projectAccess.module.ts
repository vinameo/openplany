import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../roles/roles.module.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import {
  ProjectAccessResolver,
  TypeOrmProjectAccessResolver,
} from './projectAccessResolver.js';

@Module({
  imports: [RolesModule, TypeOrmModule.forFeature([Project, ProjectMember])],
  providers: [
    {
      provide: ProjectAccessResolver,
      useClass: TypeOrmProjectAccessResolver,
    },
  ],
  exports: [ProjectAccessResolver],
})
export class ProjectAccessModule {}
