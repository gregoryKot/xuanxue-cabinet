// Экран «Проверка работ», /grading (слой 4.6, ТЗ 4.6, п.1) — список сданных
// попыток, ждущих оценки. Вход — число раздела на «Экзаменах»
// (exams/ExamsSectionStats.tsx), не пункт меню (docs/adr/0025-navigation-by-domain.md). Список и переход в
// карточку проверки по клику — по образцу exams/ExamsScreen.tsx. Облик —
// направление «Тёплая школа» (docs/adr/0043): заголовок антиквой и
// строка-объяснение под ним, тот же приём, что на «Экзаменах»; отдельного
// макета у очереди нет, весь список идёт одной карточкой (GradingQueueCard.tsx).
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  screenExplanationStyle,
  screenSectionStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { oneCardListStyle } from '../components/listCardStyles';
import { GradingQueueCard } from './GradingQueueCard';
import { GRADING_QUEUE_EXPLANATION } from './gradingQueueHint';
import { showsTelegramHint } from './showsTelegramHint';
import { useGradingQueue } from './useGradingQueue';

const TITLE = 'Проверка работ';
const EMPTY_MESSAGE = 'Пока нечего проверять — сданных работ нет.';
// У каждого экрана своя причина связки — так и задуман проп `explanation`
// у TelegramLinkButton (ADR-0034). На «Уведомлениях» речь про уведомления
// вообще, здесь — про эту очередь: почему о сданных работах никто не пишет
// (ADR-0042). Ничего не обещаем про «уведомления начнут приходить»: сам вид
// человек мог выключить, а это мы здесь не спрашиваем.
const TELEGRAM_LINK_EXPLANATION =
  'Бот пишет о сданных работах в личный чат, а вашего чата с ним пока нет. ' +
  'Свяжите Telegram и нажмите в боте «Запустить».';

export default function GradingQueueScreen() {
  const { attempts, loading, error, reload } = useGradingQueue();
  const navigate = useNavigate();
  const { me } = useAuth();

  return (
    <section style={screenSectionStyle}>
      <h1 style={screenTitleStyle}>{TITLE}</h1>
      <p style={screenExplanationStyle}>{GRADING_QUEUE_EXPLANATION}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonList rows={5} h={64} />}

      {!loading && !error && attempts?.length === 0 && (
        <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && attempts && attempts.length > 0 && (
        <ul style={oneCardListStyle}>
          {attempts.map((attempt, index) => (
            <GradingQueueCard
              key={attempt.id}
              attempt={attempt}
              onSelect={() => void navigate(`/grading/${attempt.id}`)}
              isLast={index === attempts.length - 1}
            />
          ))}
        </ul>
      )}

      {showsTelegramHint(me) && (
        <TelegramLinkButton explanation={TELEGRAM_LINK_EXPLANATION} />
      )}
    </section>
  );
}
