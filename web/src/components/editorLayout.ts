// Стили страницы-редактора: колонка, разделы, подвал с действиями и ссылка
// «назад» первой строкой. Отделены от screenLayout.ts (стили экрана-раздела)
// делением по файловому храповику: тот перешагнул 150 строк, а «экран со
// списком» и «страница-редактор» — два разных вида экрана и делятся по
// смыслу, а не по одному только размеру (CLAUDE.md «Храповики»).
import type { CSSProperties } from 'react';
import { screenSectionStyle, textLinkStyle } from './screenLayout';

// Колонка страницы-редактора уже, чем у экрана-списка: строка поля во всю
// ширину монитора нечитаема, и владелец на это указал прямо (отзыв
// 2026-09-15). Общая для редактора экзамена и редактора вопроса — числа
// живут в одном месте (CLAUDE.md «Без магических чисел»).
const EDITOR_COLUMN_MAX_WIDTH_PX = 680;

export const editorPageStyle: CSSProperties = {
  ...screenSectionStyle,
  maxWidth: EDITOR_COLUMN_MAX_WIDTH_PX,
  gap: 24,
};

/** Раздел страницы-редактора: волосяная линия сверху вместо рамки-карточки. */
export const editorSectionStyle: CSSProperties = {
  paddingTop: 24,
  borderTop: '1px solid var(--line)',
};

/** Рубрика и заголовок страницы-редактора одной колонкой. */
export const editorHeadingStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/** Ссылка «назад» первой строкой страницы-редактора. От textLinkStyle
 * отличается одним `alignSelf: 'flex-start'`: страницы-редакторы —
 * flex-колонки, и без него линия `border-bottom` растягивалась во всю ширину
 * вместо подчёркивания слов (отзыв владельца 2026-09-18). Мест таких семь —
 * отсюда имя, а не литерал по месту. В сам textLinkStyle `alignSelf`
 * дописать нельзя: его же берут ссылки внутри flex-СТРОК (блок человека,
 * AppShell.tsx), где это значит «прижать к верху». */
export const backLinkStyle: CSSProperties = {
  ...textLinkStyle,
  alignSelf: 'flex-start',
};

/** Ряд действий в подвале страницы-редактора: «Сохранить» первой, рядом —
 * второе действие (components/EditorFooter.tsx, страницы занятия и занятия
 * расписания). */
export const editorActionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  flexWrap: 'wrap',
};

/** Опасное действие подвала («Отменить занятие», «Удалить из расписания») —
 * под волосяной линией, поодаль от «Сохранить»: на телефоне соседние кнопки
 * ловят промах пальца (аудит 2026-09-15, важно №2). */
export const editorDangerRowStyle: CSSProperties = {
  marginTop: 22,
  paddingTop: 16,
  borderTop: '1px solid var(--line)',
};

/** Кнопка внутри такого ряда — текстом, без отступов: силуэт `danger` и так
 * без заливки и контура (components/Button.tsx). */
export const editorDangerButtonStyle: CSSProperties = { padding: 0 };
