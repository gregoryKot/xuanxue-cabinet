// Пилюли фильтра по тегу — общая обвязка над ListFilters.tsx для «Материалов»
// учителя (MaterialsScreen.tsx, серверный фильтр `tag=`) и ученика
// (LibraryScreen.tsx, локальный фильтр по уже загруженному списку): подписи
// пилюль — сам тег («старшая» → «старшая», справочника тегов нет, ADR-0058),
// группе — свой aria-label, не «Статус» по умолчанию. Один компонент на два
// экрана — иначе оба повторили бы один и тот же Object.fromEntries
// (CLAUDE.md «Одна механика — один компонент», jscpd).
//
// Тегов нет вовсе — компонент ничего не рисует: пустая строка фильтров хуже
// её отсутствия, у ученика особенно (LibraryScreen.tsx).
import { ListFilters } from '../components/ListFilters';

const GROUP_LABEL = 'Теги';

interface MaterialTagFilterProps {
  tags: readonly string[];
  value: string;
  onChange: (tag: string) => void;
}

export function MaterialTagFilter({ tags, value, onChange }: MaterialTagFilterProps) {
  if (tags.length === 0) return null;

  const labels = Object.fromEntries(tags.map((tag) => [tag, tag]));
  return (
    <ListFilters
      statuses={tags}
      labels={labels}
      value={value}
      onChange={onChange}
      groupLabel={GROUP_LABEL}
    />
  );
}
