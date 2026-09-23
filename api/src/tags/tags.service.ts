// Сводка тегов школы (GET /api/tags, ADR-0075, ADR-0078, ADR-0116) — по всей
// истории, без окна планирования: тег ставят после занятия, часто уже за
// пределами любого допустимого окна (ADR-0078 «Контекст»). Ничего не
// денормализуется — три агрегации на каждый запрос (tags.queries.ts).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  type ListTagsQuery,
  type TagSummaryDto,
} from '@xuanxue/shared';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { MaterialRecord } from '../materials/material.schema';
import {
  countChannelsByTag,
  countLessonsByTag,
  countMaterialsByTag,
  mergeTagSummaries,
} from './tags.queries';

@Injectable()
export class TagsService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(MaterialRecord.name)
    private readonly materialModel: Model<MaterialRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
  ) {}

  async list(query: ListTagsQuery): Promise<TagSummaryDto[]> {
    const [lessonCounts, materialCounts, channelCounts] = await Promise.all([
      countLessonsByTag(this.lessonModel, this.classModel),
      countMaterialsByTag(this.materialModel),
      countChannelsByTag(this.channelModel),
    ]);
    return mergeTagSummaries(lessonCounts, materialCounts, channelCounts).slice(
      0,
      query.limit ?? LIST_LIMIT_DEFAULT,
    );
  }
}
