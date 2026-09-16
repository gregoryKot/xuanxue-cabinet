// Сетка недели, `/schedule` — подэкран раздела «Занятия» (вход с
// PlanningScreen.tsx, docs/adr/0025-navigation-by-domain.md). Одно главное
// действие — «Добавить занятие» (CLAUDE.md «Продукт»: одна очевидная кнопка
// на экран) — в шапке рядом с заголовком, а не под сеткой. <768px —
// вертикальный список по дням, ≥768px — сетка семи колонок (CLAUDE.md
// «Мобильный экран первым»).
//
// Облик — направление «тихо и благородно» (docs/adr/0031), макет
// Schedule.dc.html: заголовок антиквой со строкой объяснения, сетка на
// волосяных линиях. Переключателя «Неделя / Список» с макета здесь нет:
// список ближайших занятий — соседний экран «Занятия», а вид сетки выбирает
// ширина экрана, и второй способ выбирать то же самое сбивал бы с толку.
import { useMemo, useState } from 'react';
import { DEFAULT_LEAD_MINUTES } from '@xuanxue/shared';
import { useChannels } from '../channels/useChannels';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  primaryActionStyle,
  screenSectionStyle,
  wideScreenSectionStyle,
} from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTeachers } from '../people/useTeachers';
import { ClassSheet } from './ClassSheet';
import { ScheduleDayList } from './ScheduleDayList';
import { ScheduleGridView } from './ScheduleGridView';
import { buildScheduleGrid } from './scheduleGrid';
import { scheduleTzNote } from './timezoneLabel';
import { useClasses } from './useClasses';

const TITLE = 'Расписание';
const EXPLANATION = `Постоянные занятия недели. Впишите ссылку Zoom в занятие, и ученики получат её за ${DEFAULT_LEAD_MINUTES} минут до начала сами.`;

export default function ScheduleScreen() {
  const { classes, loading, error, reload, create, update, remove } = useClasses();
  // Активные каналы грузятся один раз здесь и передаются в лист занятия —
  // не на каждое открытие листа (ревью п.1). Список каналов read-only на
  // этом экране, мутации ему не нужны.
  const { channels: activeChannels } = useChannels(true);
  // Учителя для select'а «Ведущий» — тот же приём (аудит В4).
  const teachersState = useTeachers();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetClassId, setSheetClassId] = useState<string | null>(null);

  // Только id — SlotCard/channelCountLabel считают пересечение с
  // channelIds занятия, чтобы выключенный канал не попадал в счётчик
  // (ревью п.4).
  const activeChannelIds = useMemo(
    () => new Set((activeChannels ?? []).map((channel) => channel.id)),
    [activeChannels],
  );
  const grid = useMemo(
    () => buildScheduleGrid(classes ?? [], activeChannelIds),
    [classes, activeChannelIds],
  );
  const totalSlots = useMemo(() => Object.values(grid).flat().length, [grid]);
  // Пояс подписан один раз под объяснением, а не припиской у каждого слота:
  // одиннадцать строк «Asia/Jerusalem» подряд ничего не сообщают
  // (отзыв владельца 2026-09-12).
  const tzNote = useMemo(
    () => scheduleTzNote((classes ?? []).map((cls) => cls.tz)),
    [classes],
  );
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
    // Сетка недели занимает всю ширину, список на телефоне — обычную колонку.
    <section style={isMobile ? screenSectionStyle : wideScreenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        hint={tzNote}
        action={
          !loading && (
            <Button style={primaryActionStyle} onClick={openCreate}>
              Добавить занятие
            </Button>
          )
        }
      />

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
          teachers={teachersState.teachers ?? []}
          teachersError={teachersState.error}
          onRetryTeachers={() => void teachersState.reload()}
          onClose={() => setSheetOpen(false)}
          onCreate={create}
          onUpdate={update}
          onRemove={remove}
        />
      )}
    </section>
  );
}
