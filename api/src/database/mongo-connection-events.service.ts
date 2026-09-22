// Связка с DI Nest — сама логика логов в mongo-connection-events.ts
// (тот же приём, что у IndexSyncService: onApplicationBootstrap там
// делегирует в run()). Аудит 2026-09-21 — см. mongo-connection-events.ts.
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { logMongoConnectionEvents } from './mongo-connection-events';

@Injectable()
export class MongoConnectionEventsService implements OnModuleInit {
  private readonly logger = new Logger(MongoConnectionEventsService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit(): void {
    logMongoConnectionEvents(this.connection, this.logger);
  }
}
