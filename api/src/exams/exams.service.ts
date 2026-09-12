// CRUD формы экзамена (данные школы, ADR-0010: доступ по роли, не по
// владельцу). Инкапсулирует шифрование содержательных полей (title/
// description/blocks, CLAUDE.md «Данные», чеклист коллекции) и правила ТЗ
// 4.3: вопрос блока — опубликован в банке и не повторяется по форме,
// публикация требует хотя бы один вопрос — контроллер только валидирует
// тело и зовёт.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EXAM_NOT_FOUND_MESSAGE,
  LIST_LIMIT_DEFAULT,
  NULLABLE_EXAM_FIELDS,
  pluralRu,
  type CreateExamInput,
  type ExamDto,
  type ListExamsQuery,
  type UpdateExamInput,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { removeIfDraft } from '../common/remove-if-draft';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { assertNoRepeatedItems, hasAnyQuestion, mapBlocks } from './exam-blocks';
import { ExamItemRecord } from './exam-item.schema';
import { EXAM_ENCRYPT_SCHEMA, ExamRecord, type ExamBlockRecord } from './exam.schema';
import { toExamDto, type LeanExam, type RawLeanExam } from './exam.mapper';

const NOT_FOUND_MESSAGE = EXAM_NOT_FOUND_MESSAGE;
// VOICE.md: что случилось и что сделать. Тот же приём, что у NOT_DRAFT_MESSAGE
// в exam-items.service.ts (ТЗ 4.3, п.5), свой текст: на форму, а не на вопрос.
const NOT_DRAFT_MESSAGE =
  'Удалить можно только черновик формы — на опубликованную или архивную могут ' +
  'ссылаться попытки учеников. Опубликованную переведите в архив вместо удаления.';
const EMPTY_EXAM_MESSAGE =
  'В форме нет ни одного вопроса. Добавьте хотя бы один блок с вопросом, потом публикуйте.';

const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
} as const;

@Injectable()
export class ExamsService {
  constructor(
    @InjectModel(ExamRecord.name) private readonly model: Model<ExamRecord>,
    @InjectModel(ExamItemRecord.name) private readonly itemModel: Model<ExamItemRecord>,
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
    return docs.map((doc) => toExamDto(this.decrypt(doc)));
  }

  async getById(id: string): Promise<ExamDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanExam>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamDto(this.decrypt(doc));
  }

  async create(input: CreateExamInput, createdBy: string): Promise<ExamDto> {
    const { blocks, ...rest } = input;
    const mappedBlocks = mapBlocks(blocks);
    if (mappedBlocks !== undefined) await this.assertBlocksSavable(mappedBlocks);

    const payload: Record<string, unknown> = { ...rest, createdBy };
    if (mappedBlocks !== undefined) payload.blocks = mappedBlocks;

    const created = await this.model.create(encryptRecord(payload, EXAM_ENCRYPT_SCHEMA));
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateExamInput): Promise<ExamDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanExam>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const current = this.decrypt(doc);

    const { blocks, status, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_EXAM_FIELDS);

    const nextBlocks = mapBlocks(blocks);
    if (nextBlocks !== undefined) {
      await this.assertBlocksSavable(nextBlocks);
      $set.blocks = nextBlocks;
    }
    if (status === 'published') {
      await this.assertPublishable(nextBlocks ?? current.blocks);
    }
    if (status !== undefined) $set.status = status;

    const update: UpdateCommand = { $set: encryptRecord($set, EXAM_ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const updated = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<RawLeanExam>();
    if (!updated) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamDto(this.decrypt(updated));
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    await removeIfDraft(this.model, id, NOT_FOUND_MESSAGE, NOT_DRAFT_MESSAGE);
  }

  /** ТЗ 4.3, п.2–4: вопрос не повторяется по всей форме и ссылается только на
   * опубликованный вопрос банка. Зовётся при каждом сохранении блоков —
   * черновик формы уже не должен ссылаться на чужой/удалённый/неопубликованный id. */
  private async assertBlocksSavable(blocks: ExamBlockRecord[]): Promise<void> {
    assertNoRepeatedItems(blocks);
    await this.assertItemsEligible(blocks);
  }

  /** ТЗ 4.3, п.1 и п.2: пустую форму публиковать нельзя, и вопрос могли
   * перевести в черновик/архив уже после того, как он попал в блок —
   * повторная проверка на переходе в `published`, не только при сохранении. */
  private async assertPublishable(blocks: ExamBlockRecord[]): Promise<void> {
    if (!hasAnyQuestion(blocks)) throw new InvalidInputError(EMPTY_EXAM_MESSAGE);
    await this.assertItemsEligible(blocks);
  }

  private async assertItemsEligible(blocks: ExamBlockRecord[]): Promise<void> {
    const ids = [...new Set(blocks.flatMap((block) => block.itemIds))];
    if (ids.length === 0) return;
    const validObjectIds = ids.filter((id) => Types.ObjectId.isValid(id));
    const published = await this.itemModel
      .find({ _id: { $in: validObjectIds }, status: 'published' })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>();
    const publishedIds = new Set(published.map((doc) => doc._id.toString()));
    const notEligibleCount = ids.filter((id) => !publishedIds.has(id)).length;
    if (notEligibleCount === 0) return;
    throw new InvalidInputError(
      `В блоках ${notEligibleCount} ${pluralRu(notEligibleCount, QUESTION_FORMS)} не ` +
        'из опубликованного банка: вопрос удалили или ещё не опубликовали. Уберите их ' +
        'из блока или опубликуйте вопрос в «Вопросах».',
    );
  }

  /** `blocks` хранится строкой (encJson, exam.schema.ts) — decryptRecord (не
   * параметризована по конкретному полю, как и у ExamItemsService.decrypt)
   * возвращает его с тем же типом `string`, хотя на деле это уже разобранный
   * JSON; приводим явно один раз здесь. */
  private decrypt(doc: RawLeanExam): LeanExam {
    const decrypted = decryptRecord(doc, EXAM_ENCRYPT_SCHEMA);
    return {
      ...decrypted,
      blocks: decrypted.blocks as unknown as ExamBlockRecord[],
    };
  }
}
