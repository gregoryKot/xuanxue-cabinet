// Общие стили экрана-раздела (отступ, объясняющий абзац сверху) — CLAUDE.md
// «Каждая фича объясняет откуда это и зачем»: раньше повторялись литералом в
// каждом экране (ScheduleScreen.tsx, PlanningScreen.tsx, BroadcastsScreen.tsx),
// jscpd поймал дубль.
import type { CSSProperties } from 'react';

// Колонка ограниченной ширины: на телефоне `maxWidth` не мешает (экран уже),
// на мониторе не даёт карточке с одной строкой растянуться на всю ширину
// (отзыв владельца 2026-09-09). Значение — около 70 знаков строкой текста,
// дальше читать неудобно.
const CONTENT_MAX_WIDTH_PX = 880;

export const screenSectionStyle: CSSProperties = {
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  maxWidth: CONTENT_MAX_WIDTH_PX,
  // `100%` рядом с maxWidth: колонка занимает доступное место на телефоне и
  // упирается в предел на мониторе.
  width: '100%',
};

/** Экран, которому нужна вся ширина (недельная сетка расписания): те же
 * отступы и ритм, но без предела по ширине. */
export const wideScreenSectionStyle: CSSProperties = {
  ...screenSectionStyle,
  maxWidth: 'none',
};

/** Главное действие экрана: кнопка по содержимому, а не во всю колонку —
 * на мониторе «Добавить занятие» иначе растягивается на 1200 пикселей.
 * На телефоне колонка и так узкая, разницы не видно. */
export const primaryActionStyle: CSSProperties = { alignSelf: 'flex-start' };

export const screenExplanationStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-soft)',
};

/** Мелкая приписка под объяснением: часовой пояс, что значит кнопка. Тише
 * объяснения — читают её один раз и больше к ней не возвращаются. */
export const screenHintStyle: CSSProperties = {
  margin: '-10px 0 0',
  fontSize: 13,
  color: 'var(--ink-soft)',
};
