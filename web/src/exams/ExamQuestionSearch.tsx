// Поиск вопроса — всегда на месте под списком выбранных (макет Form.dc.html,
// ADR-0040: слово «банк» — язык разработчика, экран называется «Вопросы»).
// Кнопки-переключателя «показать/скрыть список вопросов» больше нет: она
// занимала весь экран и прятала главное действие раздела. Уже добавленные
// вопросы отсюда исчезают, а не показываются неактивными — список и так
// короче. Не нашли нужный вопрос — рядом кнопка «Новый вопрос»
// (ExamQuestionsSection.tsx), не обязательно уходить в «Вопросы» и обратно.
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { EXAM_LIMITS, type ExamItemDto } from '@xuanxue/shared';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SearchField } from '../components/SearchField';
import { textLinkButtonStyle, textLinkStyle } from '../components/screenLayout';
import { formatExamItemMeta } from '../exam-items/examItemLabels';
import { filterQuestionCandidates } from './examQuestions';

const SEARCH_LABEL = 'Найти вопрос — по тексту или тегу';
// Список ещё грузится: он пуст независимо от того, есть ли вопросы, и это не
// повод заявлять «вопросов нет» (баг с прода — учитель завёл вопросы и не
// нашёл их здесь, CLAUDE.md «Загрузка»).
const LOADING_TEXT = 'Загружаем вопросы…';
const EMPTY_QUESTIONS_TEXT = 'Опубликованных вопросов пока нет';
const QUESTIONS_LINK_TEXT = 'Открыть вопросы';
const NO_MATCH_TEXT = 'По этому запросу ничего не нашлось.';
const ALL_CHOSEN_TEXT = 'Все вопросы уже в экзамене.';
const LIMIT_TEXT = `Больше ${EXAM_LIMITS.itemsPerBlockMax} вопросов в один экзамен не поместится.`;

const wrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--line)',
};
// Колонка формулировки в flex-строке: без `minWidth: 0` потомок не сжимается
// уже своего содержимого, и длинный вопрос раздвигал бы строку, а с ней и
// всю страницу редактора в горизонтальный скролл (CLAUDE.md «Мобильный
// экран первым»). `anywhere` — чтобы колонка могла стать уже самого длинного
// слова: глобальный `break-word` (index.css) рвёт строку, но min-content
// колонки не трогает.
const promptColumnStyle: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere' };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 };
const noteStyle: CSSProperties = { margin: 0, color: 'var(--ink-soft)' };

interface ExamQuestionSearchProps {
  bankItems: ExamItemDto[] | null;
  bankLoading: boolean;
  bankError: string | null;
  onRetryBank: () => void;
  chosenIds: string[];
  onAdd: (itemId: string) => void;
}

export function ExamQuestionSearch({
  bankItems,
  bankLoading,
  bankError,
  onRetryBank,
  chosenIds,
  onAdd,
}: ExamQuestionSearchProps) {
  const [query, setQuery] = useState('');
  const items = bankItems ?? [];
  const candidates = filterQuestionCandidates(items, query, chosenIds);
  const hasPublished = items.some((item) => item.status === 'published');
  const atLimit = chosenIds.length >= EXAM_LIMITS.itemsPerBlockMax;

  if (bankError) return <LoadErrorBanner message={bankError} onRetry={onRetryBank} />;

  return (
    <div style={wrapStyle}>
      <SearchField label={SEARCH_LABEL} value={query} onChange={setQuery} />

      {bankLoading && <p style={noteStyle}>{LOADING_TEXT}</p>}

      {!bankLoading && !hasPublished && (
        <p style={noteStyle}>
          {EMPTY_QUESTIONS_TEXT}.{' '}
          <Link to="/exam-items" style={textLinkStyle}>
            {QUESTIONS_LINK_TEXT}
          </Link>
        </p>
      )}

      {!bankLoading && hasPublished && atLimit && <p style={noteStyle}>{LIMIT_TEXT}</p>}

      {!bankLoading && hasPublished && !atLimit && candidates.length === 0 && (
        <p style={noteStyle}>{query.trim() ? NO_MATCH_TEXT : ALL_CHOSEN_TEXT}</p>
      )}

      {!atLimit && candidates.length > 0 && (
        <ul style={listStyle}>
          {candidates.map((item) => (
            <li key={item.id} style={rowStyle}>
              <div style={promptColumnStyle}>
                <div>{item.prompt}</div>
                <div style={metaStyle}>{formatExamItemMeta(item)}</div>
              </div>
              <button
                type="button"
                style={textLinkButtonStyle}
                onClick={() => onAdd(item.id)}
              >
                Добавить
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
