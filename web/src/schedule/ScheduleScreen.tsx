// Первый экран после входа (docs/PLAN.md §6: «Первый экран после входа
// объясняет за пять секунд...»). Одно главное действие — «Добавить занятие»
// (CLAUDE.md «Продукт»: одна очевидная кнопка на экран) — вверху, рядом с
// объяснением, а не под сеткой. <768px — вертикальный список по дням,
// ≥768px — сетка семи колонок (CLAUDE.md «Мобильный экран первым»).
import { useMemo, useState } from 'react';
import { DEFAULT_LEAD_MINUTES } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { SkeletonList } from '../components/Skeleton';
import { useIsMobile } from '../hooks/useIsMobile';
import { ClassSheet } from './ClassSheet';
import { ScheduleDayList } from './ScheduleDayList';
import { ScheduleGridView } from './ScheduleGridView';
import { buildScheduleGrid } from './scheduleGrid';
import { useClasses } from './useClasses';

const EXPLANATION = `Здесь расписание школы. Впишите ссылку Zoom в занятие, и ученики получат её за ${DEFAULT_LEAD_MINUTES} минут до начала сами.`;

export default function ScheduleScreen() {
  const { classes, loading, error, reload, create, update, remove } = useClasses();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetClassId, setSheetClassId] = useState<string | null>(null);

  const grid = useMemo(() => buildScheduleGrid(classes ?? []), [classes]);
  const totalSlots = useMemo(() => Object.values(grid).flat().length, [grid]);
  const selectedClass = classes?.find((cls) => cls.id === sheetClassId) ?? null;

  function openCreate() {
    setSheetClassId(null);
    setSheetOpen(true);
  }

  function openEdit(classId: string) {
    setSheetClassId(classId);
    setSheetOpen(true);
  }

  return (
    <section style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{EXPLANATION}</p>

      {!loading && <Button onClick={openCreate}>Добавить занятие</Button>}

      {error && (
        <div role="alert" style={{ color: 'var(--danger)' }}>
          <p style={{ margin: '0 0 8px' }}>{error}</p>
          <Button variant="secondary" onClick={() => void reload()}>
            Обновить
          </Button>
        </div>
      )}

      {loading && !error && <SkeletonList rows={5} h={56} />}

      {!loading && !error && totalSlots === 0 && (
        <p style={{ margin: 0 }}>Пока в расписании нет занятий.</p>
      )}

      {!loading && !error && totalSlots > 0 && isMobile && (
        <ScheduleDayList grid={grid} onSelectSlot={openEdit} />
      )}

      {!loading && !error && totalSlots > 0 && !isMobile && (
        <ScheduleGridView grid={grid} onSelectSlot={openEdit} />
      )}

      {sheetOpen && (
        <ClassSheet
          classDto={selectedClass}
          onClose={() => setSheetOpen(false)}
          onCreate={create}
          onUpdate={update}
          onRemove={remove}
        />
      )}
    </section>
  );
}
