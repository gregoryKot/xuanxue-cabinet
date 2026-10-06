// Объявление на доске ученика (ADR-0172): одна строка от учителя и последний
// день показа. Ретрит и «оплата до 20 октября» пока не сущность с учётом
// оплат — просто текст, который висит на доске, пока не истёк срок.
// Общий контракт api и web: `BoardNotice` лежит в настройках школы
// (settings.ts), `MyBoardDto` — ответ `GET /me/board`.

export interface BoardNotice {
  text: string;
  /** 'YYYY-MM-DD' (RULE_DATE_RE) — дата в поясе школы, последний день показа
   * включительно: на объявлении «до 20 октября» 20-го оно ещё висит, 21-го уже
   * нет. */
  until: string;
}

/** Ответ `GET /me/board`. `notice: null` — объявления нет или срок истёк:
 * кабинет такую секцию не рисует. */
export interface MyBoardDto {
  notice: BoardNotice | null;
}

/** Показывать ли объявление в день `todayKey` ('YYYY-MM-DD' в поясе школы).
 * Строковое сравнение ключей дат: формат фиксированной ширины, лексикографи-
 * ческий порядок совпадает с календарным, Date и пояс процесса не участвуют
 * (CLAUDE.md «Время»). Пустой текст не активен — не показываем пустую плашку. */
export function isBoardNoticeActive(
  notice: BoardNotice | undefined,
  todayKey: string,
): notice is BoardNotice {
  if (!notice) return false;
  if (notice.text.trim() === '') return false;
  return todayKey <= notice.until;
}
