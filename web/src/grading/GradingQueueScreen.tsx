// Экран «Проверка работ», /grading (слой 4.6, ТЗ 4.6, п.1) — список сданных
// попыток, ждущих оценки. Вход — число раздела на «Экзаменах»
// (exams/ExamsSectionStats.tsx), не пункт меню (docs/adr/0025-navigation-by-domain.md). Список и переход в
// карточку проверки по клику — по образцу exams/ExamsScreen.tsx. Облик —
// направление «тихо и благородно» (docs/adr/0031): заголовок антиквой и
// строка-объяснение под ним, тот же приём, что на «Экзаменах»; отдельного
// макета у очереди нет, канвы Main.dc.html достаточно для списка строками.
import type { CSSProperties } from 'react';
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
import { GradingQueueCard } from './GradingQueueCard';
import { showsTelegramHint } from './showsTelegramHint';
import { useGradingQueue } from './useGradingQueue';

const TITLE = 'Проверка работ';
const EXPLANATION =
  'Работы, которые ученики уже сдали. Откройте любую, чтобы поставить итог и написать комментарий.';
const EMPTY_MESSAGE = 'Пока нечего проверять — сданных работ нет.';
// У каждого экрана своя причина связки — так и задуман проп `explanation`
// у TelegramLinkButton (ADR-0034). На «Уведомлениях» речь про уведомления
// вообще, здесь — про эту очередь: почему о сданных работах никто не пишет
// (ADR-0042). Ничего не обещаем про «уведомления начнут приходить»: сам вид
// человек мог выключить, а это мы здесь не спрашиваем.
const TELEGRAM_LINK_EXPLANATION =
  'Бот пишет о сданных работах в личный чат, а вашего чата с ним пока нет. ' +
  'Свяжите Telegram и нажмите в боте «Запустить».';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

export default function GradingQueueScreen() {
  const { attempts, loading, error, reload } = useGradingQueue();
  const navigate = useNavigate();
  const { me } = useAuth();

  return (
    <section style={screenSectionStyle}>
      <h1 style={screenTitleStyle}>{TITLE}</h1>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonList rows={5} h={64} />}

      {!loading && !error && attempts?.length === 0 && (
        <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && attempts && attempts.length > 0 && (
        <ul style={listStyle}>
          {attempts.map((attempt) => (
            <GradingQueueCard
              key={attempt.id}
              attempt={attempt}
              onSelect={() => void navigate(`/grading/${attempt.id}`)}
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
