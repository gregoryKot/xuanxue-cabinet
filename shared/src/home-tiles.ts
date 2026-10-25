// Плитки «Главной», которые человек может скрыть (ADR-0179). Общий контракт api
// и web: ключи лежат в `users.homeHiddenTiles`, маршрут — `PUT /me/home-tiles`
// (me-routes.ts), нормализация одна на сервер и кабинет, чтобы «что считать
// скрытым» не разошлось.
//
// Входы в разделы у штата («Занятия», «Рассылки», «Материалы», «Школа») в списке
// нарочно нет: их нет в панели (ADR-0174), и скрыв карточку, штат потерял бы
// дорогу в раздел.

/** Плитки ученика, в том порядке, в каком их рисует кабинет (ADR-0179). */
export const STUDENT_HOME_TILES = [
  'nextLesson',
  'notice',
  'exams',
  'payment',
  'events',
] as const;

/** Плитки штата: объявление ученикам, очередь проверки, события. */
export const STAFF_HOME_TILES = ['notice', 'grading', 'events'] as const;

/** Все ключи, которые вообще бывают: ключ `notice` и `events` общий у ролей, поэтому
 * скрытое хранится одним списком на человека. Порядок — канонический для
 * `normalizeHomeHiddenTiles`. */
export const HOME_TILES = [
  'nextLesson',
  'notice',
  'exams',
  'payment',
  'grading',
  'events',
] as const;

export type HomeTileKey = (typeof HOME_TILES)[number];

/** Сколько ключей может прийти в теле: каждый не более раза. */
export const HOME_TILES_MAX = HOME_TILES.length;

/** Тело `PUT /me/home-tiles`: полный список скрытых плиток. Пустой — показываем
 * всё. Не «переключить одну»: повтор запроса даёт тот же результат, а два
 * устройства не расходятся по счётчику переключений. */
export interface SetHomeTilesInput {
  hidden: HomeTileKey[];
}

/** Скрытые плитки без повторов и неизвестных ключей, в каноническом порядке.
 * Неизвестный ключ в базе — след прежней версии, роняться на нём не нужно. */
export function normalizeHomeHiddenTiles(
  hidden: readonly string[] | undefined,
): HomeTileKey[] {
  const wanted = new Set<string>(hidden ?? []);
  return HOME_TILES.filter((key) => wanted.has(key));
}

/** Тело `PUT /me/home-tiles` после правки диалога: ключи вне `visibleKeys` (их
 * в диалоге этой роли нет — человек скрыл их в режиме ученика, а правит как штат)
 * остаются как были, а внутри — ровно то, что выбрали. */
export function buildHomeTilesInput(
  current: readonly HomeTileKey[],
  visibleKeys: readonly HomeTileKey[],
  hiddenNow: readonly HomeTileKey[],
): SetHomeTilesInput {
  const foreign = current.filter((key) => !visibleKeys.includes(key));
  return { hidden: normalizeHomeHiddenTiles([...foreign, ...hiddenNow]) };
}
