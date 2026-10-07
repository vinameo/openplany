import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './dataSourceOptions.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions({
          DATABASE_URL: config.getOrThrow<string>('DATABASE_URL'),
          DB_LOGGING: config.getOrThrow<boolean>('DB_LOGGING'),
          DB_MIGRATIONS_RUN: config.getOrThrow<boolean>('DB_MIGRATIONS_RUN'),
        }),
        // Feature modules register entities via TypeOrmModule.forFeature().
        entities: [],
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
