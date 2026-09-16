// Экран «Экзамены» — список экзаменов, собранных из вопросов банка
// (docs/PLAN.md §11, ТЗ 4.3). Правка и создание — отдельная страница
// `/exams/new` и `/exams/:examId` (ExamEditorScreen.tsx, ADR-0033): отсюда
// только переход. Числа раздела — ExamsSectionStats.tsx, не пункт меню
// (docs/adr/0025-navigation-by-domain.md). Облик — направление «тихо и
// благородно» (docs/adr/0031), макет Main.dc.html: заголовок антиквой,
// переключатели статуса вместо select, строка списка вместо карточки.
//
// Уровень остаётся полем формы (ExamAboutFields.tsx) и параметром API
// (`/exams?level=`), но не фильтром строки: нужный случай («все формы одного
// уровня») закрывают поиск по названию и переключатели статуса.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXAM_STATUSES } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ListFilters } from '../components/ListFilters';
import { ListScreenBody } from '../components/ListScreenBody';
import { primaryActionStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { useExamItemStatsSummary } from '../exam-items/useExamItemStatsSummary';
import { useGradingQueue } from '../grading/useGradingQueue';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';
import { matchesSearch } from '../lib/textSearch';
import { ExamCard } from './ExamCard';
import { ExamsSectionStats } from './ExamsSectionStats';
import { useExams, type ExamListFilters } from './useExams';

const TITLE = 'Экзамены';
const EXPLANATION =
  'Экзамен собирается из вопросов банка — один вопрос можно поставить в несколько экзаменов.';
const EMPTY_MESSAGE = 'Экзаменов пока нет. Соберите первый из вопросов банка.';
const EMPTY_FILTERED_MESSAGE = 'С такими фильтрами экзаменов нет.';
const SEARCH_LABEL = 'Поиск по названию';
const EXAMS_PATH = '/exams';

const EMPTY_FILTERS: ExamListFilters = { status: '' };

export default function ExamsScreen() {
  const [filters, setFilters] = useState<ExamListFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const { exams, loading, error, reload } = useExams(filters);
  const gradingQueue = useGradingQueue();
  const itemStatsSummary = useExamItemStatsSummary();
  const navigate = useNavigate();

  const visibleExams =
    exams?.filter((exam) => matchesSearch([exam.title], search)) ?? null;
  const isFiltered = filters.status !== '' || search.trim() !== '';

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        action={
          !loading && (
            <Button
              style={primaryActionStyle}
              onClick={() => void navigate(`${EXAMS_PATH}/new`)}
            >
              Новый экзамен
            </Button>
          )
        }
      />

      <ListFilters
        statuses={EXAM_STATUSES}
        labels={DRAFT_PUBLISHED_ARCHIVED_LABELS_RU}
        value={filters.status}
        onChange={(status) => setFilters({ status })}
        search={{ label: SEARCH_LABEL, value: search, onChange: setSearch }}
      />

      <ListScreenBody
        items={visibleExams}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        emptyMessage={isFiltered ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}
        renderItem={(exam) => (
          <ExamCard
            key={exam.id}
            exam={exam}
            onSelect={() => void navigate(`${EXAMS_PATH}/${exam.id}`)}
          />
        )}
      />

      <ExamsSectionStats
        queueCount={gradingQueue.attempts?.length ?? null}
        strugglingCount={itemStatsSummary.summary?.strugglingCount ?? null}
      />
    </section>
  );
}
