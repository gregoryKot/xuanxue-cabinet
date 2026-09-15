// Экран «Экзамены» — конструктор формы, собранной из вопросов банка
// (docs/PLAN.md §11, ТЗ 4.3). Список и лист — по образцу
// exam-items/ExamItemsScreen.tsx. Числа раздела — ExamsSectionStats.tsx, не
// пункт меню (docs/adr/0025-navigation-by-domain.md). Облик — направление
// «тихо и благородно» (docs/adr/0031), макет Main.dc.html: заголовок
// антиквой, переключатели статуса вместо select, строка списка вместо
// карточки. Сюда же встанут проверка работ и статистика — слои 4.6–4.8.
import { useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  primaryActionStyle,
  screenExplanationStyle,
  screenSectionStyle,
  screenTitleStyle,
} from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { useExamItemStatsSummary } from '../exam-items/useExamItemStatsSummary';
import { useGradingQueue } from '../grading/useGradingQueue';
import { ExamCard } from './ExamCard';
import { ExamFilters, type ExamFilterValues } from './ExamFilters';
import { ExamsSectionStats } from './ExamsSectionStats';
import { ExamSheet } from './ExamSheet';
import { matchesExamSearch } from './examSearch';
import { useExams } from './useExams';

const EXPLANATION =
  'Форма собирается из вопросов банка блоками — один вопрос можно поставить в несколько экзаменов.';
const EMPTY_MESSAGE = 'Экзаменов пока нет. Соберите первый из вопросов банка.';
const EMPTY_FILTERED_MESSAGE = 'С такими фильтрами экзаменов нет.';

const EMPTY_FILTERS: ExamFilterValues = { status: '' };

const headerRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 20,
};
const titleColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
};
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };

export default function ExamsScreen() {
  const [filters, setFilters] = useState<ExamFilterValues>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const { exams, loading, error, reload, create, update, remove } = useExams({
    status: filters.status,
    level: '',
  });
  const gradingQueue = useGradingQueue();
  const itemStatsSummary = useExamItemStatsSummary();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetExamId, setSheetExamId] = useState<string | null>(null);

  const selectedExam = exams?.find((exam) => exam.id === sheetExamId) ?? null;
  const visibleExams =
    exams?.filter((exam) => matchesExamSearch(exam.title, search)) ?? null;
  const isFiltered = filters.status !== '' || search.trim() !== '';

  function openCreate() {
    setSheetExamId(null);
    setSheetOpen(true);
  }

  function openEdit(id: string) {
    setSheetExamId(id);
    setSheetOpen(true);
  }

  return (
    <section style={screenSectionStyle}>
      <div style={headerRowStyle}>
        <div style={titleColumnStyle}>
          <h1 style={screenTitleStyle}>Экзамены</h1>
          <p style={screenExplanationStyle}>{EXPLANATION}</p>
        </div>
        {!loading && (
          <Button style={primaryActionStyle} onClick={openCreate}>
            Новый экзамен
          </Button>
        )}
      </div>

      <ExamFilters
        values={filters}
        onChange={setFilters}
        search={search}
        onSearchChange={setSearch}
      />

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonList rows={5} h={72} />}

      {!loading && !error && visibleExams?.length === 0 && (
        <p style={{ margin: 0 }}>{isFiltered ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && visibleExams && visibleExams.length > 0 && (
        <ul style={listStyle}>
          {visibleExams.map((exam) => (
            <ExamCard key={exam.id} exam={exam} onSelect={() => openEdit(exam.id)} />
          ))}
        </ul>
      )}

      <ExamsSectionStats
        queueCount={gradingQueue.attempts?.length ?? null}
        strugglingCount={itemStatsSummary.summary?.strugglingCount ?? null}
      />

      {sheetOpen && (
        <ExamSheet
          exam={selectedExam}
          onClose={() => setSheetOpen(false)}
          onCreate={create}
          onUpdate={update}
          onRemove={remove}
        />
      )}
    </section>
  );
}
