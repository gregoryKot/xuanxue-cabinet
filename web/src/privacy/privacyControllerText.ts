// Раздел «Кто отвечает за данные» (пункт 2а статьи 11 Закона о защите частной
// жизни Израиля, ADR-0155): единственный кусок политики не из констант кода —
// имя и контакт школа вводит сама на экране «Шаблоны», страница берёт их из
// GET /auth/config. Остальной текст — privacyPolicyText.ts.
import { emphasizeContactFact, type SchoolContact } from '../legal/schoolContact';

export const PRIVACY_CONTROLLER_TITLE = 'Кто отвечает за данные';

/** `null` — настройки не загрузились: страница остаётся читаемой и отправляет
 * к учителю, а не выдумывает имя. Пусто — школа ничего не указала: то же
 * самое, честной строкой. */
export function buildControllerParagraphs(controller: SchoolContact | null): string[] {
  if (!controller) {
    return [
      'Не удалось загрузить, кто отвечает за данные. Обновите страницу или **спросите учителя школы**.',
    ];
  }
  const { dataControllerName: name, dataControllerContact: contact } = controller;
  if (!name && !contact) {
    return [
      'Имя и контакт ответственного школа ещё не указала — **спросите учителя школы**.',
    ];
  }
  const paragraphs: string[] = [];
  if (name) paragraphs.push(`За данные учеников отвечает ${emphasizeContactFact(name)}.`);
  paragraphs.push(
    contact
      ? `Связаться по вопросам о ваших данных: ${emphasizeContactFact(contact)}.`
      : 'Способ связи школа ещё не указала — **спросите учителя школы**.',
  );
  return paragraphs;
}
