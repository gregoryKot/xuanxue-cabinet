// Экран «Экзамены» — конструктор формы, собранной из вопросов банка
// (docs/PLAN.md §11, ТЗ 4.3). Список и лист — по образцу
// exam-items/ExamItemsScreen.tsx. Вход в банк вопросов — карточкой внизу, не
// пунктом меню (docs/adr/0025-navigation-by-domain.md). Сюда же встанут
// проверка работ и статистика — слои 4.6–4.8.
import { useState, type CSSProperties } from 'react';
import { ExamItemsIcon } from '../app/navIcons';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  primaryActionStyle,
  screenExplanationStyle,
  screenSectionStyle,
} from '../components/screenLayout';
import { SectionLink } from '../components/SectionLink';
import { SkeletonList } from '../components/Skeleton';
import { ExamCard } from './ExamCard';
import { ExamFilters, type ExamFilterValues } from './ExamFilters';
import { ExamSheet } from './ExamSheet';
import { useExams } from './useExams';

const EXPLANATION =
  'Форма собирается из вопросов банка блоками — один вопрос можно поставить в несколько экзаменов.';
const EMPTY_MESSAGE = 'Экзаменов пока нет. Соберите первый из вопросов банка.';
const EMPTY_FILTERED_MESSAGE = 'С такими фильтрами экзаменов нет.';
const EXAM_ITEMS_LINK_HINT =
  'Из них собирается экзамен. Один вопрос можно поставить в несколько экзаменов.';

const EMPTY_FILTERS: ExamFilterValues = { status: '', level: '' };

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

export default function ExamsScreen() {
  const [filters, setFilters] = useState<ExamFilterValues>(EMPTY_FILTERS);
  const { exams, loading, error, reload, create, update, remove } = useExams(filters);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetExamId, setSheetExamId] = useState<string | null>(null);

  const selectedExam = exams?.find((exam) => exam.id === sheetExamId) ?? null;
  const isFiltered = filters.status !== '' || filters.level !== '';

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
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {!loading && (
        <Button style={primaryActionStyle} onClick={openCreate}>
          Новый экзамен
        </Button>
      )}

      <ExamFilters values={filters} onChange={setFilters} />

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonList rows={5} h={72} />}

      {!loading && !error && exams?.length === 0 && (
        <p style={{ margin: 0 }}>{isFiltered ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && exams && exams.length > 0 && (
        <ul style={listStyle}>
          {exams.map((exam) => (
            <ExamCard key={exam.id} exam={exam} onSelect={() => openEdit(exam.id)} />
          ))}
        </ul>
      )}

      <SectionLink
        to="/exam-items"
        title="Вопросы"
        hint={EXAM_ITEMS_LINK_HINT}
        Icon={ExamItemsIcon}
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
