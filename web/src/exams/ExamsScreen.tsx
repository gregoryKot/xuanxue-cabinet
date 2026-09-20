// Экран «Экзамены» — список экзаменов, собранных из вопросов
// (docs/PLAN.md §11, ТЗ 4.3). Правка и создание — отдельная страница
// `/exams/new` и `/exams/:examId` (ExamEditorScreen.tsx, ADR-0033): отсюда
// только переход. Числа раздела — ExamsSectionStats.tsx, не пункт меню
// (docs/adr/0025-navigation-by-domain.md). Облик — направление «Тёплая
// школа» (docs/adr/0043), макет 2b-exams.html: заголовок антиквой,
// переключатели статуса и поиск, список одной карточкой.
//
// Уровень остаётся полем формы (ExamAboutFields.tsx) и параметром API
// (`/exams?level=`), но не фильтром строки: нужный случай («все формы одного
// уровня») закрывают поиск по названию и переключатели статуса.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXAM_STATUSES } from '@xuanxue/shared';
import { type ExamListFilters } from '../api/apiPaths';
import { Button } from '../components/Button';
import { ListFilters } from '../components/ListFilters';
import { oneCardListStyle } from '../components/listCardStyles';
import { ListScreenBody } from '../components/ListScreenBody';
import { primaryActionStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { formatExamImagesSummary } from '../exam-items/examImagesSummaryText';
import { useExamImageStats } from '../exam-items/useExamImageStats';
import { useExamItemStatsSummary } from '../exam-items/useExamItemStatsSummary';
import { useGradingPresets } from '../grading/useGradingPresets';
import { useGradingQueue } from '../grading/useGradingQueue';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';
import { matchesSearch } from '../lib/textSearch';
import { ExamCard } from './ExamCard';
import { ExamsSectionStats } from './ExamsSectionStats';
import { useExams } from './useExams';

const TITLE = 'Экзамены';
const EXPLANATION =
  'Экзамен собирается из вопросов — один вопрос можно поставить в несколько экзаменов.';
const EMPTY_MESSAGE = 'Экзаменов пока нет. Соберите первый из своих вопросов.';
const EMPTY_FILTERED_MESSAGE = 'С такими фильтрами экзаменов нет.';
const SEARCH_LABEL = 'Поиск по названию';
const EXAMS_PATH = '/exams';

const EMPTY_FILTERS: ExamListFilters = { status: '' };

export default function ExamsScreen() {
  const [filters, setFilters] = useState<ExamListFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const { exams, loading, error, reload } = useExams(filters);
  const gradingQueue = useGradingQueue();
  const gradingPresets = useGradingPresets();
  const itemStatsSummary = useExamItemStatsSummary();
  const imageStats = useExamImageStats();
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
        listStyle={oneCardListStyle}
        renderItem={(exam, index, all) => (
          <ExamCard
            key={exam.id}
            exam={exam}
            onSelect={() => void navigate(`${EXAMS_PATH}/${exam.id}`)}
            isLast={index === all.length - 1}
          />
        )}
      />

      <ExamsSectionStats
        queueCount={gradingQueue.attempts?.length ?? null}
        strugglingCount={itemStatsSummary.summary?.strugglingCount ?? null}
        imagesSummary={formatExamImagesSummary(imageStats.stats)}
        presetsCount={gradingPresets.presets?.length ?? null}
      />
    </section>
  );
}
