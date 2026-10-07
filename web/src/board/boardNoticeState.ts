// Что показать штату на доске про объявление (ADR-0172, дополнение 2026-10-07):
// объявления нет, висит сейчас или уже истекло. Ученику сервер отдаёт только
// активное (`GET /me/board`), а учитель читает настройки целиком и обязан
// видеть и истёкшее — чтобы продлить или заменить, не набирая текст заново.
// «Сегодня» — день в поясе школы, тот же ключ, что считает сервер
// (api/src/board/board.service.ts): в 00:30 по Иерусалиму объявление «до
// 20-го» уже снято, хотя в UTC ещё 20-е.
import { isBoardNoticeActive, type BoardNotice, type SettingsDto } from '@xuanxue/shared';
import { dateKey } from '../lib/formatDate';

export type BoardNoticeState =
  | { kind: 'none' }
  | { kind: 'active'; notice: BoardNotice }
  | { kind: 'expired'; notice: BoardNotice };

export function boardNoticeState(
  settings: Pick<SettingsDto, 'boardNotice' | 'tz'>,
  now: Date,
): BoardNoticeState {
  const notice = settings.boardNotice;
  if (!notice || notice.text.trim() === '') return { kind: 'none' };
  const todayKey = dateKey(now.toISOString(), settings.tz);
  return isBoardNoticeActive(notice, todayKey)
    ? { kind: 'active', notice }
    : { kind: 'expired', notice };
}
