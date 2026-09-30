// Выгрузка данных человека — ответ школы на просьбу «какие данные обо мне вы
// храните» (закон о защите частной жизни Израиля, ст. 13; ADR-0160,
// аудит 2026-09-29, M4). Отдаёт только admin: файл содержит контакты и
// ответы одного человека целиком, а получить его должен сам человек, а не
// любой сотрудник школы (SECURITY §3).
//
// Формат намеренно общий — секции с записями, а не по типу на каждую коллекцию:
// набор секций определяет реестр удаления (api/src/users/user-data.registry.ts),
// и новая коллекция должна попасть в выгрузку без правки этого контракта.

/** Значение поля записи — всё, что переживает JSON: даты и id уже строки. */
export type ExportValue =
  string | number | boolean | null | ExportValue[] | { [key: string]: ExportValue };

export interface ExportRecord {
  [field: string]: ExportValue;
}

/** Одна группа данных о человеке: аккаунт, оплаты, ответы на экзамены. */
export interface UserDataExportSectionDto {
  /** Имя модели в реестре — для школы; человеку нужен `title`. */
  key: string;
  title: string;
  /** Сколько хранится и что удаляет — словами, числа из тех же констант, по
   * которым работают уборщики (shared/src/privacy.ts). */
  retention: string;
  /** Пусто — школа ничего такого о человеке не хранит; секция остаётся, чтобы
   * это было видно в ответе. */
  records: ExportRecord[];
}

/** Ссылки на человека в данных школы (ведущий занятия, автор рассылки). Сами
 * записи принадлежат школе или другим людям и в выгрузку не входят — только
 * число. */
export interface UserDataExportReferenceDto {
  title: string;
  count: number;
}

export interface UserDataExportDto {
  /** ISO 8601 UTC с Z. */
  exportedAt: string;
  /** Что в файле и чего в нём нет — читает человек, получивший выгрузку. */
  note: string;
  sections: UserDataExportSectionDto[];
  references: UserDataExportReferenceDto[];
}
