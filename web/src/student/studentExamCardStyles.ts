// Стили карточки экзамена (StudentExamCard.tsx) — вынесены, чтобы сам
// компонент остался под 150 строк (scripts/check-file-size-ratchet.mjs), тот
// же приём, что у attemptVideoStyles.ts.
import type { CSSProperties } from 'react';

export const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '18px 20px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--panel-warm)',
};

// Полоса слева у идущей попытки — только цвет состояния, не вторая заливка
// (ADR-0043, ADR-0121: «индикацию ИДЁТ ЭКЗАМЕН я бы сделал поярче»).
export const runningCardStyle: CSSProperties = {
  ...cardStyle,
  borderLeft: '4px solid var(--terracotta)',
};

// #55584e, не --ink-soft: тот же прецедент, что у тёплой плашки «Ждут
// отправки вручную» и сводки «Экзаменов» — на --panel-warm --ink-soft держит
// только ~4.06:1, ниже AA 4.5 для этого кегля; #55584e даёт 5.74:1
// (broadcasts/ManualDeliveriesSection.tsx, exams/ExamsSectionStats.tsx).
export const rubricStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#55584e',
};

// #9d4e31, не --terracotta-text: тот же прецедент, что у #55584e выше —
// --terracotta-text на --panel-warm держит только 4.21:1, ниже AA 4.5 для
// этого кегля; #9d4e31 даёт 4.65:1.
export const runningRubricStyle: CSSProperties = { ...rubricStyle, color: '#9d4e31' };

export const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 22,
};
export const metaStyle: CSSProperties = { fontSize: 14, color: '#55584e' };

// Остаток времени у идущей попытки — единственная строка карточки, которая
// меняется сама и ради которой ученик на неё смотрит: она стоит тушью и
// весом 600, а не общим тихим #55584e. До этого состояние, время, описание и
// остаток попыток шли четырьмя строками одного кегля, цвета и веса — «всё
// сплошняком» (снимок владельца 2026-09-23, ADR-0124: сначала иерархия
// строк, потом жирный внутри абзаца).
export const runningTimeStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--ink)',
};

// Описание задания тише фактов над ним: его читают один раз, при первом
// заходе, а состояние и время — каждый (ADR-0124).
export const descriptionStyle: CSSProperties = {
  margin: '2px 0 0',
  fontSize: 13,
  color: '#55584e',
};
export const actionRowStyle: CSSProperties = { marginTop: 4 };

// Остаток попыток стоит вплотную к кнопке: он объясняет именно её, а не
// карточку целиком.
export const attemptsLeftStyle: CSSProperties = { ...metaStyle, margin: '0 0 6px' };
