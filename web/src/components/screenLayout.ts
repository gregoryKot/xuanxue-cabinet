// Общие стили экрана-раздела (отступ, объясняющий абзац сверху) — CLAUDE.md
// «Каждая фича объясняет откуда это и зачем»: раньше повторялись литералом в
// каждом экране (ScheduleScreen.tsx, PlanningScreen.tsx, SummaryScreen.tsx),
// jscpd поймал дубль.
import type { CSSProperties } from 'react';

export const screenSectionStyle: CSSProperties = {
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

export const screenExplanationStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-soft)',
};
