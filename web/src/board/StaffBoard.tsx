// Доска штата (ADR-0174, владелец 2026-10-06: «доска стала главным экраном
// при любом входе. у учителя там кнопки настроить расписание, рассылки,
// материалы — из навигации можно убрать»). Две рубрики: «Ждёт вас» — число
// работ на проверке кликабельной строкой внутри карточки «Проверка» (тот же
// приём, что на «Экзаменах»: exams/ExamsSectionStats.tsx, gradingQueueHint.ts;
// число раздела обязано вести туда, где им заняться), и «Настроить» — три
// карточки-входа в разделы, ушедшие из панели: «Расписание» (экран «Занятия»
// штата, /planning, где кнопка в постоянное расписание), «Рассылки»,
// «Материалы». Карточки — общий SectionLink (CLAUDE.md «Одна механика — один
// компонент»); данных у трёх входов нет, запрос здесь один — очередь проверки.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SectionLink } from '../components/SectionLink';
import { formatGradingQueueHint } from '../grading/gradingQueueHint';
import { useGradingQueue } from '../grading/useGradingQueue';
import { BoardSection } from './BoardSection';

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
    title: 'Расписание',
    hint: 'Занятия на четыре недели, разовое занятие и постоянное расписание.',
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
];

export function StaffBoard() {
  const { attempts, error, reload } = useGradingQueue();

  return (
    <>
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
