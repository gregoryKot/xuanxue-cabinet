// Способ связи со школой — те же два поля, что экран «Шаблоны» называет «Кто
// отвечает за данные» (ADR-0155): их читают страницы `/privacy` и
// `/accessibility` (ADR-0158) из одного `GET /auth/config`. Второй настройки
// «куда писать о доступности» нет намеренно: два контакта разъехались бы, и
// учителю пришлось бы помнить, где какой.
import type { AuthConfigDto } from '@xuanxue/shared';

/** Что школа указала на экране «Шаблоны». */
export type SchoolContact = Pick<
  AuthConfigDto,
  'dataControllerName' | 'dataControllerContact'
>;

/** Имя и контакт вводит школа, а `**` в тексте — разметка акцента: звёздочки
 * из ввода убираем, иначе они склеили бы чужие пары. Адрес в тексте RichText
 * превращает в ссылку, а маркер поверх ссылки остался бы на экране
 * звёздочками, поэтому такой факт идёт без выделения. */
export function emphasizeContactFact(value: string): string {
  const clean = value.replace(/\*/g, '');
  return /https?:\/\//i.test(clean) ? clean : `**${clean}**`;
}
