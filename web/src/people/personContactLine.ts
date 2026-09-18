// Контакт и время входа строки «Люди» (макет 2c-people.html, docs/adr/0043).
// Макет пишет «Telegram @gkotov · вошёл сегодня» и «Почта maria@example.com
// · вошла 14 сентября» — но UserDto нарочно не отдаёт ни ник в Telegram, ни
// email (SECURITY §1, комментарий у самого типа): показать их значило бы
// завести новую утечку ПДн ради сходства с картинкой. Метод входа поэтому
// виден, только когда он однозначен (hasTelegram — единственный флаг у
// DTO); «Почта» без реального адреса не пишем — `!hasTelegram` означает
// «почта или Google» (PLAN.md §3), и гадать между ними значило бы иногда
// показывать неверный способ связи. Время — без глагола («Вход», не
// «вошёл»/«вошла»): DTO не хранит пол человека, подбирать окончание по
// имени в интерфейсе кабинета не будем.
import type { UserDto } from '@xuanxue/shared';
import { formatDateTime } from '../lib/formatDate';

const TELEGRAM_LABEL = 'Telegram';
const NEVER_LOGGED_IN = 'Ещё не входил';

export function personContactLine(
  person: Pick<UserDto, 'hasTelegram' | 'lastLoginAt'>,
): string {
  const loginPart = person.lastLoginAt
    ? `Вход ${formatDateTime(person.lastLoginAt)}`
    : NEVER_LOGGED_IN;
  return person.hasTelegram ? `${TELEGRAM_LABEL} · ${loginPart}` : loginPart;
}
