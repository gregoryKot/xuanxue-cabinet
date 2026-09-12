// Раздел «Экзамены» на экране ученика (ТЗ п.1) — под ближайшими занятиями
// (StudentScreen.tsx). «Начать»/«Продолжить» — один и тот же запрос
// (useMyExams.startAttempt — идемпотентный POST), дальше сразу переход на
// экран сдачи: список экзаменов не нуждается в перезагрузке ради этого.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/http';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { StudentExamCard } from './StudentExamCard';
import { useMyExams } from './useMyExams';

const EXPLANATION = 'Экзамены, которые открыл учитель, — с числом попыток и их итогом.';
const EMPTY_MESSAGE = 'Экзаменов пока нет.';
const START_ERROR_MESSAGE = 'Не удалось начать попытку. Попробуйте ещё раз.';
const listStyle = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
};

export function StudentExamsSection() {
  const { data: exams, loading, error, reload, startAttempt } = useMyExams();
  const navigate = useNavigate();
  const [pendingExamId, setPendingExamId] = useState<string | null>(null);
  const [startErrors, setStartErrors] = useState<Record<string, string>>({});

  async function handleStart(examId: string) {
    setPendingExamId(examId);
    setStartErrors((prev) => ({ ...prev, [examId]: '' }));
    try {
      const attempt = await startAttempt(examId);
      void navigate(`/attempts/${attempt.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : START_ERROR_MESSAGE;
      setStartErrors((prev) => ({ ...prev, [examId]: message }));
    } finally {
      setPendingExamId(null);
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Экзамены</h2>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && !error && <SkeletonList rows={2} h={104} />}

      {!loading && !error && exams && exams.length === 0 && (
        <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && exams && exams.length > 0 && (
        <ul style={listStyle}>
          {exams.map((exam) => (
            <StudentExamCard
              key={exam.id}
              exam={exam}
              pending={pendingExamId === exam.id}
              error={startErrors[exam.id] || null}
              onStart={() => void handleStart(exam.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
