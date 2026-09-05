// syncIndexes() при старте (CLAUDE.md «Данные»: в production autoIndex: false,
// индексы строит только этот сервис). Ошибка одной модели логируется с именем
// коллекции и не мешает остальным, но если ошибки были — бросаем: кривой
// уникальный индекс (дубликаты в данных) означает, что гарантия
// идемпотентности (ADR-0004) не держится, лучше не стартовать, чем
// раздавать двойные посты (RUNBOOK §7).
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Injectable()
export class IndexSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexSyncService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  async run(): Promise<void> {
    const failed: string[] = [];
    for (const [name, model] of Object.entries(this.connection.models)) {
      try {
        await model.syncIndexes();
      } catch (err) {
        failed.push(name);
        this.logger.error(`syncIndexes упал для коллекции ${name}: ${errorMessage(err)}`);
      }
    }
    if (failed.length > 0) {
      throw new Error(
        `Индексы не построены: ${failed.join(', ')} — приложение не стартует ` +
          '(дубликаты в данных мешают уникальному индексу, RUNBOOK §7).',
      );
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
