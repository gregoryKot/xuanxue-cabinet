// Какую плитку главной ученика рисует каждый источник данных (ADR-0179): по
// этой таблице studentHomeView.ts не ждёт и не показывает сбой источника, чью
// плитку человек скрыл.
import type { HomeTileKey } from '@xuanxue/shared';

export type HomeSource = 'board' | 'exams' | 'payments' | 'events' | 'lessons';

export const SOURCE_TILE: Record<HomeSource, HomeTileKey> = {
  board: 'notice',
  exams: 'exams',
  payments: 'payment',
  events: 'events',
  lessons: 'nextLesson',
};
