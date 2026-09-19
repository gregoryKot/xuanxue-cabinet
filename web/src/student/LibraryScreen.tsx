// «Библиотека» — материалы школы глазами ученика (docs/PLAN.md §14, слой
// 3.2 у ученика, ADR-0047, ADR-0048, ADR-0058). Вход — карточка на
// LessonsScreen.tsx (SectionLink), не пункт меню (ADR-0025). Облик — тот же
// приём, что у ArchiveScreen.tsx: заголовок и объяснение шапкой
// (ScreenHeader), список одной карточкой (oneCardListStyle, docs/adr/0043) —
// ветвление ошибки/загрузки/пустоты/списка живёт в общем ListScreenBody.tsx
// (CLAUDE.md «Одна механика — один компонент»: свой инлайн-скелет этих
// четырёх состояний jscpd поймал как дубль ArchiveScreen.tsx).
//
// Фильтр по тегу — локальный (ADR-0058): один запрос `/me/materials`, весь
// список — одна страница, второй запрос ради фильтра не нужен (в отличие от
// «Библиотеки» учителя, materials/MaterialsScreen.tsx, где фильтр серверный).
import { useMemo, useState } from 'react';
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { collectUniqueTags } from '../lib/collectUniqueTags';
import { MaterialTagFilter } from '../materials/MaterialTagFilter';
import { filterMaterialsByTag } from './libraryTagFilter';
import { StudentMaterialCard } from './StudentMaterialCard';
import { useMyMaterials } from './useMyMaterials';

const TITLE = 'Библиотека';
const EXPLANATION =
  'Книги, статьи и видео, которыми делится школа. Открывается в новой вкладке.';
const EMPTY_MESSAGE = 'Библиотека пока пустая.';
const EMPTY_FILTERED_MESSAGE = 'С таким тегом в библиотеке ничего нет.';
// «Обновить» — та же подпись, что у соседнего экрана ученика
// (ArchiveScreen.tsx), не VOICE-умолчание LoadErrorBanner.
const RETRY_LABEL = 'Обновить';

export default function LibraryScreen() {
  const { data: materials, loading, error, reload } = useMyMaterials();
  const [tag, setTag] = useState('');

  // Набор пилюль — из полного списка (не из уже отфильтрованного): иначе
  // выбор тега сразу же убирал бы соседние пилюли из-под пальца (тот же
  // приём, что у useMaterialTagOptions.ts учителя).
  const tagOptions = useMemo(() => collectUniqueTags(materials ?? []), [materials]);
  const visibleMaterials = materials ? filterMaterialsByTag(materials, tag) : null;

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />
      <MaterialTagFilter tags={tagOptions} value={tag} onChange={setTag} />
      <ListScreenBody
        items={visibleMaterials}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        retryLabel={RETRY_LABEL}
        emptyMessage={tag ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}
        listStyle={oneCardListStyle}
        renderItem={(material, index, all) => (
          <StudentMaterialCard
            key={material.id}
            material={material}
            isLast={index === all.length - 1}
          />
        )}
      />
    </section>
  );
}
