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

// Облик раздела на экране «Отправлено» — их два: «Ваши ответы»
// (AttemptSubmittedAnswers.tsx) и «Видео» (AttemptSubmittedVideos.tsx).
// Раньше жили в attemptVideoStyles.ts под именами с «Video» в названии —
// переехали сюда с появлением второго раздела на том же облике (отзыв
// владельца 2026-09-22: ученик должен мочь перечитать сданную работу).
export const attemptSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

// Заголовок раздела антиквой, но заметно легче названия экзамена
// (screenTitleStyle, 34): внутри экрана это раздел, а не второй экран.
export const attemptSectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: 22,
  lineHeight: 1.1,
};
