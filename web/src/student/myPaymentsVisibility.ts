// Показывать ли ученику секцию «Абонемент» в «Профиле» (PLAN §15, слой 2.4).
// Спрятана (ADR-0157): бухгалтер не ведёт оплаты в кабинете — остаются
// ежемесячное напоминание и снимок перевода, который бот пересылает
// бухгалтеру в Telegram. Компонент, его тесты и API оставлены: вернуть секцию
// — поставить `true`. Флаг — параметр функции, а не условие прямо в JSX, чтобы
// обе его ветки проверялись тестом, пока одна из них не живёт на экране.
import type { MeDto } from '@xuanxue/shared';

const MY_PAYMENTS_VISIBLE = false;

/** Секция — только у человека без ролей (ученик, ADR-0026): у штата
 * абонемента нет, как и у сервера (`assertActiveStudent`). */
export function isMyPaymentsVisible(
  me: MeDto | null,
  visible: boolean = MY_PAYMENTS_VISIBLE,
): me is MeDto {
  return visible && me !== null && me.roles.length === 0;
}
