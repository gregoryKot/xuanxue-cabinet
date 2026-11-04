// Раздел «Расписание и рассылки», `/schedule` (ADR-0191, владелец 2026-11-04):
// постоянные занятия недели и то, куда уходят их ссылки и записи, — на одном
// экране; журнал отправок, шаблоны и каналы — подэкраны, входы в шапке. Вход
// с главной штата и с «Занятий» (docs/adr/0025). Правка и
// создание занятия — своя страница `/schedule/new` и `/schedule/:classId`
// (ClassEditorScreen.tsx, ADR-0033): отсюда только переход. Одно главное
// действие — «Добавить занятие» (CLAUDE.md «Продукт»: одна очевидная кнопка
// на экран) — в шапке рядом с заголовком, а не под неделей. Неделя — дни
// карточками в столбцы по ширине экрана (ScheduleDayList.tsx): на телефоне
// один, на мониторе три (CLAUDE.md «Мобильный экран первым»).
//
// Облик — направление «Тёплая школа» (docs/adr/0043): заголовок антиквой со
// строкой объяснения, день — карточка, занятие — строка в ней (SlotRow.tsx).
// Переключателя «Неделя / Список» с макета здесь нет: список ближайших
// занятий — соседний экран «Занятия», и второй способ смотреть то же самое
// сбивал бы с толку.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_LEAD_MINUTES } from '@xuanxue/shared';
import { useChannels } from '../channels/useChannels';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenActions, type ScreenAction } from '../components/ScreenActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { ScheduleDayList } from './ScheduleDayList';
import { buildScheduleGrid } from './scheduleGrid';
import { scheduleTzNote } from './timezoneLabel';
import { useClasses } from './useClasses';

const TITLE = 'Расписание и рассылки';
const EXPLANATION = `Постоянные занятия недели. Впишите ссылку Zoom в занятие, и ученики получат её за **${DEFAULT_LEAD_MINUTES} минут** до начала сами; под каждым занятием видно, куда уходят ссылка и запись.`;
const SCHEDULE_PATH = '/schedule';
const CHANNELS_PATH = '/channels';
const TEMPLATES_PATH = '/templates';
const JOURNAL_PATH = '/broadcasts';

export default function ScheduleScreen() {
  const { classes, loading, error, reload } = useClasses();
  // Активные каналы нужны самой неделе: SlotRow по ним видит, что ссылку
  // некому разослать (ревью п.4).
  const { channels: activeChannels } = useChannels();
  const navigate = useNavigate();

  const grid = useMemo(
    () => buildScheduleGrid(classes ?? [], activeChannels),
    [classes, activeChannels],
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
  // Входы в подэкраны видны сразу: им не нужно ждать список занятий. На 360px
  // ряд переносится на вторую строку (ScreenActions.tsx).
  const actions: ScreenAction[] = [
    { label: 'Каналы', onClick: () => void navigate(CHANNELS_PATH) },
    { label: 'Шаблоны', onClick: () => void navigate(TEMPLATES_PATH) },
    { label: 'Журнал отправок', onClick: () => void navigate(JOURNAL_PATH) },
  ];
  if (!loading) {
    actions.push({ label: 'Добавить занятие', onClick: openCreate, variant: 'primary' });
  }
  const openEdit = (classId: string) => void navigate(`${SCHEDULE_PATH}/${classId}`);

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        hint={tzNote}
        action={<ScreenActions actions={actions} />}
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

      {!loading && !error && totalSlots > 0 && (
        <ScheduleDayList grid={grid} onSelectSlot={openEdit} />
      )}
    </section>
  );
}
