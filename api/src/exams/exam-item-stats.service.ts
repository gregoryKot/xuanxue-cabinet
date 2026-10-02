// Доступ к данным для статистики вопроса банка (ТЗ 4.8, docs/PLAN.md §11).
// Не агрегация Mongo: `blocks`/`answers` в `exam_attempts` хранятся
// зашифрованной JSON-строкой (`encJson`, exam-attempt.schema.ts) — Mongo не
// видит внутри них ни `itemId`, ни `optionIds`, фильтровать или группировать
// таким запросом нельзя. Поэтому один `find` по статусу (индекс
// `status+submittedAt`, exam-attempt.schema.ts) и один проход по
// расшифрованным попыткам в памяти (accumulateAttemptStats,
// exam-item-stats-accumulate.ts) — без похода в базу за каждой попыткой
// (CLAUDE.md «API»: без N+1).
//
// Аудит 2026-10-01, F32: раньше `find` тянул попытки целиком и все разом —
// «дай всё» (CLAUDE.md «API»), и каждое открытие «Экзаменов» расшифровывало
// всю историю сдач. Теперь проекция двух нужных полей (`blocks`/`answers`) и
// курсор батчами: в памяти один батч, не вся коллекция. Результат тот же —
// накопитель принимает попытки по частям (спек сверяет с полным списком).
//
// Ревью #535: у драйвера общий `timeoutMS` (MONGO_OPERATION_TIMEOUT_MS, 20 с),
// а у курсора `timeoutMode` по умолчанию `cursorLifetime` — весь проход с
// расшифровкой обязан был бы уложиться в 20 с, и статистика падала бы по
// таймауту в день экзамена. `iteration` даёт бюджет на каждую порцию (getMore).
// `timeoutMode` без явного `timeoutMS` драйвер отвергает — оба стоят на запросе.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type Types } from 'mongoose';
import type {
  ExamAttemptStatus,
  ExamItemKind,
  ExamItemStatsDto,
  ExamItemStatsSummaryDto,
} from '@xuanxue/shared';
import { NOT_DELETED } from '../common/soft-delete';
import { MONGO_OPERATION_TIMEOUT_MS } from '../database/mongoose-options';
import { decryptRecord } from '../utils/encryption';
import { logBrokenAttempt } from './exam-attempt-decrypt-safe';
import { EXAM_ATTEMPT_ENCRYPT_SCHEMA, ExamAttemptRecord } from './exam-attempt.schema';
import { findExamsReferencingItem } from './exam-item-references';
import {
  accumulateAttemptStats,
  type AttemptStatsInput,
  type ItemStatsAccumulator,
} from './exam-item-stats-accumulate';
import { computeExamItemStats, computeStrugglingCount } from './exam-item-stats';
import { decryptExamItem, type RawLeanExamItem } from './exam-item.mapper';
import { ExamItemRecord } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord } from './exam.schema';

// Попытка «в работе» не в счёт (ТЗ 4.8: ученик мог не закончить её или ещё
// передумает менять ответ) — считаются только сданные.
const COUNTED_STATUSES: ExamAttemptStatus[] = ['submitted', 'graded'];
// Только у этих типов вопроса вообще бывает «верно/неверно» (ТЗ 4.2, п.2).
const OPTION_KINDS: ExamItemKind[] = ['single', 'multiple'];
// F32: что читаем из попытки и по сколько документов за раз. Батч — размер
// одной порции драйвера, не окно выборки: проход всё равно идёт по всем
// сданным попыткам (ТЗ 4.8: статистика за всё время, усечённая выборка
// молча врала бы учителю).
const ATTEMPT_STATS_FIELDS = 'blocks answers';
const ATTEMPT_STATS_BATCH_SIZE = 100;
// Параметры курсора целиком; что они доходят до драйвера, сверяет спек.
const ATTEMPT_STATS_CURSOR_OPTIONS = {
  batchSize: ATTEMPT_STATS_BATCH_SIZE,
  timeoutMS: MONGO_OPERATION_TIMEOUT_MS,
  timeoutMode: 'iteration',
} as const;

