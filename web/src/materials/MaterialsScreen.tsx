// «Материалы» — то, чем учитель делится с учениками (docs/PLAN.md §14,
// ADR-0047, ADR-0055). Материалы школы открыты всем ученикам школы, кроме
// отмеченных «Только преподаватели» (ADR-0058, ADR-0096) — доступа по оплате
// не существует. Правка и создание — отдельная страница `/materials/new` и
// `/materials/:materialId` (MaterialEditorScreen.tsx, ADR-0033): отсюда
// только переход. Облик — тот же приём, что у
// ChannelsScreen.tsx/ExamItemsScreen.tsx: заголовок антиквой, строка списка
// вместо карточки, список — одна общая карточка (oneCardListStyle,
// docs/adr/0043).
//
// Фильтры — по виду и по тегу (ListFilters.tsx/MaterialTagFilter.tsx,
// ADR-0058), тег фильтрует на сервере (`GET /api/materials?tag=`): поиска нет
// — материалов у школы пока единицы (docs/PLAN.md §14, «Что нужно от
// владельца»), искать в списке из нескольких строк незачем.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, type MaterialKind } from '@xuanxue/shared';
import { MATERIALS_PATH } from '../api/apiPaths';
import { Button } from '../components/Button';
import { ListFilters } from '../components/ListFilters';
import { ListScreenBody } from '../components/ListScreenBody';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { oneCardListStyle } from '../components/listCardStyles';
import { primaryActionStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionLink } from '../components/SectionLink';
import { tagsScreenPath } from '../lib/tagsScreenPath';
import { useClasses } from '../schedule/useClasses';
import { MaterialCard } from './MaterialCard';
import { MaterialTagFilter } from './MaterialTagFilter';
import { useMaterials } from './useMaterials';
import { useMaterialTagOptions } from './useMaterialTagOptions';

const TITLE = 'Материалы';
const EXPLANATION =
  'Книги, статьи и видео, которыми вы делитесь с учениками. Ученик видит их у себя на экране.';
const EMPTY_MESSAGE =
  'Пока ни одного материала. Добавьте первый — ученики увидят его сразу.';
const EMPTY_FILTERED_MESSAGE = 'С таким фильтром материалов нет.';
// Вход в подэкран «Теги» (ADR-0075) — карточка-переход, тот же приём, что у
// «Библиотеки» на LessonsScreen.tsx (components/SectionLink.tsx). Заголовок
// совпадает с h1 экрана назначения (тот же приём, что «Библиотека» там же).
const TAGS_LINK_TITLE = 'Теги';
const TAGS_LINK_HINT = 'Один тег — все его даты занятий и материалы.';

export default function MaterialsScreen() {
  const [kind, setKind] = useState<MaterialKind | ''>('');
  const [tag, setTag] = useState('');
  const { materials, loading, error, reload } = useMaterials(kind, tag);
  const tagOptions = useMaterialTagOptions();
  const classesState = useClasses();
  const navigate = useNavigate();
  const isFiltered = kind !== '' || tag !== '';

  const classTitleById = useMemo(
    () => new Map((classesState.classes ?? []).map((cls) => [cls.id, cls.title])),
    [classesState.classes],
  );

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        action={
          !loading && (
            <Button
              style={primaryActionStyle}
              onClick={() => void navigate(`${MATERIALS_PATH}/new`)}
            >
              Новый материал
            </Button>
          )
        }
      />

      <ListFilters
        statuses={MATERIAL_KINDS}
        labels={MATERIAL_KIND_LABELS}
        value={kind}
        onChange={setKind}
      />

      {/* Набор пилюль — из полного списка школы (useMaterialTagOptions.ts),
          не из уже отфильтрованного ответа: иначе выбор одной пилюли сразу
          убирал бы соседние из-под пальца. */}
      <MaterialTagFilter tags={tagOptions} value={tag} onChange={setTag} />

      <ListScreenBody
        items={materials}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        emptyMessage={isFiltered ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}
        listStyle={oneCardListStyle}
        renderItem={(material, index, all) => (
          <MaterialCard
            key={material.id}
            material={material}
            classTitleById={classTitleById}
            onSelect={() => void navigate(`${MATERIALS_PATH}/${material.id}`)}
            isLast={index === all.length - 1}
          />
        )}
      />

      <SectionLink to={tagsScreenPath()} title={TAGS_LINK_TITLE} hint={TAGS_LINK_HINT} />

      {/* Названия занятий — рубрикация строки (ADR-0047), не обязательное
          условие списка: сбой /classes не должен прятать уже загруженные
          материалы, только предупреждать отдельной строкой (тот же приём,
          что у PlanningScreen.tsx с ошибкой классов). */}
      {classesState.error && (
        <LoadErrorBanner
          message={classesState.error}
          onRetry={() => void classesState.reload()}
        />
      )}
    </section>
  );
}
