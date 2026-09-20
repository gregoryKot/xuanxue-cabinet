// «Из библиотеки» — поиск по уже заведённым материалам и привязка одним
// нажатием (ADR-0056). Раскрывается на месте, в секции «Материалы» страницы
// даты занятия; образец устройства — поиск вопроса в редакторе экзамена
// (exams/ExamQuestionSearch.tsx): поле поиска, список кандидатов, у каждого
// одно действие.
//
// Список библиотеки читается общим хуком (materials/useMaterials.ts) без
// фильтров по виду и тегу — ищут здесь по строке поиска, а не пилюлями.
// Уже привязанные материалы из списка исчезают, а не показываются
// неактивными: их видно выше, в самой секции.
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { MaterialDto } from '@xuanxue/shared';
import { MATERIALS_PATH } from '../api/apiPaths';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SearchField } from '../components/SearchField';
import {
  noteStyle,
  textLinkButtonStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { useMaterials } from '../materials/useMaterials';
import { filterLibraryCandidates } from './lessonMaterials';
import { LessonMaterialRow } from './LessonMaterialRow';

const SEARCH_LABEL = 'Найти материал — по названию или тегу';
// Список ещё грузится: он пуст независимо от того, есть ли материалы, и это
// не повод заявлять «библиотека пуста» (тот же баг ловили у вопросов
// экзамена, ExamQuestionSearch.tsx).
const LOADING_TEXT = 'Загружаем материалы…';
const EMPTY_LIBRARY_TEXT = 'В библиотеке пока пусто';
const LIBRARY_LINK_TEXT = 'Открыть материалы';
const NO_MATCH_TEXT = 'По этому запросу ничего не нашлось.';
const ALL_ATTACHED_TEXT = 'Вся библиотека уже на этом занятии.';
const ADD_LABEL = 'Добавить';
const CLOSE_LABEL = 'Закрыть';

const wrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };

interface LessonMaterialPickerProps {
  /** Уже привязанные к этой дате — их в кандидатах быть не должно. */
  attached: MaterialDto[];
  onAttach: (material: MaterialDto) => void;
  onClose: () => void;
}

export function LessonMaterialPicker({
  attached,
  onAttach,
  onClose,
}: LessonMaterialPickerProps) {
  const [query, setQuery] = useState('');
  const { materials, loading, error, reload } = useMaterials('', '');
  const library = materials ?? [];
  const candidates = filterLibraryCandidates(
    library,
    query,
    attached.map((material) => material.id),
  );

  if (error) return <LoadErrorBanner message={error} onRetry={() => void reload()} />;

  return (
    <div style={wrapStyle}>
      <SearchField label={SEARCH_LABEL} value={query} onChange={setQuery} />

      {loading && <p style={noteStyle}>{LOADING_TEXT}</p>}

      {!loading && library.length === 0 && (
        <p style={noteStyle}>
          {EMPTY_LIBRARY_TEXT}.{' '}
          <Link to={MATERIALS_PATH} style={textLinkStyle}>
            {LIBRARY_LINK_TEXT}
          </Link>
        </p>
      )}

      {!loading && library.length > 0 && candidates.length === 0 && (
        <p style={noteStyle}>{query.trim() ? NO_MATCH_TEXT : ALL_ATTACHED_TEXT}</p>
      )}

      {candidates.length > 0 && (
        <ul style={listStyle}>
          {candidates.map((material) => (
            <LessonMaterialRow
              key={material.id}
              material={material}
              actionLabel={ADD_LABEL}
              onAction={() => onAttach(material)}
            />
          ))}
        </ul>
      )}

      <button type="button" style={textLinkButtonStyle} onClick={onClose}>
        {CLOSE_LABEL}
      </button>
    </div>
  );
}
