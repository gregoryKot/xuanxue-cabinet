// CRUD банка вопросов (данные школы, ADR-0010: доступ по роли, не по
// владельцу). Инкапсулирует шифрование содержательных полей (prompt/hint/
// criteria/options/history, CLAUDE.md «Данные», чеклист коллекции) и версии
// опубликованных вопросов (ТЗ 4.2, п.3) — контроллер только валидирует тело
// и зовёт.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import type {
  CreateExamItemInput,
  ExamItemDto,
  ListExamItemsQuery,
  UpdateExamItemInput,
} from '@xuanxue/shared';
import {
  EXAM_ITEM_NOT_FOUND_MESSAGE,
  LIST_LIMIT_DEFAULT,
  NULLABLE_EXAM_ITEM_FIELDS,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { toIsoUtc } from '../common/iso-date';
import { assertObjectId } from '../common/object-id';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { removeIfDraft } from '../common/remove-if-draft';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { hasContentChanged } from './exam-item-content-change';
import { assertOptionsForKind, mapOptions } from './exam-item-options';
import {
  EXAM_ITEM_ENCRYPT_SCHEMA,
  ExamItemRecord,
  type ExamItemOptionRecord,
  type ExamItemVersionRecord,
} from './exam-item.schema';
import {
  toExamItemDto,
  type LeanExamItem,
  type RawLeanExamItem,
} from './exam-item.mapper';

const NOT_FOUND_MESSAGE = EXAM_ITEM_NOT_FOUND_MESSAGE;
// VOICE.md: что случилось и что сделать. Вопрос без записей всё равно можно
// удалить (черновик) — сообщение адресует только заблокированный случай.
const NOT_DRAFT_MESSAGE =
  'Удалить можно только черновик — на опубликованный или архивный вопрос могут ' +
  'ссылаться сданные работы. Опубликованный переведите в архив вместо удаления.';

@Injectable()
export class ExamItemsService {
  constructor(
    @InjectModel(ExamItemRecord.name) private readonly model: Model<ExamItemRecord>,
  ) {}

  async list(query: ListExamItemsQuery): Promise<ExamItemDto[]> {
    const filter: Record<string, unknown> = {};
    if (query.status !== undefined) filter.status = query.status;
    if (query.kind !== undefined) filter.kind = query.kind;
    if (query.tag !== undefined) filter.tags = query.tag;
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanExamItem[]>();
    return docs.map((doc) => toExamItemDto(this.decrypt(doc)));
  }

  async getById(id: string): Promise<ExamItemDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanExamItem>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamItemDto(this.decrypt(doc));
  }

  async create(input: CreateExamItemInput, authorId: string): Promise<ExamItemDto> {
    const options = assertOptionsForKind(input.kind, input.options);
    const payload: Record<string, unknown> = {
      kind: input.kind,
      prompt: input.prompt,
      hint: input.hint,
      criteria: input.criteria,
      options: mapOptions(options),
      tags: input.tags ?? [],
      authorId,
    };
    const created = await this.model.create(
      encryptRecord(payload, EXAM_ITEM_ENCRYPT_SCHEMA),
    );
    return this.getById(created._id.toString());
  }

  async update(
    id: string,
    input: UpdateExamItemInput,
    now: DateTime,
  ): Promise<ExamItemDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanExamItem>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const current = this.decrypt(doc);

    const { options, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_EXAM_ITEM_FIELDS);
    const nextOptions =
      options === undefined
        ? undefined
        : mapOptions(assertOptionsForKind(current.kind, options));
    if (nextOptions !== undefined) $set.options = nextOptions;

    // Версия поднимается по сути правки, а не по факту присланного поля
    // (exam-item-content-change.ts): экран шлёт все содержательные поля
    // разом, и сохранение без единой правки не должно засорять историю.
    const contentChanged = hasContentChanged(input, nextOptions, current);
    if (contentChanged && current.status === 'published') {
      $set.version = current.version + 1;
      $set.history = [
        {
          version: current.version,
          prompt: current.prompt,
          hint: current.hint,
          criteria: current.criteria,
          options: current.options,
          replacedAt: toIsoUtc(now.toJSDate()),
        },
        ...current.history,
      ];
    }

    const update: UpdateCommand = { $set: encryptRecord($set, EXAM_ITEM_ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const updated = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<RawLeanExamItem>();
    if (!updated) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamItemDto(this.decrypt(updated));
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    await removeIfDraft(this.model, id, NOT_FOUND_MESSAGE, NOT_DRAFT_MESSAGE);
  }

  /** `options`/`history` хранятся строкой (encJson, exam-item.schema.ts) —
   * decryptRecord (не параметризована по конкретному полю, как и у
   * ChannelConfigService.readConfig) возвращает их с тем же типом `string`,
   * хотя на деле это уже разобранный JSON; приводим явно один раз здесь. */
  private decrypt(doc: RawLeanExamItem): LeanExamItem {
    const decrypted = decryptRecord(doc, EXAM_ITEM_ENCRYPT_SCHEMA);
    return {
      ...decrypted,
      options: decrypted.options as unknown as ExamItemOptionRecord[],
      history: decrypted.history as unknown as ExamItemVersionRecord[],
    };
  }
}