// Строка попытки в проекции ATTEMPT_STATS_FIELDS: `blocks`/`answers` ещё
// зашифрованная строка (encJson). Index-signature — требование
// `decryptRecord`, тот же приём, что у ReferencingExamRow (exam-item-references.ts).
interface AttemptStatsRow {
  [key: string]: unknown;
  // Проекция `_id` не отключает: он нужен, чтобы назвать битую попытку в логе.
  _id: Types.ObjectId;
  blocks: string;
  answers: string;
}

/** Тот же разбор и та же проверка формы, что у decryptAttempt
 * (exam-attempt.mapper.ts), но для строки из двух полей — полный
 * `RawLeanExamAttempt` сюда не приходит. Битая попытка — пропуск с error-логом
 * (attemptId), не 500 на всю статистику (F55, аудит 2026-10-01; ревью #529). */
function decryptAttemptStatsRowOrNull(row: AttemptStatsRow): AttemptStatsInput | null {
  try {
    const { blocks, answers } = decryptRecord(row, EXAM_ATTEMPT_ENCRYPT_SCHEMA);
    if (!Array.isArray(blocks) || !Array.isArray(answers)) {
      throw new Error('blocks/answers — не массив');
    }
    return {
      blocks: blocks as unknown as AttemptStatsInput['blocks'],
      answers: answers as unknown as AttemptStatsInput['answers'],
    };
  } catch (err) {
    logBrokenAttempt(row._id, err);
    return null;
  }
}

@Injectable()
export class ExamItemStatsService {
  constructor(
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    @InjectModel(ExamRecord.name) private readonly examModel: Model<ExamRecord>,
    private readonly examItemsService: ExamItemsService,
  ) {}

  /** Статистика одного вопроса — 404 у несуществующего/битого id тот же, что
   * у остальных ручек банка (ExamItemsService.getById). `usedInExamsCount` —
   * тот же запрос, что и защита от удаления/архивации (exam-item-references.
   * ts, CLAUDE.md «Одна механика — один компонент»), не второй счётчик. */
  async getStats(itemId: string): Promise<ExamItemStatsDto> {
    const item = await this.examItemsService.getById(itemId);
    const accByItem = await this.loadAccumulators();
    // DTO целиком: статистике нужны и прошлые редакции — текст варианта,
    // которого в вопросе больше нет (F62, exam-item-stats.ts).
    const stats = computeExamItemStats(item, accByItem);
    const { titles } = await findExamsReferencingItem(this.examModel, itemId);
    return { ...stats, usedInExamsCount: titles.length };
  }

  /** Одно число для карточки-ссылки «Вопросы» на «Экзаменах» (CLAUDE.md
   * «Продуктовая фича = число в своём разделе», выбор метрики —
   * shared/src/exam-item-stats.ts). */
  async getSummary(): Promise<ExamItemStatsSummaryDto> {
    const accByItem = await this.loadAccumulators();
    const docs = await this.itemModel
      .find({ kind: { $in: OPTION_KINDS }, ...NOT_DELETED })
      .lean<RawLeanExamItem[]>();
    const items = docs.map((doc) => {
      const decrypted = decryptExamItem(doc);
      return { id: decrypted._id.toString(), options: decrypted.options };
    });
    return { strugglingCount: computeStrugglingCount(items, accByItem) };
  }

  private async loadAccumulators(): Promise<Map<string, ItemStatsAccumulator>> {
    const byItem = new Map<string, ItemStatsAccumulator>();
    const cursor = this.attemptModel
      .find({ status: { $in: COUNTED_STATUSES } })
      .select(ATTEMPT_STATS_FIELDS)
      .lean<AttemptStatsRow[]>()
      .cursor({ ...ATTEMPT_STATS_CURSOR_OPTIONS });
    for await (const row of cursor) {
      const input = decryptAttemptStatsRowOrNull(row);
      if (!input) continue;
      accumulateAttemptStats([input], byItem);
    }
    return byItem;
  }
}
