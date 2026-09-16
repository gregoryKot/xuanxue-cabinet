// Сетка недели, `/schedule` — подэкран раздела «Занятия» (вход с
// PlanningScreen.tsx, docs/adr/0025-navigation-by-domain.md). Правка и
// создание занятия — своя страница `/schedule/new` и `/schedule/:classId`
// (ClassEditorScreen.tsx, ADR-0033): отсюда только переход. Одно главное
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
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { ScheduleDayList } from './ScheduleDayList';
import { ScheduleGridView } from './ScheduleGridView';
import { buildScheduleGrid } from './scheduleGrid';
import { scheduleTzNote } from './timezoneLabel';
import { useClasses } from './useClasses';

const TITLE = 'Расписание';
const EXPLANATION = `Постоянные занятия недели. Впишите ссылку Zoom в занятие, и ученики получат её за ${DEFAULT_LEAD_MINUTES} минут до начала сами.`;
const SCHEDULE_PATH = '/schedule';

export default function ScheduleScreen() {
  const { classes, loading, error, reload } = useClasses();
  // Активные каналы нужны самой сетке: SlotCard считает по ним, сколько
  // каналов реально получит рассылку (ревью п.4).
  const { channels: activeChannels } = useChannels(true);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

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
  // Занятие открывается своей страницей с адресом, а не листом поверх сетки
  // (ADR-0033): ссылку можно прислать, «Назад» браузера возвращает сюда.
  const openCreate = () => void navigate(`${SCHEDULE_PATH}/new`);
  const openEdit = (classId: string) => void navigate(`${SCHEDULE_PATH}/${classId}`);

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
    </section>
  );
}
