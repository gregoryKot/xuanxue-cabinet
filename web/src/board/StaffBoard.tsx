// Главная штата (ADR-0174, владелец 2026-10-06: «доска стала главным экраном
// при любом входе. у учителя там кнопки настроить расписание, рассылки,
// материалы — из навигации можно убрать»; название «Главная» и плитки без
// рубрик — ADR-0178). Сверху объявление ученикам — то же, что видит ученик, и
// здесь же правится (StaffBoardNotice.tsx, ADR-0172 дополнение): ему нужны
// настройки школы целиком, поэтому штат читает GET /settings, а не GET
// /me/board ученика. Дальше плитки подряд, без рубрик: «Проверка» с числом
// работ на проверке кликабельной строкой (тот же приём, что на «Экзаменах»:
// exams/ExamsSectionStats.tsx, gradingQueueHint.ts); ближайшие события и
// карточка «Добавить событие» (StaffBoardEvents.tsx, ADR-0177); карточки-входы
// в разделы, ушедшие из панели, сеткой в две колонки на широком экране:
// «Занятия» (/planning; «Расписание» — только кнопка в его шапке, ADR-0176),
// «Рассылки», «Материалы» и «Школа» — настройки школы (ADR-0176).
// Карточки — общий SectionLink (CLAUDE.md «Одна механика — один компонент»).
import { SectionLink } from '../components/SectionLink';
import { formatGradingQueueHint } from '../grading/gradingQueueHint';
import { useGradingQueue } from '../grading/useGradingQueue';
import { useSettings } from '../templates/useSettings';
import { BoardLoadError } from './BoardLoadError';
import { StaffBoardEvents } from './StaffBoardEvents';
import { StaffBoardNotice } from './StaffBoardNotice';

const GRADING_PATH = '/grading';
const GRADING_TITLE = 'Проверка';
const GRADING_HINT = 'Сданные работы учеников, которые ждут вашей оценки.';

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
        <BoardLoadError
          message={settingsState.error}
          onRetry={() => void settingsState.reload()}
        />
      )}
      {/* Пока настройки грузятся, места под объявление не резервируем:
          объявления может не быть вовсе, а карточка-плюс появится вместе с
          настройками. */}
      {settingsState.settings && (
        <StaffBoardNotice
          settings={settingsState.settings}
          update={settingsState.update}
          now={new Date()}
        />
      )}

      {error && <BoardLoadError message={error} onRetry={() => void reload()} />}
      <SectionLink
        to={GRADING_PATH}
        title={GRADING_TITLE}
        headline={formatGradingQueueHint(attempts?.length ?? null)}
        hint={GRADING_HINT}
      />

      <StaffBoardEvents />

      <div className="xuanxue-block-grid">
        {SETUP_LINKS.map((link) => (
          <SectionLink key={link.to} to={link.to} title={link.title} hint={link.hint} />
        ))}
      </div>
    </>
  );
}
