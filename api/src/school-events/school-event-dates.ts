// Даты события школы — чистая логика, юнит-тест без Mongo (CLAUDE.md «Тесты»):
// сборка записи и команды PATCH с проверкой «конец не раньше начала» и фильтр
// «предстоящие и идущие» для доски ученика (ADR-0177). Только Luxon.
import type { DateTime } from 'luxon';
import {
  SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
  type CreateSchoolEventInput,
  type UpdateSchoolEventInput,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { parseUtcIso } from '../lessons/lesson-dates';
import { encryptRecord } from '../utils/encryption';
import { SCHOOL_EVENT_ENCRYPT_SCHEMA } from './school-event.schema';

// `endsAt` сбрасывается отдельно: его сброс влияет на проверку дат.
const NULLABLE_SCHOOL_EVENT_FIELDS = ['place', 'description'] as const;

/** Конец раньше начала — ошибка формы; равные моменты допустимы. */
function assertEndsNotBeforeStart(startsAt: Date, endsAt: Date | undefined): void {
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new InvalidInputError(SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE);
  }
}

export interface SchoolEventCreatePayload {
  title: string;
  startsAt: Date;
  endsAt?: Date;
  place?: string;
  description?: string;
}

export function buildCreatePayload(
  input: CreateSchoolEventInput,
): SchoolEventCreatePayload {
  const startsAt = parseUtcIso(input.startsAt, 'startsAt').toJSDate();
  const endsAt = input.endsAt
    ? parseUtcIso(input.endsAt, 'endsAt').toJSDate()
    : undefined;
  assertEndsNotBeforeStart(startsAt, endsAt);
  return {
    title: input.title,
    startsAt,
    endsAt,
    place: input.place,
    description: input.description,
  };
}

/** Что уже сохранено: проверка конца идёт по итоговой паре дат, а не по
 * присланной половине — иначе PATCH одного `startsAt` мог бы уйти за `endsAt`. */
export interface StoredSchoolEventDates {
  startsAt: Date;
  endsAt?: Date;
}

export function buildUpdateCommand(
  input: UpdateSchoolEventInput,
  stored: StoredSchoolEventDates,
): UpdateCommand {
  const { startsAt, endsAt, ...rest } = input;
  const { $set, $unset } = splitUpdate(rest, NULLABLE_SCHOOL_EVENT_FIELDS);
  const nextStart = startsAt
    ? parseUtcIso(startsAt, 'startsAt').toJSDate()
    : stored.startsAt;
  let nextEnd = stored.endsAt;
  if (startsAt) $set.startsAt = nextStart;
  if (endsAt === null) {
    $unset.endsAt = '';
    nextEnd = undefined;
  } else if (endsAt !== undefined) {
    nextEnd = parseUtcIso(endsAt, 'endsAt').toJSDate();
    $set.endsAt = nextEnd;
  }
  assertEndsNotBeforeStart(nextStart, nextEnd);
  const command: UpdateCommand = {
    $set: encryptRecord($set, SCHOOL_EVENT_ENCRYPT_SCHEMA),
  };
  if (Object.keys($unset).length > 0) command.$unset = $unset;
  return command;
}

/** Предстоящие и идущие: `endsAt ?? startsAt` не в прошлом. Многодневный
 * ретрит остаётся на доске до последнего дня. */
export function upcomingFilter(now: DateTime): Record<string, unknown> {
  const boundary = now.toUTC().toJSDate();
  return {
    $or: [
      { endsAt: { $gte: boundary } },
      { endsAt: { $exists: false }, startsAt: { $gte: boundary } },
    ],
  };
}
