// Экран «Задания» — первый экран ученика после входа (решение владельца:
// экзамены — отдельный маршрут, не блок внизу «Занятий», docs/PLAN.md §11).
// Заголовок и объяснение — как у остальных разделов кабинета (ScreenHeader,
// см. exams/ExamsScreen.tsx, broadcasts/BroadcastsScreen.tsx).
//
// Список приехал из StudentExamsSection.tsx (файл удалён вместе с тестом —
// второй копии не осталось): та же карточка (StudentExamCard.tsx, без
// изменений) и та же логика старта попытки (useMyExams.startAttempt —
// идемпотентный POST, дальше сразу переход на экран сдачи).
//
// useMyExams — из MyExamsProvider.tsx (ADR-0063): список общий на всё
// приложение, этот экран и центр уведомлений (счётчик у колокольчика) читают
// один запрос GET /me/exams через контекст, а не заводят каждый свой.
//
// Новое здесь — рубрики: задания, к которым ученик ещё не приступал
// (getExamAction === 'start'), идут первыми под своей рубрикой, остальные —
// ниже под «Остальные». Разделение — splitNewTasks.ts, чистая функция с
// тестом (CLAUDE.md «Логика вне компонентов»).
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MyExamDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { cardListStyle } from '../components/listCardStyles';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { useMyExams } from './MyExamsProvider';
import { splitNewTasks } from './splitNewTasks';
import { StudentExamCard } from './StudentExamCard';

const TITLE = 'Задания';
const EXPLANATION =
  'Экзамены, которые открыл учитель. Каждый — с числом попыток и итогом проверки.';
const EMPTY_MESSAGE = 'Заданий пока нет.';
// Склонение — по числу новых заданий; двух форм хватает (pluralRu тут не
// нужен, ветвлений всего две — CLAUDE.md «Без магических чисел»: константы
// рядом с использованием).
const NEW_RUBRIC_ONE = 'Новое задание';
const NEW_RUBRIC_MANY = 'Новые задания';
const REST_RUBRIC = 'Остальные';
const START_ERROR_MESSAGE = 'Не удалось начать попытку. Попробуйте ещё раз.';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>` свои отступы от браузера — расстояние держит `gap` колонки.
const headingStyle: CSSProperties = { margin: 0 };

export default function TasksScreen() {
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

  function renderCard(exam: MyExamDto) {
    return (
      <StudentExamCard
        key={exam.id}
        exam={exam}
        pending={pendingExamId === exam.id}
        error={startErrors[exam.id] || null}
        onStart={() => void handleStart(exam.id)}
      />
    );
  }

  const ready = !loading && !error && exams !== null;
  const { newTasks, restTasks } = ready
    ? splitNewTasks(exams)
    : { newTasks: [], restTasks: [] };

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && !error && <SkeletonList rows={2} h={104} />}

      {ready && exams.length === 0 && <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>}

      {/* Рубрики только когда список разбит на две группы — одни «старые»
          задания идут плоским списком, без «Остальных» над пустым местом. */}
      {ready && newTasks.length > 0 && (
        <div style={groupStyle}>
          <h2 className="xuanxue-eyebrow" style={headingStyle}>
            {newTasks.length === 1 ? NEW_RUBRIC_ONE : NEW_RUBRIC_MANY}
          </h2>
          <ul style={cardListStyle}>{newTasks.map(renderCard)}</ul>
        </div>
      )}

      {ready && restTasks.length > 0 && (
        <div style={groupStyle}>
          {newTasks.length > 0 && (
            <h2 className="xuanxue-eyebrow" style={headingStyle}>
              {REST_RUBRIC}
            </h2>
          )}
          <ul style={cardListStyle}>{restTasks.map(renderCard)}</ul>
        </div>
      )}
    </section>
  );
}
