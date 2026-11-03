// Два режима «действующих ролей» одним списком (ADR-0163 — ученик, ADR-0190 —
// учитель): чем они отличаются для экрана — маршрут, флаг в `MeDto` и тексты.
// Всё остальное (запрос, переход, ошибка) общее и живёт в useActingMode.ts,
// поэтому секция «Профиля» и плашка оболочки не знают, какой режим перед ними.
// Тексты — по docs/VOICE.md: акцент на факте, «вы», без канцелярита.
import type { MeDto } from '@xuanxue/shared';

export type ActingMode = 'student' | 'teacher';

export interface ActingModeSpec {
  /** Ключ карты маршрутов (`shared/src/me-routes.ts`). */
  route: 'PUT /me/student-mode' | 'PUT /me/teacher-mode';
  /** Режим сейчас включён — по флагу в `MeDto`. */
  isOn: (me: MeDto) => boolean;
  /** Плашка оболочки. */
  bannerMessage: string;
  sectionTitle: string;
  offText: string;
  onText: string;
  enableLabel: string;
}

export const ACTING_MODES: Record<ActingMode, ActingModeSpec> = {
  student: {
    route: 'PUT /me/student-mode',
    isOn: (me) => me.studentMode,
    bannerMessage: 'Вы в режиме ученика',
    sectionTitle: 'Режим ученика',
    offText:
      'Кабинет покажет вам экраны, меню и уведомления о занятиях, как у ученика. **Бот и оповещения о сбоях** остаются как были.',
    onText:
      'Сейчас кабинет показывает вам экраны и уведомления ученика. **Роль сохранена** — она вернётся, когда вы выйдете из режима.',
    enableLabel: 'Включить режим ученика',
  },
  teacher: {
    route: 'PUT /me/teacher-mode',
    isOn: (me) => me.teacherMode,
    bannerMessage: 'Вы в режиме учителя',
    sectionTitle: 'Режим учителя',
    offText:
      'Кабинет покажет вам экраны и меню, как у учителя: без списка учеников, оплат и журнала сбоев. **Бот и оповещения о сбоях** остаются как были.',
    onText:
      'Сейчас кабинет показывает вам экраны учителя. **Роль разработчика сохранена** — она вернётся, когда вы выйдете из режима.',
    enableLabel: 'Включить режим учителя',
  },
};

/** Общая подпись «выхода» в секции и на плашке: роль возвращается одна и та же. */
export const DISABLE_LABEL = 'Вернуться к своей роли';

/** Какой режим включён у человека; сервер держит режимы взаимоисключающими, а на
 * случай правки в базе ученик первый, как и в `actingUser` на сервере. */
export function activeActingMode(me: MeDto | null): ActingMode | null {
  if (!me) return null;
  if (ACTING_MODES.student.isOn(me)) return 'student';
  return ACTING_MODES.teacher.isOn(me) ? 'teacher' : null;
}
