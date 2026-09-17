// Экран «Вопросы» — банк, из которого собираются экзамены (docs/PLAN.md §4.2).
// Один вопрос можно поставить в несколько экзаменов. Правка и создание —
// отдельная страница `/exam-items/new` и `/exam-items/:itemId`
// (ExamItemEditorScreen.tsx, ADR-0033): отсюда только переход. Облик —
// направление «тихо и благородно» (docs/adr/0031), макет Main.dc.html:
// заголовок антиквой, переключатели статуса вместо select, строка списка
// вместо карточки.
//
// Тип вопроса фильтром не стоит: он виден в служебной строке каждой строки
// списка, а поиск по формулировке и тегу закрывает нужный случай («все
// вопросы про дыхание») лучше, чем ещё один ряд переключателей на 360 px.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXAM_ITEM_STATUSES, type ExamItemStatus } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ListFilters } from '../components/ListFilters';
import { ListScreenBody } from '../components/ListScreenBody';
import { primaryActionStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { matchesSearch } from '../lib/textSearch';
import { ExamItemCard } from './ExamItemCard';
import { EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';
import { useExamItems } from './useExamItems';

const TITLE = 'Вопросы';
const EXPLANATION =
  'Из этих вопросов собирается экзамен — один вопрос можно поставить в несколько экзаменов.';
const EMPTY_MESSAGE = 'Вопросов пока нет. Добавьте первый — из них соберётся экзамен.';
const EMPTY_FILTERED_MESSAGE = 'С такими фильтрами вопросов нет.';
const SEARCH_LABEL = 'Поиск по вопросу и тегу';
const ITEMS_PATH = '/exam-items';

export default function ExamItemsScreen() {
  const [status, setStatus] = useState<ExamItemStatus | ''>('');
  const [search, setSearch] = useState('');
  const { items, loading, error, reload } = useExamItems(status);
  const navigate = useNavigate();

  const visibleItems =
    items?.filter((item) => matchesSearch([item.prompt, ...item.tags], search)) ?? null;
  const isFiltered = status !== '' || search.trim() !== '';

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        action={
          !loading && (
            <Button
              style={primaryActionStyle}
              onClick={() => void navigate(`${ITEMS_PATH}/new`)}
            >
              Новый вопрос
            </Button>
          )
        }
      />

      <ListFilters
        statuses={EXAM_ITEM_STATUSES}
        labels={EXAM_ITEM_STATUS_LABELS_RU}
        value={status}
        onChange={setStatus}
        search={{ label: SEARCH_LABEL, value: search, onChange: setSearch }}
      />

      <ListScreenBody
        items={visibleItems}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        emptyMessage={isFiltered ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}
        renderItem={(item) => (
          <ExamItemCard
            key={item.id}
            item={item}
            onSelect={() => void navigate(`${ITEMS_PATH}/${item.id}`)}
          />
        )}
      />
    </section>
  );
}
