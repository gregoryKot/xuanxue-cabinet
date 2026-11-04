// Группы учеников школы (ADR-0193) — общий список школы: «Начинающие»,
// «Средние», «Старшие» и всё, что школа заведёт сама. Группа — единственный
// рычаг рассылки (ADR-0195, ADR-0196): у занятия несколько групп
// (`ClassDto.groupIds`) и у канала несколько (`ChannelDto.groupIds`); занятие
// уходит в канал, если их группы пересекаются. Подпись групп в посте и на экранах
// (`ClassDto.groupLabel`) сервер берёт из названий сам — клиенты её не пишут.

export interface GroupDto {
  id: string;
  name: string;
  /** Сколько занятий отметили эту группу: пока их больше нуля, группу не удалить. */
  classCount: number;
  /** Сколько каналов получает занятия группы (канал с несколькими группами считается в каждой): пока их больше нуля, группу не удалить. */
  channelCount: number;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

/** Тело POST и PATCH /groups — у группы одно редактируемое поле. */
export interface GroupInput {
  name: string;
}

export const GROUP_LIMITS = { name: 60 } as const;

/** Группы, с которых школа начинает (миграция 0027, порядок — как их называет
 * школа: от новичков к старшим). */
export const DEFAULT_GROUP_NAMES = ['Начинающие', 'Средние', 'Старшие'] as const;

/** Группы нет — общий текст сервиса групп и проверки `groupId` у занятия и канала. */
export const GROUP_NOT_FOUND_MESSAGE = 'Такой группы нет. Обновите список.';

/** Ключ уникальности названия: «Средние» и « средние » — одна группа. */
export function groupNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Разделитель названий в подписи занятия: «Средние, Старшие». */
const GROUP_LABEL_SEPARATOR = ', ';

/** Подпись групп занятия: названия через запятую в порядке создания групп —
 * ровно то, что идёт первой строкой поста (`{группа}`). */
export function joinGroupNames(names: readonly string[]): string {
  return names.join(GROUP_LABEL_SEPARATOR);
}
