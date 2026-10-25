// Чистая логика диалога «Что показывать на главной» (ADR-0179): какие плитки
// сейчас скрыты в форме, изменилось ли что-то и что отправить. Состояние формы
// — список скрытых ключей только этой главной; чужие ключи (скрытые в другой
// роли) в форму не попадают и уходят в тело PUT как были (buildHomeTilesInput).
import {
  buildHomeTilesInput,
  normalizeHomeHiddenTiles,
  type HomeTileKey,
  type SetHomeTilesInput,
} from '@xuanxue/shared';
import { homeTileOptions } from './homeTileOptions';

/** Ключи этой главной. */
function ownKeys(isStaffView: boolean): HomeTileKey[] {
  return homeTileOptions(isStaffView).map((option) => option.key);
}

/** Скрытое, что видно в диалоге: из сохранённого берём только свои ключи. */
export function initialHidden(
  saved: readonly HomeTileKey[],
  isStaffView: boolean,
): HomeTileKey[] {
  const own = ownKeys(isStaffView);
  return normalizeHomeHiddenTiles(saved.filter((key) => own.includes(key)));
}

/** Переключатель стоит «показывать»: `show` убирает ключ из скрытых. */
export function setTileShown(
  hidden: readonly HomeTileKey[],
  key: HomeTileKey,
  show: boolean,
): HomeTileKey[] {
  const rest = hidden.filter((item) => item !== key);
  return normalizeHomeHiddenTiles(show ? rest : [...rest, key]);
}

export function hasHomeTilesChanges(
  saved: readonly HomeTileKey[],
  hidden: readonly HomeTileKey[],
  isStaffView: boolean,
): boolean {
  const before = initialHidden(saved, isStaffView);
  return before.join() !== normalizeHomeHiddenTiles(hidden).join();
}

/** Тело `PUT /me/home-tiles`: выбор диалога плюс скрытое в другой роли. */
export function homeTilesBody(
  saved: readonly HomeTileKey[],
  hidden: readonly HomeTileKey[],
  isStaffView: boolean,
): SetHomeTilesInput {
  return buildHomeTilesInput(saved, ownKeys(isStaffView), hidden);
}
