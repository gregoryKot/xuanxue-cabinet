// «Материалы» — вторая секция экрана тега (ADR-0075): список материалов с
// этим тегом через тот же серверный фильтр и тот же хук, что у «Материалов»
// (useMaterials.ts, CLAUDE.md «Одна механика — один компонент») — второй
// запрос «материалы по тегу» не заводим.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClassDto } from '@xuanxue/shared';
import { MATERIALS_PATH } from '../api/apiPaths';
import { MaterialCard } from './MaterialCard';
import { TagSection } from './TagSection';
import { useMaterials } from './useMaterials';

const TITLE = 'Материалы';

interface TagMaterialsSectionProps {
  tag: string;
  /** Названия занятий по id — та же карта, что у TagLessonsSection.tsx, из
   * useClasses() на экране (MaterialsTagsScreen.tsx). */
  classes: ClassDto[];
}

export function TagMaterialsSection({ tag, classes }: TagMaterialsSectionProps) {
  const { materials, loading, error, reload } = useMaterials('', tag);
  const navigate = useNavigate();
  const classTitleById = useMemo(
    () => new Map(classes.map((cls) => [cls.id, cls.title])),
    [classes],
  );

  return (
    <TagSection
      title={TITLE}
      items={materials}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      emptyMessage={`Материалов с тегом «${tag}» пока нет.`}
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
  );
}
