// Экран тега — общая выдача по школе (ADR-0075/0078), подэкран «Материалов»
// (ADR-0055: пятый пункт меню не заводится, это вложенный маршрут
// /materials/tags, не шестой пункт навигации). Список тегов школы виден
// всегда; выбрал тег — увидел его даты занятий и материалы (две секции
// ниже, TagLessonsSection.tsx/TagMaterialsSection.tsx).
//
// Тег — query-параметр (?tag=), не сегмент пути: тег — свободный текст и
// может содержать «/» (ADR-0078 «Контекст», docs/adr/0075). `key={tag}` на
// секциях — новый тег значит новый экземпляр компонента и свежий запрос
// через обычное монтирование, без ручной синхронизации reload по смене
// фильтра на месте.
import { useSearchParams } from 'react-router-dom';
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { useClasses } from '../schedule/useClasses';
import { TagLessonsSection } from './TagLessonsSection';
import { TagMaterialsSection } from './TagMaterialsSection';
import { TagSummaryRow } from './TagSummaryRow';
import { useTagsSummary } from './useTagsSummary';

const TITLE = 'Теги';
const EXPLANATION =
  'Тег ставится на дате занятия или в материале. Выберите тег — увидите все его даты и материалы.';
const EMPTY_MESSAGE =
  'У школы пока нет тегов. Поставьте тег на дате занятия или в материале — он появится в этом списке.';
const TAG_QUERY_KEY = 'tag';

export default function MaterialsTagsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tag = searchParams.get(TAG_QUERY_KEY) ?? '';
  const tagsState = useTagsSummary();
  const classesState = useClasses();

  function selectTag(nextTag: string) {
    setSearchParams(nextTag ? { [TAG_QUERY_KEY]: nextTag } : {});
  }

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      <ListScreenBody
        items={tagsState.tags}
        loading={tagsState.loading}
        error={tagsState.error}
        onRetry={() => void tagsState.reload()}
        emptyMessage={EMPTY_MESSAGE}
        listStyle={oneCardListStyle}
        renderItem={(summary, index, all) => (
          <TagSummaryRow
            key={summary.tag}
            summary={summary}
            selected={summary.tag === tag}
            onSelect={() => selectTag(summary.tag)}
            isLast={index === all.length - 1}
          />
        )}
      />

      {tag && (
        <>
          <TagLessonsSection
            key={`lessons-${tag}`}
            tag={tag}
            classes={classesState.classes ?? []}
          />
          <TagMaterialsSection
            key={`materials-${tag}`}
            tag={tag}
            classes={classesState.classes ?? []}
          />
        </>
      )}

      {/* Названия занятий — рубрикация строк лессонов/материалов, не
          обязательное условие экрана: сбой /classes не должен прятать уже
          выбранный тег, только предупреждать отдельной строкой (тот же
          приём, что у MaterialsScreen.tsx/PlanningScreen.tsx). */}
      {classesState.error && (
        <LoadErrorBanner
          message={classesState.error}
          onRetry={() => void classesState.reload()}
        />
      )}
    </section>
  );
}
