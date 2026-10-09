// Плитки «Главной», которые человек может скрыть (ADR-0179): какие из них у его
// роли и как они подписаны в диалоге «Что показывать на главной». Ключи и порядок
// — из shared (`STUDENT_HOME_TILES`, `STAFF_HOME_TILES`), здесь только подписи.
// Record по ключам роли: новая плитка без подписи не соберётся (`tsc`).
import {
  STAFF_HOME_TILES,
  STUDENT_HOME_TILES,
  type HomeTileKey,
  type MeDto,
} from '@xuanxue/shared';

export interface HomeTileOption {
  key: HomeTileKey;
  label: string;
}

const STUDENT_TILE_LABELS: Record<(typeof STUDENT_HOME_TILES)[number], string> = {
  nextLesson: 'Ближайшее занятие',
  notice: 'Объявление школы',
  exams: 'Экзамены к сдаче',
  payment: 'Оплата за месяц',
  events: 'События школы',
};

const STAFF_TILE_LABELS: Record<(typeof STAFF_HOME_TILES)[number], string> = {
  notice: 'Объявление ученикам',
  grading: 'Проверка работ',
  events: 'События школы',
};

/** Плитки роли в порядке, в каком кабинет их рисует. Штат в режиме ученика
 * (ADR-0163) видит главную ученика, поэтому роль здесь — «видит ли он штатную
 * главную» (`isTeacher(me)`), а не его настоящие роли. */
export function homeTileOptions(isStaffView: boolean): HomeTileOption[] {
  if (isStaffView) {
    return STAFF_HOME_TILES.map((key) => ({ key, label: STAFF_TILE_LABELS[key] }));
  }
  return STUDENT_HOME_TILES.map((key) => ({ key, label: STUDENT_TILE_LABELS[key] }));
}

/** Скрыта ли хоть одна плитка из тех, что есть на этой главной. Ключи другой
 * роли не считаются: человек в режиме ученика, скрывший «Проверку работ», на
 * главной ученика ничего не терял. */
export function hasHiddenOwnTile(
  hidden: readonly HomeTileKey[],
  isStaffView: boolean,
): boolean {
  const own = homeTileOptions(isStaffView).map((option) => option.key);
  return hidden.some((key) => own.includes(key));
}

const NONE_HIDDEN: readonly HomeTileKey[] = [];

/** Скрытые плитки человека; сессия ещё не пришла — ничего не скрыто. */
export function hiddenTilesOf(me: MeDto | null): readonly HomeTileKey[] {
  return me?.homeHiddenTiles ?? NONE_HIDDEN;
}
