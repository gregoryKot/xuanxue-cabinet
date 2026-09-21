// Экран «Проверка работ», /grading (слой 4.6, ТЗ 4.6, п.1; docs/PLAN.md
// §4.6) — два раздела: «Ждут проверки» (главное действие экрана, первым) и
// «Проверенные» — вернуться к своей оценке и комментарию можно не только по
// прямой ссылке на карточку. Вход — число раздела на «Экзаменах»
// (exams/ExamsSectionStats.tsx, components/SectionLink.tsx), не пункт меню
// (docs/adr/0025-navigation-by-domain.md). Оба раздела — GradingQueueSection.tsx
// (список и переход в карточку проверки по клику, облик направления «Тёплая
// школа», docs/adr/0043), сам экран остаётся тонкой сборкой двух хуков.
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  screenExplanationStyle,
  screenSectionStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { GradingQueueSection } from './GradingQueueSection';
import { GRADING_QUEUE_EXPLANATION } from './gradingQueueHint';
import { showsTelegramHint } from './showsTelegramHint';
import { sortGradedAttempts } from './sortGradedAttempts';
import { useGradedAttempts } from './useGradedAttempts';
import { useGradingQueue } from './useGradingQueue';

const TITLE = 'Проверка работ';
const QUEUE_TITLE = 'Ждут проверки';
const QUEUE_EMPTY_MESSAGE = 'Пока нечего проверять — сданных работ нет.';
const GRADED_TITLE = 'Проверенные';
const GRADED_EMPTY_MESSAGE = 'Проверенных работ пока нет.';
// У каждого экрана своя причина связки — так и задуман проп `explanation`
// у TelegramLinkButton (ADR-0034). На «Уведомлениях» речь про уведомления
// вообще, здесь — про эту очередь: почему о сданных работах никто не пишет
// (ADR-0042). Ничего не обещаем про «уведомления начнут приходить»: сам вид
// человек мог выключить, а это мы здесь не спрашиваем.
const TELEGRAM_LINK_EXPLANATION =
  'Бот пишет о сданных работах в личный чат, а вашего чата с ним пока нет. ' +
  'Свяжите Telegram и нажмите в боте «Запустить».';

export default function GradingQueueScreen() {
  const queue = useGradingQueue();
  const graded = useGradedAttempts();
  const navigate = useNavigate();
  const { me } = useAuth();

  function openAttempt(attemptId: string) {
    void navigate(`/grading/${attemptId}`);
  }

  return (
    <section style={screenSectionStyle}>
      <h1 style={screenTitleStyle}>{TITLE}</h1>
      <p style={screenExplanationStyle}>{GRADING_QUEUE_EXPLANATION}</p>

      <GradingQueueSection
        title={QUEUE_TITLE}
        attempts={queue.attempts}
        loading={queue.loading}
        error={queue.error}
        onRetry={() => void queue.reload()}
        emptyMessage={QUEUE_EMPTY_MESSAGE}
        onSelect={openAttempt}
      />

      <GradingQueueSection
        title={GRADED_TITLE}
        attempts={graded.attempts ? sortGradedAttempts(graded.attempts) : null}
        loading={graded.loading}
        error={graded.error}
        onRetry={() => void graded.reload()}
        emptyMessage={GRADED_EMPTY_MESSAGE}
        onSelect={openAttempt}
      />

      {showsTelegramHint(me) && (
        <TelegramLinkButton explanation={TELEGRAM_LINK_EXPLANATION} />
      )}
    </section>
  );
}
