// Одноразовый импорт занятий из файла сида в Mongo — идемпотентный: второй
// запуск ничего не дублирует (PLAN.md §9). Дубли ищутся по (title,
// groupLabel), не по содержимому — учитель может поправить время слота в
// файле и перезапустить импорт, ничего не потеряв в уже созданном классе.
import { readFile } from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ALL_GROUPS_LABEL, groupNameKey } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { isEncryptionConfigured } from '../utils/encryption';
import { ClassesService } from '../classes/classes.service';
import { ClassRecord } from '../classes/class.schema';
import { GroupsService } from '../groups/groups.service';
import {
  parseSeedFile,
  validateSeedClasses,
  type SeedValidationError,
} from './seed-file';

export interface SeedReport {
  created: string[];
  skipped: string[];
}

/** Файл сида не прошёл валидацию тем же DTO, что и POST /classes — CLI
 * (seed-classes.ts через seed-report.ts) печатает `errors` построчно и
 * завершается кодом 1. */
export class SeedValidationFailedError extends Error {
  constructor(readonly errors: SeedValidationError[]) {
    super(`Файл сида не прошёл валидацию: ${errors.length} ошибок.`);
  }
}

const MISSING_KEY_MESSAGE =
  'Не задан ENCRYPTION_KEY — ссылки и пароли легли бы в базу открытым текстом. ' +
  'Укажите тот же ключ, что в Railway, и повторите импорт.';

function describeClass(title: string, groupLabel: string | undefined): string {
  return groupLabel ? `${title} (${groupLabel})` : title;
}

@Injectable()
export class SeedService {
  constructor(
    @InjectModel(ClassRecord.name) private readonly model: Model<ClassRecord>,
    private readonly classesService: ClassesService,
    private readonly groupsService: GroupsService,
  ) {}

  async importClasses(filePath: string): Promise<SeedReport> {
    const text = await readFile(filePath, 'utf8');
    const seed = parseSeedFile(text);

    // Пишем ровно те экземпляры, что провалидированы (title обрезан
    // @TrimString, лишние поля файла вычищены whitelist) — не сырые записи
    // из JSON: иначе валидируется одна копия, а в базу уходит другая.
    const { errors, classes } = validateSeedClasses(seed);
    if (errors.length > 0) throw new SeedValidationFailedError(errors);

    // До ЛЮБОЙ записи: если хоть один класс несёт секрет, а ключа нет,
    // encrypt() в dev тихо сохранил бы его открытым текстом (utils/encryption.ts) —
    // для импорта настоящих ссылок и паролей это отказ, а не тихий даунгрейд.
    const hasSecret = classes.some(
      (cls) => Boolean(cls.zoomLink) || Boolean(cls.zoomPassword),
    );
    if (hasSecret && !isEncryptionConfigured()) {
      throw new InvalidInputError(MISSING_KEY_MESSAGE);
    }

    const created: string[] = [];
    const skipped: string[] = [];

    for (const cls of classes) {
      const name = describeClass(cls.title, cls.groupLabel);
      // Точное совпадение (title, groupLabel) — тот же ключ, что и в
      // человеческом описании отчёта: одна ссылка — общий слот школы
      // (PLAN.md §9), а не отдельный класс на каждое правило расписания.
      const groupLabel = cls.groupLabel ?? '';
      const exists = await this.model.exists({ title: cls.title, groupLabel });
      if (exists) {
        skipped.push(name);
        continue;
      }
      // Группа из файла — группа школы (ADR-0193): находится по названию или
      // заводится, занятие получает её id, а подпись сервер соберёт сам (ADR-0195).
      const { groupLabel: label, ...input } = cls;
      // «все группы» из файла — занятие для всех групп (ADR-0195), не группа с
      // таким названием.
      const forAllGroups = groupNameKey(label ?? '') === groupNameKey(ALL_GROUPS_LABEL);
      const groupId =
        label && !forAllGroups ? await this.groupsService.ensureByName(label) : null;
      await this.classesService.create({ ...input, groupId, forAllGroups });
      created.push(name);
    }

    return { created, skipped };
  }
}
