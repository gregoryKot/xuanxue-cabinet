// Одноразовый импорт занятий из файла сида в Mongo — идемпотентный: второй
// запуск ничего не дублирует (PLAN.md §9). Дубли ищутся по (title,
// groupLabel), не по содержимому — учитель может поправить время слота в
// файле и перезапустить импорт, ничего не потеряв в уже созданном классе.
import { readFile } from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { groupNameKey } from '@xuanxue/shared';
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

/** Как школа пишет «все группы» в файле сида (ADR-0196: все группы школы). */
const ALL_GROUPS_SEED_LABEL = 'все группы';

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
      // Группы из файла — группы школы (ADR-0193): находятся по названию или
      // заводятся, подпись сервер соберёт сам (ADR-0196). Дубль ищется по
      // (title, группы): одна ссылка — общий слот школы (PLAN.md §9), а не
      // отдельный класс на каждое правило расписания.
      const { groupLabel: label, ...input } = cls;
      const groupIds = await this.resolveSeedGroups(label ?? '');
      const exists = await this.model.exists({
        title: cls.title,
        groupIds: groupIds.map((id) => new Types.ObjectId(id)),
      });
      if (exists) {
        skipped.push(name);
        continue;
      }
      await this.classesService.create({ ...input, groupIds });
      created.push(name);
    }

    return { created, skipped };
  }

  /** «все группы» из файла — все группы школы на сейчас (ADR-0196: отдельного
   * состояния «для всех» нет); иначе названия через запятую, каждое — группа.
   * В порядке создания групп — как их хранит занятие, чтобы повторный импорт
   * находил своё. */
  private async resolveSeedGroups(label: string): Promise<string[]> {
    const names = label.split(',').filter((name) => name.trim() !== '');
    const ids =
      names.length === 1 && groupNameKey(label) === ALL_GROUPS_SEED_LABEL
        ? (await this.groupsService.list()).map((group) => group.id)
        : await Promise.all(names.map((name) => this.groupsService.ensureByName(name)));
    return [...new Set(ids)].sort();
  }
}
