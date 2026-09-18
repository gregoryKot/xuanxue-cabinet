// «Библиотека» — материалы, которыми учитель делится с учениками
// (docs/PLAN.md §14, ADR-0047, ADR-0048). Правка и создание — отдельная
// страница `/materials/new` и `/materials/:materialId`
// (MaterialEditorScreen.tsx, ADR-0033): отсюда только переход. Облик — тот
// же приём, что у ChannelsScreen.tsx/ExamItemsScreen.tsx: заголовок
// антиквой, строка списка вместо карточки, список — одна общая карточка
// (oneCardListStyle, docs/adr/0043).
//
// Фильтр — только по виду (ListFilters.tsx, общий с «Вопросами» и
// «Рассылками»): поиска нет — материалов у школы пока единицы (docs/PLAN.md
// §14, «Что нужно от владельца»), искать в списке из нескольких строк незачем.
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
import { useClasses } from '../schedule/useClasses';
import { MaterialCard } from './MaterialCard';
import { MaterialsPaidAccessSection } from './MaterialsPaidAccessSection';
import { useMaterials } from './useMaterials';

const TITLE = 'Библиотека';
const EXPLANATION =
  'Книги, статьи и видео, которыми вы делитесь с учениками. Ученик видит их у себя на экране.';
const EMPTY_MESSAGE =
  'Пока ни одного материала. Добавьте первый — ученики увидят его сразу.';
const EMPTY_FILTERED_MESSAGE = 'С таким фильтром материалов нет.';

export default function MaterialsScreen() {
  const [kind, setKind] = useState<MaterialKind | ''>('');
  const { materials, loading, error, reload } = useMaterials(kind);
  const classesState = useClasses();
  const navigate = useNavigate();

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

      {/* Число из уже загруженного списка (без нового запроса) — только на
          весь список без фильтра по виду: отфильтрованный список не
          отражал бы всю библиотеку, и число обмануло бы учителя насчёт
          того, что именно закроет рубильник. */}
      <MaterialsPaidAccessSection
        paidCount={
          kind === '' && materials
            ? materials.filter((m) => m.access === 'paid').length
            : null
        }
      />

      <ListFilters
        statuses={MATERIAL_KINDS}
        labels={MATERIAL_KIND_LABELS}
        value={kind}
        onChange={setKind}
      />

      <ListScreenBody
        items={materials}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        emptyMessage={kind ? EMPTY_FILTERED_MESSAGE : EMPTY_MESSAGE}
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
