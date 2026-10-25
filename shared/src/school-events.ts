// События школы: ретрит, семинар, выезд (ADR-0177) — данные школы (ADR-0010),
// не ученика. Отдельная коллекция, а не объявление доски (одна строка без даты,
// ADR-0172) и не разовое занятие (группа, Zoom, рассылка).
export interface SchoolEventDto {
  id: string;
  title: string;
  /** Начало, ISO UTC с Z. */
  startsAt: string;
  /** Конец многодневного события, ISO UTC с Z. */
  endsAt?: string;
  place?: string;
  /** Подробности: рисуются через RichText, работают `**жирный**` и @ник. */
  description?: string;
  /** Нет, если аккаунт автора удалён (USER_REFERENCE_PATHS). */
  createdBy?: string;
  createdAt: string; // ISO UTC с Z
}

export interface CreateSchoolEventInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  place?: string;
  description?: string;
}

/** PATCH: `null` сбрасывает только необязательные поля; у названия и начала
 * сброса нет — событие без них не существует. */
export interface UpdateSchoolEventInput {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  place?: string | null;
  description?: string | null;
}

export interface ListSchoolEventsQuery {
  limit?: number;
}

export const SCHOOL_EVENT_LIMITS = { title: 120, place: 200, description: 2000 } as const;

/** Сколько предстоящих событий видит ученик на доске (ADR-0177). */
export const MY_SCHOOL_EVENTS_LIMIT = 20;

// VOICE.md: что случилось и что делать.
export const SCHOOL_EVENT_NOT_FOUND_MESSAGE =
  'Это событие уже удалено. Вернитесь на главную.';
export const SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE =
  'Конец события раньше начала. Проверьте даты.';
