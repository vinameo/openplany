import { Module } from '@nestjs/common';
import {
  ProjectAccessPolicyStore,
  TempProjectAccessPolicyStore,
} from './projectAccessPolicyStore.js';

@Module({
  providers: [
    {
      provide: ProjectAccessPolicyStore,
      useClass: TempProjectAccessPolicyStore,
    },
  ],
  exports: [ProjectAccessPolicyStore],
})
export class RolesModule {}
