// CRUD формы экзамена (данные школы, ADR-0010: доступ по роли, не по
// владельцу). Инкапсулирует шифрование содержательных полей (title/
// description/blocks, CLAUDE.md «Данные», чеклист коллекции) и правила ТЗ
// 4.3: вопрос блока — опубликован в банке и не повторяется по форме,
// публикация требует хотя бы один вопрос — контроллер только валидирует
// тело и зовёт.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
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
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { encryptRecord } from '../utils/encryption';
import { ExamAttemptRecord } from './exam-attempt.schema';
import { assertNoRepeatedItems, hasAnyQuestion, mapBlocks } from './exam-blocks';
import { assertItemsEligible } from './exam-items-eligible';
import { removeExamIfNotAttempted } from './exam-attempt-references';
import { ExamItemRecord } from './exam-item.schema';
import { EXAM_ENCRYPT_SCHEMA, ExamRecord, type ExamBlockRecord } from './exam.schema';
import { decryptExam, toExamDto, type RawLeanExam } from './exam.mapper';

const NOT_FOUND_MESSAGE = EXAM_NOT_FOUND_MESSAGE;
// VOICE.md: что случилось и что сделать. Тот же приём, что у NOT_DRAFT_MESSAGE
// в exam-items.service.ts (ТЗ 4.3, п.5), свой текст: на форму, а не на вопрос.
const NOT_DRAFT_MESSAGE =
  'Удалить можно только черновик формы — на опубликованную или архивную могут ' +
  'ссылаться попытки учеников. Опубликованную переведите в архив вместо удаления.';
const EMPTY_EXAM_MESSAGE =
  'В форме нет ни одного вопроса. Добавьте хотя бы один блок с вопросом, потом публикуйте.';

@Injectable()
export class ExamsService {
  constructor(
    @InjectModel(ExamRecord.name) private readonly model: Model<ExamRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
  ) {}

  async list(query: ListExamsQuery): Promise<ExamDto[]> {
    const filter: Record<string, unknown> = {};
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
    const doc = await this.model.findById(id).lean<RawLeanExam>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamDto(decryptExam(doc));
  }

  // createdBy необязателен — CLI-импорт сида (seed-exam.service.ts) создаёт
  // форму без вошедшего в систему человека; схема поля не требует
  // (ExamRecord.createdBy, required: false).
  async create(input: CreateExamInput, createdBy?: string): Promise<ExamDto> {
    const { blocks, ...rest } = input;
    const mappedBlocks = mapBlocks(blocks);
    if (mappedBlocks !== undefined) await this.assertBlocksSavable(mappedBlocks);

    const payload: Record<string, unknown> = {
      ...rest,
      ...(createdBy !== undefined ? { createdBy } : {}),
    };
    if (mappedBlocks !== undefined) payload.blocks = mappedBlocks;

    const created = await this.model.create(encryptRecord(payload, EXAM_ENCRYPT_SCHEMA));
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateExamInput): Promise<ExamDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanExam>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const current = decryptExam(doc);

    const { blocks, status, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_EXAM_FIELDS);

    const nextBlocks = mapBlocks(blocks);
    if (nextBlocks !== undefined) {
      await this.assertBlocksSavable(nextBlocks);
      $set.blocks = nextBlocks;
    }
    if ((status ?? current.status) === 'published') {
      await this.assertPublishable(nextBlocks ?? current.blocks);
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

  async remove(id: string): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    await removeExamIfNotAttempted(this.model, this.attemptModel, id, NOT_DRAFT_MESSAGE);
  }

  /** ТЗ 4.3, п.2–4: вопрос не повторяется по всей форме и ссылается только на
   * опубликованный вопрос банка. Зовётся при каждом сохранении блоков —
   * черновик формы уже не должен ссылаться на чужой/удалённый/неопубликованный id. */
  private async assertBlocksSavable(blocks: ExamBlockRecord[]): Promise<void> {
    assertNoRepeatedItems(blocks);
    await assertItemsEligible(this.itemModel, blocks);
  }

  /** ТЗ 4.3, п.1–2: инвариант published-формы — не пустая, и вопрос блока
   * всё ещё опубликован в банке. Зовётся на переходе в `published` и на
   * каждом сохранении уже опубликованной (update(), блокер аудита №3). */
  private async assertPublishable(blocks: ExamBlockRecord[]): Promise<void> {
    if (!hasAnyQuestion(blocks)) throw new InvalidInputError(EMPTY_EXAM_MESSAGE);
    await assertItemsEligible(this.itemModel, blocks);
  }
}
