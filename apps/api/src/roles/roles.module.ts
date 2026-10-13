import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectAccessPolicyEntity } from './entities/projectAccessPolicy.entity.js';
import {
  ProjectAccessPolicyStore,
  TypeOrmProjectAccessPolicyStore,
} from './projectAccessPolicyStore.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectAccessPolicyEntity])],
  providers: [
    {
      provide: ProjectAccessPolicyStore,
      useClass: TypeOrmProjectAccessPolicyStore,
    },
  ],
  exports: [ProjectAccessPolicyStore],
})
export class RolesModule {}
