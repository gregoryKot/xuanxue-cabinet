// Чистая логика экрана «Расписание» (CLAUDE.md «Тесты»: чистая логика —
// юнит-тест без Mongo/DI): ClassDto[] → сетка по дням недели, сортировка
// слотов по минутам начала, форматирование диапазона «08:00–09:30». Время
// правила — строка HH:mm и длительность в минутах (shared/src/domain.ts),
// поэтому конец интервала — арифметика на минутах, Luxon в web не нужен
// (правило CLAUDE.md «Время» запрещает web без Luxon: то же самое здесь —
// web/vite.config.ts и web/package.json Luxon не тянут).
import {
  WEEKDAYS,
  type ClassDto,
  type ScheduleRuleDto,
  type Weekday,
} from '@xuanxue/shared';
import { countActiveChannels } from './channelCountLabel';

export interface ScheduleSlot {
  classId: string;
  ruleId: string;
  title: string;
  groupLabel: string;
  format: ClassDto['format'];
  timeLabel: string;
  startMinutes: number;
  active: boolean;
  /** Онлайн-занятие без ссылки Zoom: рассылка уйдёт без неё, ученик
   * останется за дверью. SlotCard показывает «без ссылки» прямо в сетке
   * (отзыв владельца 2026-09-12). У офлайна ссылки и не должно быть. */
  linkMissing: boolean;
  /** Число АКТИВНЫХ каналов рассылки у занятия (channelIds ∩ активные
   * каналы кабинета) — SlotCard показывает его или «без каналов» (ревью
   * п.1). Выключенный канал в channelIds не считается: рассылку он не
   * получит. */
  channelCount: number;
  /** Постоянные теги курса (ClassDto.tags, ADR-0072) — SlotCard печатает их
   * подписью, без пилюль: в сетке дня они ничего не фильтруют. Теги даты
   * (lessons.tags, ADR-0059) сюда не подмешиваются — другое поле, другой
   * экран. */
  tags: string[];
}

export type ScheduleGrid = Record<Weekday, ScheduleSlot[]>;

const MINUTES_IN_DAY = 24 * 60;

/** `NaN` — мусор в правиле (побитая база/ручная правка) вместо падения
 * сортировки или отображения «NaN:NaN»: buildScheduleGrid такое правило
 * пропускает. */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  const total = Number(hours) * 60 + Number(minutes);
  return Number.isFinite(total) ? total : NaN;
}

function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** «08:00–09:30»; занятие за полночь (23:30 + 60 мин) корректно переходит на
 * «00:30» — редкий, но возможный случай для вечерних слотов. */
export function formatTimeRange(rule: ScheduleRuleDto): string {
  const end = timeToMinutes(rule.time) + rule.durationMin;
  return `${rule.time}–${minutesToTime(end)}`;
}

function emptyGrid(): ScheduleGrid {
  // Object.fromEntries стирает буквальные ключи 0..6 до string — typescript не
  // видит, что все 7 дней покрыты, поэтому сетка строится присваиванием по
  // каждому известному дню, а не одним вызовом с приведением типа.
  const grid = {} as ScheduleGrid;
  for (const day of WEEKDAYS) grid[day] = [];
  return grid;
}

/** Занятие без единого правила расписания не попадает ни в один день —
 * осознанно: слот в сетке появляется, когда у него есть хоть одно время.
 * Правило с нечисловым временем (`timeToMinutes` вернул NaN) тоже
 * пропускается — показать его в сетке нечем, а падать из-за одной плохой
 * записи не должен весь экран. `activeChannelIds` — id активных каналов
 * кабинета (ScheduleScreen грузит их один раз через useChannels(true)): без
 * него channelCount считал бы и давно выключенные каналы (ревью п.4). */
export function buildScheduleGrid(
  classes: ClassDto[],
  activeChannelIds: ReadonlySet<string> = new Set(),
): ScheduleGrid {
  const grid = emptyGrid();
  for (const cls of classes) {
    for (const rule of cls.rules) {
      const startMinutes = timeToMinutes(rule.time);
      if (Number.isNaN(startMinutes)) continue;
      grid[rule.weekday].push({
        classId: cls.id,
        ruleId: rule.id,
        title: cls.title,
        groupLabel: cls.groupLabel,
        format: cls.format,
        timeLabel: formatTimeRange(rule),
        startMinutes,
        active: cls.active,
        linkMissing: cls.format !== 'offline' && !cls.zoomLink,
        channelCount: countActiveChannels(cls.channelIds, activeChannelIds),
        tags: cls.tags,
      });
    }
  }
  for (const day of WEEKDAYS) {
    grid[day].sort((a, b) => a.startMinutes - b.startMinutes);
  }
  return grid;
}
