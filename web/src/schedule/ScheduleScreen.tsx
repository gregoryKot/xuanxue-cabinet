// Первый экран после входа (docs/PLAN.md §6: «Первый экран после входа
// объясняет за пять секунд...»). Одно главное действие — «Добавить занятие»
// (CLAUDE.md «Продукт»: одна очевидная кнопка на экран) — вверху, рядом с
// объяснением, а не под сеткой. <768px — вертикальный список по дням,
// ≥768px — сетка семи колонок (CLAUDE.md «Мобильный экран первым»).
import { useMemo, useState } from 'react';
import { DEFAULT_LEAD_MINUTES } from '@xuanxue/shared';
import { useChannels } from '../channels/useChannels';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
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
  // Активные каналы грузятся один раз здесь и передаются в лист занятия —
  // не на каждое открытие листа (ревью п.1). Список каналов read-only на
  // этом экране, мутации ему не нужны.
  const { channels: activeChannels } = useChannels(true);
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
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {!loading && <Button onClick={openCreate}>Добавить занятие</Button>}

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
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
          channels={activeChannels ?? []}
          onClose={() => setSheetOpen(false)}
          onCreate={create}
          onUpdate={update}
          onRemove={remove}
        />
      )}
    </section>
  );
}
