// Общий облик обоих состояний экрана сдачи (форма и «Отправлено») — колонка
// и шапка с рубрикой над заголовком антиквой (направление «Тёплая школа»,
// docs/adr/0043, заменил ADR-0031). Отдельный модуль, а не константа в
// AttemptScreen.tsx: AttemptInProgress.tsx и AttemptSubmitted.tsx
// импортируются самим AttemptScreen.tsx, и обратный импорт замкнул бы цикл
// (eslint import-x/no-cycle).
import type { CSSProperties } from 'react';
import { screenSectionStyle } from '../components/screenLayout';

/** Ученик читает здесь формулировки вопросов подряд, поэтому колонка уже
 * общей (880): строка длиннее примерно 70 знаков теряется при переходе на
 * следующую. Не `editorPageStyle` из screenLayout.ts — там то же число, но
 * имя про редактор учителя, и совпадение случайное: экрану ученика незачем
 * ездить следом за шириной формы редактирования экзамена. */
const ATTEMPT_COLUMN_MAX_WIDTH_PX = 680;

export const attemptPageStyle: CSSProperties = {
  ...screenSectionStyle,
  maxWidth: ATTEMPT_COLUMN_MAX_WIDTH_PX,
  gap: 24,
};

/** Рубрика, название экзамена и строка под ними одной колонкой. */
export const attemptHeaderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

/** Растяжка над названием: ученик приходит по ссылке из Telegram и первым
 * делом должен понять, куда попал (CLAUDE.md «Каждая фича объясняет, откуда
 * это и зачем»). */
export const ATTEMPT_EYEBROW = 'Экзамен';
