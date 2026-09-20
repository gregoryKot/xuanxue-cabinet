// Журнал объектов, которые надо убрать из хранилища (ADR-0079). Домен,
// который кладёт файл, зовёт `track` до записи в R2 и `forget` после того,
// как на объект сослались; на замену и удаление — `removeNow`. Всё, что
// `removeNow` не осилил, доберёт шаг планировщика (`sweep`).
//
// Сервис не знает ни про материалы, ни про их права: журнал общий для любого
// домена с файлами (CLAUDE.md «Одна механика — один компонент»).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { errorMessage } from '../common/error-info';
import { FileStoreService } from './file-store.service';
import { StorageOrphanRecord } from './storage-orphan.schema';

// Между `track` и `forget` проходят секунды — сутки на «загрузка ещё идёт»,
// то же число и та же причина, что у картинок вариантов (ADR-0035).
const ORPHAN_AGE_HOURS = 24;
// Не «дай всё» (CLAUDE.md «API») — следующий тик доберёт остаток, тот же
// приём, что у SWEEP_BATCH_LIMIT соседнего шага (exam-image-sweep.service.ts).
const SWEEP_BATCH_LIMIT = 50;

export interface StorageSweepResult {
  removed: number;
}

@Injectable()
export class StorageOrphansService {
  private readonly logger = new Logger(StorageOrphansService.name);

  constructor(
    @InjectModel(StorageOrphanRecord.name)
    private readonly model: Model<StorageOrphanRecord>,
    private readonly fileStore: FileStoreService,
  ) {}

  /** Записать ключ до того, как объект появится в хранилище. `upsert` —
   * повтор того же ключа не плодит записей (уникальный индекс). */
  async track(key: string): Promise<void> {
    await this.model.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true });
  }

  /** Снять запись: на объект сослались, убирать его больше не нужно. */
  async forget(key: string): Promise<void> {
    await this.model.deleteOne({ key });
  }

  /** Удалить объект «тем же действием», что заменило или удалило запись
   * (ADR-0057). Запись в журнал — первой: не удалось удалить сейчас, уберёт
   * шаг планировщика. Поэтому метод не бросает — иначе замена файла падала бы
   * у учителя из-за недоступного хранилища, хотя новый файл уже лёг. */
  async removeNow(key: string, now: DateTime): Promise<void> {
    await this.track(key);
    try {
      await this.fileStore.remove(key, now);
    } catch (err) {
      this.logger.warn(
        `Объект ${key} не удалён сразу, остался уборщику: ${errorMessage(err)}`,
      );
      return;
    }
    await this.forget(key);
  }

  /** Шаг планировщика: записи старше суток. Без ключей R2 (хранилище
   * выключено) шаг ничего не делает — записи дождутся возвращения ключей. */
  async sweep(now: DateTime): Promise<StorageSweepResult> {
    if (!this.fileStore.isEnabled) return { removed: 0 };
    const boundary = now.minus({ hours: ORPHAN_AGE_HOURS }).toJSDate();
    const candidates = await this.model
      .find({ createdAt: { $lt: boundary } }, { key: 1 })
      .sort({ createdAt: 1 })
      .limit(SWEEP_BATCH_LIMIT)
      .lean();

    let removed = 0;
    for (const { key } of candidates) {
      try {
        await this.fileStore.remove(key, now);
      } catch (err) {
        // Хранилище недоступно или отказало — запись остаётся, следующий тик
        // попробует снова. Остальные кандидаты этого тика не страдают.
        this.logger.warn(`Уборка объекта ${key} не удалась: ${errorMessage(err)}`);
        continue;
      }
      await this.forget(key);
      removed += 1;
    }
    return { removed };
  }
}
