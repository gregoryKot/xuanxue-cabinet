// Чистая логика страницы события школы (ADR-0177): состояние формы,
// валидация, сборка тела запроса (CLAUDE.md «Тесты»), по образцу
// materials/materialFormInput.ts. Даты хранятся строками `datetime-local`
// (пояс устройства, без смещения) и уходят ISO UTC — тот же перевод, что у
// разового занятия (planning/lessonFormInput.ts).
//
// Создание и правка собирают тело по-разному. POST опускает пустые
// необязательные поля: сервер не принимает пустую строку в месте и
// подробностях. PATCH пустым полем обязан СНЯТЬ значение, а «нет ключа» для
// него значит «оставить как было» — отсюда `null` (UpdateSchoolEventInput).
import {
  SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
  type CreateSchoolEventInput,
  type SchoolEventDto,
  type UpdateSchoolEventInput,
} from '@xuanxue/shared';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../lib/formatDate';

export interface EventFormState {
  title: string;
  startsAtLocal: string;
  endsAtLocal: string;
  place: string;
  description: string;
}

/** Поле с ошибкой и текст — форма рисует его под этим полем. */
export interface EventFormError {
  field: 'title' | 'startsAt' | 'endsAt';
  message: string;
}

export function initialEventFormState(event: SchoolEventDto | null): EventFormState {
  return {
    title: event?.title ?? '',
    startsAtLocal: event ? toDatetimeLocalValue(event.startsAt) : '',
    endsAtLocal: event?.endsAt ? toDatetimeLocalValue(event.endsAt) : '',
    place: event?.place ?? '',
    description: event?.description ?? '',
  };
}

export function validateEventForm(state: EventFormState): EventFormError | null {
  if (!state.title.trim()) {
    return { field: 'title', message: 'Впишите название события.' };
  }
  if (!state.startsAtLocal) {
    return { field: 'startsAt', message: 'Укажите, когда событие начинается.' };
  }
  const startsAt = fromDatetimeLocalValue(state.startsAtLocal);
  if (startsAt === null) {
    return { field: 'startsAt', message: 'Дата и время начала указаны неверно.' };
  }
  if (!state.endsAtLocal) return null;

  const endsAt = fromDatetimeLocalValue(state.endsAtLocal);
  if (endsAt === null) {
    return { field: 'endsAt', message: 'Дата и время конца указаны неверно.' };
  }
  // ISO UTC с Z одной длины, строки сравниваются как моменты; равные моменты
  // допустимы — так же решает сервер (assertEndsNotBeforeStart).
  if (endsAt < startsAt) {
    return { field: 'endsAt', message: SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE };
  }
  return null;
}

// Валидация уже прошла: пустого `?? ''` не бывает, но тип обязан быть строкой.
function toIso(local: string): string {
  return fromDatetimeLocalValue(local) ?? '';
}

export function toCreateInput(state: EventFormState): CreateSchoolEventInput {
  const place = state.place.trim();
  const description = state.description.trim();
  return {
    title: state.title.trim(),
    startsAt: toIso(state.startsAtLocal),
    ...(state.endsAtLocal ? { endsAt: toIso(state.endsAtLocal) } : {}),
    ...(place ? { place } : {}),
    ...(description ? { description } : {}),
  };
}

export function toUpdateInput(state: EventFormState): UpdateSchoolEventInput {
  return {
    title: state.title.trim(),
    startsAt: toIso(state.startsAtLocal),
    endsAt: state.endsAtLocal ? toIso(state.endsAtLocal) : null,
    place: state.place.trim() || null,
    description: state.description.trim() || null,
  };
}
