import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Responses carry personal data.
    consumer.apply(NoStoreMiddleware).forRoutes(ProfileController);
  }
}
