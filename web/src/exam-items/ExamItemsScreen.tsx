// Экран «Вопросы для экзамена» — банк вопросов, из которых собираются
// экзамены (docs/PLAN.md §11, ТЗ 4.2). Один вопрос можно поставить в
// несколько экзаменов — сам конструктор экзамена (какие вопросы в какой
// экзамен) не входит сюда, это следующий слой (4.3).
import { useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  primaryActionStyle,
  screenExplanationStyle,
  screenSectionStyle,
} from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { ExamItemCard } from './ExamItemCard';
import { ExamItemFilters, type ExamItemFilterValues } from './ExamItemFilters';
import { ExamItemSheet } from './ExamItemSheet';
import { useExamItems } from './useExamItems';

const EXPLANATION =
  'Из этих вопросов собирается экзамен — один вопрос можно поставить в несколько экзаменов.';
const EMPTY_MESSAGE = 'Вопросов пока нет. Добавьте первый — из них соберётся экзамен.';
const EMPTY_FILTERED_MESSAGE = 'С такими фильтрами вопросов нет.';

const EMPTY_FILTERS: ExamItemFilterValues = { status: '', kind: '', tag: '' };

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

export default function ExamItemsScreen() {
  const [filters, setFilters] = useState<ExamItemFilterValues>(EMPTY_FILTERS);
  const { items, loading, error, reload, create, update, remove } = useExamItems(filters);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetItemId, setSheetItemId] = useState<string | null>(null);

  const selectedItem = items?.find((item) => item.id === sheetItemId) ?? null;
  const isFiltered = filters.status !== '' || filters.kind !== '' || filters.tag !== '';

  function openCreate() {
    setSheetItemId(null);
    setSheetOpen(true);
  }

  function openEdit(id: string) {
    setSheetItemId(id);
    setSheetOpen(true);
  }

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {!loading && (
        <Button style={primaryActionStyle} onClick={openCreate}>
          Новый вопрос
        </Button>
      )}

      <ExamItemFilters values={filters} onChange={setFilters} />

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonList rows={5} h={72} />}

      {!loading && !error && items?.length === 0 && (
        <p style={{ margin: 0 }}>{isFiltered ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && items && items.length > 0 && (
        <ul style={listStyle}>
          {items.map((item) => (
            <ExamItemCard key={item.id} item={item} onSelect={() => openEdit(item.id)} />
          ))}
        </ul>
      )}

      {sheetOpen && (
        <ExamItemSheet
          item={selectedItem}
          onClose={() => setSheetOpen(false)}
          onCreate={create}
          onUpdate={update}
          onRemove={remove}
        />
      )}
    </section>
  );
}
