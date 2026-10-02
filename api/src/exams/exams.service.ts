// CRUD формы экзамена (данные школы, ADR-0010: доступ по роли, не по
// владельцу). Инкапсулирует шифрование содержательных полей (title/
// description/blocks, CLAUDE.md «Данные», чеклист коллекции) и правила ТЗ
// 4.3: вопрос блока — опубликован в банке и не повторяется по форме,
// публикация требует хотя бы один вопрос — контроллер только валидирует
// тело и зовёт.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  EXAM_NOT_FOUND_MESSAGE,
  LIST_LIMIT_DEFAULT,
  NULLABLE_EXAM_FIELDS,
  type CreateExamInput,
  type ExamDto,
  type ListExamsQuery,
  type UpdateExamInput,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { NOT_DELETED, softDelete } from '../common/soft-delete';
import { parseUtcIso } from '../lessons/lesson-dates';
import { encryptRecord } from '../utils/encryption';
import { mapBlocks } from './exam-blocks';
import { ExamAttemptRecord } from './exam-attempt.schema';
import { deletedExamIds } from './deleted-exam-ids';
import { ExamItemRecord } from './exam-item.schema';
import { assertBlocksSavable, assertPublishable } from './exam-save-rules';
import { assertNoLiveAttempts, isUnpublishing } from './exam-unpublish-guard';
import { EXAM_ENCRYPT_SCHEMA, ExamRecord } from './exam.schema';
import { decryptExam, toExamDto, type RawLeanExam } from './exam.mapper';

const NOT_FOUND_MESSAGE = EXAM_NOT_FOUND_MESSAGE;

@Injectable()
export class ExamsService {
  constructor(
    @InjectModel(ExamRecord.name) private readonly model: Model<ExamRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    // Модель попытки, не ExamAttemptsService — тот сам зависит от ExamsService (цикл DI).
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
  ) {}

  async list(query: ListExamsQuery): Promise<ExamDto[]> {
    const filter: Record<string, unknown> = { ...NOT_DELETED };
    if (query.status !== undefined) filter.status = query.status;
    if (query.level !== undefined) filter.level = query.level;
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanExam[]>();
    return docs.map((doc) => toExamDto(decryptExam(doc)));
  }

  async getById(id: string): Promise<ExamDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findOne({ _id: id, ...NOT_DELETED }).lean<RawLeanExam>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamDto(decryptExam(doc));
  }

  // ADR-0140 — ExamAttemptsService.list вычитает попытки удалённых форм отсюда.
  deletedIds(): Promise<string[]> {
    return deletedExamIds(this.model);
  }

  // createdBy необязателен — CLI-импорт сида (seed-exam.service.ts) создаёт
  // форму без вошедшего в систему человека; схема поля не требует
  // (ExamRecord.createdBy, required: false).
  async create(input: CreateExamInput, createdBy?: string): Promise<ExamDto> {
    const { blocks, dueAt, ...rest } = input;
    const mappedBlocks = mapBlocks(blocks);
    if (mappedBlocks !== undefined)
      await assertBlocksSavable(this.itemModel, mappedBlocks);

    const payload: Record<string, unknown> = {
      ...rest,
      ...(createdBy !== undefined ? { createdBy } : {}),
      // Поле схемы — Date, не строка (тот же приём, что startsAt /lessons).
      ...(dueAt !== undefined ? { dueAt: parseUtcIso(dueAt, 'dueAt').toJSDate() } : {}),
    };
    if (mappedBlocks !== undefined) payload.blocks = mappedBlocks;

    const created = await this.model.create(encryptRecord(payload, EXAM_ENCRYPT_SCHEMA));
    return this.getById(created._id.toString());
  }

  /** `now` — момент запроса для гарда снятия с публикации (F10, аудит
   * 2026-10-01): контроллер передаёт его явно; сид, бот и createAndPublishExam
   * идут только в сторону `published` и гард не задевают, поэтому не передают. */
  async update(id: string, input: UpdateExamInput, now?: DateTime): Promise<ExamDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findOne({ _id: id, ...NOT_DELETED }).lean<RawLeanExam>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const current = decryptExam(doc);
    if (isUnpublishing(current.status, input.status)) {
      await assertNoLiveAttempts(this.attemptModel, id, now ?? DateTime.utc());
    }

    const { blocks, status, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_EXAM_FIELDS);
    // splitUpdate не знает о типах — dueAt иначе уйдёт строкой мимо Date.
    if (typeof $set.dueAt === 'string') {
      $set.dueAt = parseUtcIso($set.dueAt, 'dueAt').toJSDate();
    }

    const nextBlocks = mapBlocks(blocks);
    if (nextBlocks !== undefined) {
      await assertBlocksSavable(this.itemModel, nextBlocks);
      $set.blocks = nextBlocks;
    }
    if ((status ?? current.status) === 'published') {
      await assertPublishable(this.itemModel, nextBlocks ?? current.blocks);
    }
    if (status !== undefined) $set.status = status;

    const update: UpdateCommand = { $set: encryptRecord($set, EXAM_ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const updated = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<RawLeanExam>();
    if (!updated) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamDto(decryptExam(updated));
  }

  /** Учитель собирает экзамен в боте (ТЗ 4б.4, docs/PLAN.md §12, ADR-0024) —
   * тот же переход в `published`, что и в кабинете (create() черновиком,
   * потом update() со статусом): правила «хотя бы один вопрос»/«вопрос
   * опубликован в банке» (assertPublishable выше) отрабатывают сами,
   * бот не пишет вторую копию. */
  async createAndPublishExam(
    input: CreateExamInput,
    createdBy: string,
  ): Promise<ExamDto> {
    const created = await this.create(input, createdBy);
    return this.update(created.id, { status: 'published' });
  }

  // Удаляется в любом статусе, без отказа (ADR-0140) — попытки/оценки/медиа остаются.
  async remove(id: string, now: DateTime): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    await softDelete(this.model, id, now, NOT_FOUND_MESSAGE);
  }
}
