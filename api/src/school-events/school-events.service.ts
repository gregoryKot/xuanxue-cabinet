// CRUD событий школы и список предстоящих для доски (ADR-0177) — данные школы
// (ADR-0010): доступ по роли проверяют контроллеры, владельца у события нет.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  MY_SCHOOL_EVENTS_LIMIT,
  SCHOOL_EVENT_NOT_FOUND_MESSAGE,
  type CreateSchoolEventInput,
  type ListSchoolEventsQuery,
  type SchoolEventDto,
  type UpdateSchoolEventInput,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { encryptRecord } from '../utils/encryption';
import {
  buildCreatePayload,
  buildUpdateCommand,
  upcomingFilter,
} from './school-event-dates';
import {
  decryptSchoolEvent,
  toSchoolEventDto,
  type RawLeanSchoolEvent,
} from './school-event.mapper';
import { SCHOOL_EVENT_ENCRYPT_SCHEMA, SchoolEventRecord } from './school-event.schema';

@Injectable()
export class SchoolEventsService {
  constructor(
    @InjectModel(SchoolEventRecord.name)
    private readonly model: Model<SchoolEventRecord>,
  ) {}

  /** Штат: от самых поздних к ближайшим будущим и прошедшим. */
  async list(query: ListSchoolEventsQuery): Promise<SchoolEventDto[]> {
    const docs = await this.model
      .find()
      .sort({ startsAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanSchoolEvent[]>();
    return docs.map(toDecryptedDto);
  }

  /** Любой вошедший: предстоящие и идущие, ближайшее сверху. «Сейчас» отдаёт
   * вызывающий — тест не зависит от часов машины. */
  async listUpcoming(now: DateTime): Promise<SchoolEventDto[]> {
    const docs = await this.model
      .find(upcomingFilter(now))
      .sort({ startsAt: 1 })
      .limit(MY_SCHOOL_EVENTS_LIMIT)
      .lean<RawLeanSchoolEvent[]>();
    return docs.map(toDecryptedDto);
  }

  async create(
    input: CreateSchoolEventInput,
    createdBy: string,
  ): Promise<SchoolEventDto> {
    const payload = encryptRecord(
      { ...buildCreatePayload(input), createdBy },
      SCHOOL_EVENT_ENCRYPT_SCHEMA,
    );
    const created = await this.model.create(payload);
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateSchoolEventInput): Promise<SchoolEventDto> {
    assertObjectId(id, SCHOOL_EVENT_NOT_FOUND_MESSAGE);
    const stored = await this.model
      .findById(id, { startsAt: 1, endsAt: 1 })
      .lean<Pick<RawLeanSchoolEvent, 'startsAt' | 'endsAt'>>();
    if (!stored) throw new NotFoundError(SCHOOL_EVENT_NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate({ _id: id }, buildUpdateCommand(input, stored), {
        returnDocument: 'after',
      })
      .lean<RawLeanSchoolEvent>();
    if (!doc) throw new NotFoundError(SCHOOL_EVENT_NOT_FOUND_MESSAGE);
    return toDecryptedDto(doc);
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, SCHOOL_EVENT_NOT_FOUND_MESSAGE);
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(SCHOOL_EVENT_NOT_FOUND_MESSAGE);
  }

  private async getById(id: string): Promise<SchoolEventDto> {
    const doc = await this.model.findById(id).lean<RawLeanSchoolEvent>();
    if (!doc) throw new NotFoundError(SCHOOL_EVENT_NOT_FOUND_MESSAGE);
    return toDecryptedDto(doc);
  }
}

function toDecryptedDto(doc: RawLeanSchoolEvent): SchoolEventDto {
  return toSchoolEventDto(decryptSchoolEvent(doc));
}
