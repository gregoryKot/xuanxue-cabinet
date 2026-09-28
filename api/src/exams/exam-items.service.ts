// CRUD банка вопросов (данные школы, ADR-0010: доступ по роли, не по
// владельцу). Инкапсулирует шифрование содержательных полей и версии
// опубликованных вопросов (ТЗ 4.2, п.3) — контроллер только валидирует и зовёт.
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
import { NOT_DELETED, softDelete } from '../common/soft-delete';
import { encryptRecord } from '../utils/encryption';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { ExamVideosService } from '../exam-videos/exam-videos.service';
import { assertItemNotUsedForArchive } from './exam-item-references';
import { buildHistoryEntry, hasContentChanged } from './exam-item-content-change';
import {
  assertOptionsForKind,
  assertReasonAllowedForKind,
  collectImageIds,
  mapOptions,
} from './exam-item-options';
import { assertOneVideoSource, collectItemVideoIds } from './exam-item-video';
import { EXAM_ITEM_ENCRYPT_SCHEMA, ExamItemRecord } from './exam-item.schema';
import { decryptExamItem, toExamItemDto, type RawLeanExamItem } from './exam-item.mapper';
import { ExamRecord } from './exam.schema';

const NOT_FOUND_MESSAGE = EXAM_ITEM_NOT_FOUND_MESSAGE;

@Injectable()
export class ExamItemsService {
  constructor(
    @InjectModel(ExamItemRecord.name) private readonly model: Model<ExamItemRecord>,
    @InjectModel(ExamRecord.name) private readonly examModel: Model<ExamRecord>,
    private readonly examImagesService: ExamImagesService,
    private readonly examVideosService: ExamVideosService,
  ) {}

  // includeDeleted (ADR-0140) — редактору формы нужна формулировка вопроса,
  // которого уже нет в банке, но который стоит в блоке.
  async list(query: ListExamItemsQuery): Promise<ExamItemDto[]> {
    const filter: Record<string, unknown> = {};
    if (!query.includeDeleted) Object.assign(filter, NOT_DELETED);
    if (query.status !== undefined) filter.status = query.status;
    if (query.kind !== undefined) filter.kind = query.kind;
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanExamItem[]>();
    return docs.map((doc) => toExamItemDto(decryptExamItem(doc)));
  }

  // includeDeleted — createAttempt (exam-attempt-start.ts) читает через этот
  // же метод удалённый, но ещё стоящий в форме вопрос (ADR-0140).
  async getById(id: string, includeDeleted = false): Promise<ExamItemDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const filter = includeDeleted ? { _id: id } : { _id: id, ...NOT_DELETED };
    const doc = await this.model.findOne(filter).lean<RawLeanExamItem>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamItemDto(decryptExamItem(doc));
  }

  // authorId необязателен — CLI-импорт сида заводит вопросы без вошедшего
  // в систему человека (ExamItemRecord.authorId, required: false).
  async create(input: CreateExamItemInput, authorId?: string): Promise<ExamItemDto> {
    assertOneVideoSource(input.videoId, input.videoUrl);
    assertReasonAllowedForKind(input.kind, input.askReason ?? false);
    const options = mapOptions(assertOptionsForKind(input.kind, input.options));
    await this.examImagesService.assertExist(collectImageIds(options, []));
    await this.examVideosService.assertExist(
      collectItemVideoIds(input.videoId, options, []),
    );
    const payload: Record<string, unknown> = {
      kind: input.kind,
      prompt: input.prompt,
      options,
      ...(authorId !== undefined ? { authorId } : {}),
      ...(input.videoId !== undefined ? { videoId: input.videoId } : {}),
      ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl } : {}),
      ...(input.askReason ? { askReason: true } : {}),
      imageIds: collectImageIds(options, []),
      videoIds: collectItemVideoIds(input.videoId, options, []),
    };
    // Не прислали — схемный default (`published`, ADR-0033); лишнего ключа не надо.
    if (input.status !== undefined) payload.status = input.status;
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
    const filter = { _id: id, ...NOT_DELETED };
    const doc = await this.model.findOne(filter).lean<RawLeanExamItem>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const current = decryptExamItem(doc);

    // Архивация рвёт ссылку (exam-item-references.ts, ADR-0140).
    if (input.status === 'archived') {
      await assertItemNotUsedForArchive(this.examModel, id);
    }

    const { options, ...rest } = input;
    // videoId/videoUrl — единственные nullable-поля вопроса (ADR-0133).
    const { $set, $unset } = splitUpdate(rest, NULLABLE_EXAM_ITEM_FIELDS);
    const nextOptions =
      options === undefined
        ? undefined
        : mapOptions(assertOptionsForKind(current.kind, options));
    await this.examImagesService.assertExist(collectImageIds(nextOptions ?? [], []));

    // Не пришло (undefined) — «оставить как было», null (nullable-поле) — «снять».
    const nextVideoId =
      input.videoId === undefined ? current.videoId : (input.videoId ?? undefined);
    const nextVideoUrl =
      input.videoUrl === undefined ? current.videoUrl : (input.videoUrl ?? undefined);
    assertOneVideoSource(nextVideoId, nextVideoUrl);
    await this.examVideosService.assertExist(
      collectItemVideoIds(nextVideoId, nextOptions ?? current.options, current.history),
    );
    const nextAskReason = input.askReason ?? current.askReason ?? false;
    assertReasonAllowedForKind(current.kind, nextAskReason);
    if (nextOptions !== undefined) $set.options = nextOptions;

    // Версия поднимается по сути правки, не по факту присланного поля
    // (exam-item-content-change.ts) — сохранение без правки не засоряет историю.
    const contentChanged = hasContentChanged(input, nextOptions, current);
    const nextHistory =
      contentChanged && current.status === 'published'
        ? [buildHistoryEntry(current, toIsoUtc(now.toJSDate())), ...current.history]
        : current.history;
    if (contentChanged && current.status === 'published') {
      $set.version = current.version + 1;
      $set.history = nextHistory;
    }
    // Пересчитываем всегда — поле выравнивается и у документов без него (ADR-0035).
    $set.imageIds = collectImageIds(nextOptions ?? current.options, nextHistory);
    $set.videoIds = collectItemVideoIds(
      nextVideoId,
      nextOptions ?? current.options,
      nextHistory,
    );

    const update: UpdateCommand = { $set: encryptRecord($set, EXAM_ITEM_ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const updated = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<RawLeanExamItem>();
    if (!updated) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toExamItemDto(decryptExamItem(updated));
  }

  // Вопрос удаляется в любом статусе, даже если стоит в форме — форма
  // продолжает получать его снимком (ADR-0140, exam-items-eligible.ts).
  async remove(id: string, now: DateTime): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    await softDelete(this.model, id, now, NOT_FOUND_MESSAGE);
  }
}
