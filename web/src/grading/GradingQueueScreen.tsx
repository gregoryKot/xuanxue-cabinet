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
import { screenSectionStyle, screenTitleStyle } from '../components/screenLayout';
import { TELEGRAM_CHAT_EXPLANATION } from '../telegram/telegramChatExplanation';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { GradingQueueSection } from './GradingQueueSection';
import { showsTelegramHint } from './showsTelegramHint';
import { sortGradedAttempts } from './sortGradedAttempts';
import { useGradedAttempts } from './useGradedAttempts';
import { useGradingQueue } from './useGradingQueue';

const TITLE = 'Проверка работ';
const QUEUE_TITLE = 'Ждут проверки';
const QUEUE_EMPTY_MESSAGE = 'Пока нечего проверять — сданных работ нет.';
const GRADED_TITLE = 'Проверенные';
const GRADED_EMPTY_MESSAGE = 'Проверенных работ пока нет.';

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
        <TelegramLinkButton explanation={TELEGRAM_CHAT_EXPLANATION} />
      )}
    </section>
  );
}
