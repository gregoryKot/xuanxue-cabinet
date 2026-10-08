// Доска штата (ADR-0174, владелец 2026-10-06: «доска стала главным экраном
// при любом входе. у учителя там кнопки настроить расписание, рассылки,
// материалы — из навигации можно убрать»). Сверху объявление ученикам — то же,
// что видит ученик, и здесь же правится (StaffBoardNotice.tsx, ADR-0172
// дополнение): ему нужны настройки школы целиком, поэтому штат читает
// GET /settings, а не GET /me/board ученика. Дальше три рубрики: «Ждёт вас» —
// число работ на проверке кликабельной строкой внутри карточки «Проверка»
// (тот же приём, что на «Экзаменах»: exams/ExamsSectionStats.tsx,
// gradingQueueHint.ts); «События» — ближайшие ретриты и семинары и карточка
// «Добавить событие» (StaffBoardEvents.tsx, ADR-0177); «Настроить» —
// карточки-входы в разделы, ушедшие из панели: «Занятия» (экран штата
// /planning, в шапке которого кнопка «Расписание» в постоянное расписание —
// «Расписание» значит один экран, /schedule), «Рассылки»,
// «Материалы» и «Школа» — настройки школы (ADR-0176). Карточки — общий
// SectionLink (CLAUDE.md «Одна механика — один компонент»).
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SectionLink } from '../components/SectionLink';
import { formatGradingQueueHint } from '../grading/gradingQueueHint';
import { useGradingQueue } from '../grading/useGradingQueue';
import { useSettings } from '../templates/useSettings';
import { BoardSection } from './BoardSection';
import { StaffBoardEvents } from './StaffBoardEvents';
import { StaffBoardNotice } from './StaffBoardNotice';

const QUEUE_HEADING = 'Ждёт вас';
const GRADING_PATH = '/grading';
const GRADING_TITLE = 'Проверка';
const GRADING_HINT = 'Сданные работы учеников, которые ждут вашей оценки.';

const SETUP_HEADING = 'Настроить';
// Подписи говорят, что внутри раздела, одной строкой — чтобы за пять секунд
// было понятно, куда нажать (CLAUDE.md «Каждая фича объясняет…»).
const SETUP_LINKS = [
  {
    to: '/planning',
    title: 'Занятия',
    hint: 'Занятия на **четыре недели**, темы и записи; внутри — разовое занятие и постоянное расписание.',
  },
  {
    to: '/broadcasts',
    title: 'Рассылки',
    hint: 'Журнал отправок, шаблоны постов и каналы.',
  },
  {
    to: '/materials',
    title: 'Материалы',
    hint: 'Книги, статьи и видео для учеников.',
  },
  // Настройки школы (ADR-0176): раньше лежали на «Шаблонах» под «Рассылками».
  {
    to: '/school',
    title: 'Школа',
    hint: 'Кому платить, напоминание об оплате, контакт для новичков, сайт.',
  },
];

export function StaffBoard() {
  const { attempts, error, reload } = useGradingQueue();
  const settingsState = useSettings();

  return (
    <>
      {settingsState.error && (
        <LoadErrorBanner
          message={settingsState.error}
          onRetry={() => void settingsState.reload()}
          retryLabel="Обновить"
        />
      )}
      {/* Пока настройки грузятся, места под объявление не резервируем — как
          у ученика (BoardNotice.tsx): объявления может не быть вовсе. */}
      {settingsState.settings && (
        <StaffBoardNotice
          settings={settingsState.settings}
          update={settingsState.update}
          now={new Date()}
        />
      )}

      <BoardSection heading={QUEUE_HEADING}>
        {error && (
          <LoadErrorBanner
            message={error}
            onRetry={() => void reload()}
            retryLabel="Обновить"
          />
        )}
        <SectionLink
          to={GRADING_PATH}
          title={GRADING_TITLE}
          headline={formatGradingQueueHint(attempts?.length ?? null)}
          hint={GRADING_HINT}
        />
      </BoardSection>

      <StaffBoardEvents />

      <BoardSection heading={SETUP_HEADING}>
        <div className="xuanxue-block-grid">
          {SETUP_LINKS.map((link) => (
            <SectionLink key={link.to} to={link.to} title={link.title} hint={link.hint} />
          ))}
        </div>
      </BoardSection>
    </>
  );
}
