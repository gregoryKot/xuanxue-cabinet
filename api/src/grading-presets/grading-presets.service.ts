// CRUD заготовок частых комментариев при проверке (слой 4.6, PLAN §11,
// ADR-0041) — данные школы (ADR-0010): список общий для всего штата,
// доступ по роли проверяет GradingPresetsController.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GRADING_COMMENT_PRESET_NOT_FOUND_MESSAGE,
  LIST_LIMIT_DEFAULT,
  type CreateGradingCommentPresetInput,
  type GradingCommentPresetDto,
  type ListGradingCommentPresetsQuery,
  type UpdateGradingCommentPresetInput,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { encryptRecord } from '../utils/encryption';
import {
  decryptGradingCommentPreset,
  toGradingCommentPresetDto,
  type RawLeanGradingCommentPreset,
} from './grading-comment-preset.mapper';
import {
  GRADING_COMMENT_PRESET_ENCRYPT_SCHEMA,
  GradingCommentPresetRecord,
} from './grading-comment-preset.schema';

const NOT_FOUND_MESSAGE = GRADING_COMMENT_PRESET_NOT_FOUND_MESSAGE;

@Injectable()
export class GradingPresetsService {
  constructor(
    @InjectModel(GradingCommentPresetRecord.name)
    private readonly model: Model<GradingCommentPresetRecord>,
  ) {}

  /** Порядок — по времени создания (ADR-0041), без сортировки в памяти. */
  async list(query: ListGradingCommentPresetsQuery): Promise<GradingCommentPresetDto[]> {
    const docs = await this.model
      .find()
      .sort({ createdAt: 1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanGradingCommentPreset[]>();
    return docs.map((doc) => toGradingCommentPresetDto(decryptGradingCommentPreset(doc)));
  }

  async create(
    input: CreateGradingCommentPresetInput,
    createdBy: string,
  ): Promise<GradingCommentPresetDto> {
    const payload = encryptRecord(
      { text: input.text, title: input.title, createdBy },
      GRADING_COMMENT_PRESET_ENCRYPT_SCHEMA,
    );
    const created = await this.model.create(payload);
    return this.getById(created._id.toString());
  }

  async update(
    id: string,
    input: UpdateGradingCommentPresetInput,
  ): Promise<GradingCommentPresetDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: encryptRecord({ ...input }, GRADING_COMMENT_PRESET_ENCRYPT_SCHEMA) },
        { returnDocument: 'after' },
      )
      .lean<RawLeanGradingCommentPreset>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toGradingCommentPresetDto(decryptGradingCommentPreset(doc));
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(NOT_FOUND_MESSAGE);
  }

  private async getById(id: string): Promise<GradingCommentPresetDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanGradingCommentPreset>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toGradingCommentPresetDto(decryptGradingCommentPreset(doc));
  }
}
