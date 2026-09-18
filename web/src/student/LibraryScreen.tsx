// «Библиотека» — материалы школы глазами ученика (docs/PLAN.md §14, слой
// 3.2 у ученика, ADR-0047, ADR-0048). Вход — карточка на LessonsScreen.tsx
// (SectionLink), не пункт меню (ADR-0025). Облик — тот же приём, что у
// ArchiveScreen.tsx: заголовок и объяснение шапкой (ScreenHeader), список
// одной карточкой (oneCardListStyle, docs/adr/0043) — ветвление ошибки/
// загрузки/пустоты/списка живёт в общем ListScreenBody.tsx (CLAUDE.md «Одна
// механика — один компонент»: свой инлайн-скелет этих четырёх состояний
// jscpd поймал как дубль ArchiveScreen.tsx).
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { StudentMaterialCard } from './StudentMaterialCard';
import { useMyMaterials } from './useMyMaterials';

const TITLE = 'Библиотека';
const EXPLANATION =
  'Книги, статьи и видео, которыми делится школа. Открывается в новой вкладке.';
const EMPTY_MESSAGE = 'Библиотека пока пустая.';
// «Обновить» — та же подпись, что у соседнего экрана ученика
// (ArchiveScreen.tsx), не VOICE-умолчание LoadErrorBanner.
const RETRY_LABEL = 'Обновить';

export default function LibraryScreen() {
  const { data: materials, loading, error, reload } = useMyMaterials();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />
      <ListScreenBody
        items={materials}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        retryLabel={RETRY_LABEL}
        emptyMessage={EMPTY_MESSAGE}
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
