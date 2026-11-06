// Подэкран «Правила недели», `/schedule/rules` (ADR-0198; раньше «Расписание
// и рассылки», ADR-0191): постоянные занятия недели и то, куда уходят их
// ссылки и записи. Из них кабинет сам ставит даты на главном экране раздела
// «Расписание» (planning/PlanningScreen.tsx); журнал отправок — его шапка,
// каналы и шаблоны — шапка этого экрана. Правка и создание занятия — своя
// страница `/schedule/new` и `/schedule/:classId` (ClassEditorScreen.tsx,
// ADR-0033): отсюда только переход. Одно главное действие — «Добавить
// занятие» (CLAUDE.md «Продукт»: одна очевидная кнопка на экран) — в шапке
// рядом с заголовком, а не под неделей. Неделя — дни карточками в столбцы по
// ширине экрана (ScheduleDayList.tsx): на телефоне один, на мониторе три
// (CLAUDE.md «Мобильный экран первым»).
//
// Облик — направление «Тёплая школа» (docs/adr/0043): заголовок антиквой со
// строкой объяснения, день — карточка, занятие — строка в ней (SlotRow.tsx).
// Переключателя «Неделя / Список» с макета здесь нет: список дат — главный
// экран того же раздела, и второй способ смотреть то же самое сбивал бы с
// толку.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_LEAD_MINUTES, PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { useChannels } from '../channels/useChannels';
import { useGroups } from '../groups/useGroups';
import { backLinkStyle } from '../components/editorLayout';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenActions, type ScreenAction } from '../components/ScreenActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { ScheduleDayList } from './ScheduleDayList';
import { buildScheduleGrid } from './scheduleGrid';
import { scheduleTzNote } from './timezoneLabel';
import { useClasses } from './useClasses';

const TITLE = 'Правила недели';
const EXPLANATION = `Что идёт каждую неделю. Из этих правил кабинет сам ставит занятия в «Расписание» на **${PLANNING_HORIZON_WEEKS} недели** вперёд. Впишите ссылку Zoom в занятие — ученики получат её за **${DEFAULT_LEAD_MINUTES} минут** до начала; под занятием видно, куда уходят ссылка и запись.`;
const SCHEDULE_PATH = '/schedule';
const BACK_TEXT = 'К расписанию';
const CHANNELS_PATH = '/channels';
const TEMPLATES_PATH = '/templates';

export default function WeekRulesScreen() {
  const { classes, loading, error, reload } = useClasses();
  // Активные каналы нужны самой неделе: SlotRow по ним видит, что ссылку
  // некому разослать (ревью п.4).
  const { channels: activeChannels } = useChannels();
  // Названия групп — для строки «→ Средние · Тайцзи онлайн» под занятием.
  const { groups } = useGroups();
  const navigate = useNavigate();

  const grid = useMemo(
    () => buildScheduleGrid(classes ?? [], activeChannels, groups),
    [classes, activeChannels, groups],
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
  ];
  if (!loading) {
    actions.push({ label: 'Добавить занятие', onClick: openCreate, variant: 'primary' });
  }
  const openEdit = (classId: string) => void navigate(`${SCHEDULE_PATH}/${classId}`);

  return (
    <section style={screenSectionStyle}>
      <Link to={SCHEDULE_PATH} style={backLinkStyle}>
        {BACK_TEXT}
      </Link>
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
        <p style={{ margin: 0 }}>Пока в правилах недели нет занятий.</p>
      )}

      {!loading && !error && totalSlots > 0 && (
        <ScheduleDayList grid={grid} onSelectSlot={openEdit} />
      )}
    </section>
  );
}
