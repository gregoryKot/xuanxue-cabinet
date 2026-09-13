// Экран «Проверка работ», /grading (слой 4.6, ТЗ 4.6, п.1) — список сданных
// попыток, ждущих оценки. Вход — карточка на «Экзаменах» (exams/ExamsScreen.tsx),
// не пункт меню (docs/adr/0025-navigation-by-domain.md). Список и переход в
// карточку проверки по клику — по образцу exams/ExamsScreen.tsx.
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { GradingQueueCard } from './GradingQueueCard';
import { useGradingQueue } from './useGradingQueue';

const EXPLANATION =
  'Работы, которые ученики уже сдали. Откройте любую, чтобы поставить баллы по рубрике.';
const EMPTY_MESSAGE = 'Пока нечего проверять — сданных работ нет.';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

export default function GradingQueueScreen() {
  const { attempts, loading, error, reload } = useGradingQueue();
  const navigate = useNavigate();

  return (
    <section style={screenSectionStyle}>
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
    </section>
  );
}
