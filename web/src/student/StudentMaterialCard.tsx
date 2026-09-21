// Строка материала в библиотеке ученика (docs/PLAN.md §14, слой 3.2 у
// ученика; ADR-0047, ADR-0048, ADR-0068). Список красит общая карточка
// (oneCardListStyle, LibraryScreen.tsx), строка несёт только паддинг и
// волосяную линию снизу (проп `isLast`) — тот же приём, что у
// ArchivedLessonCard.tsx; заголовок и подпись вида — общие
// listCardTitleStyle/listCardMetaStyle (MaterialCard.tsx, CLAUDE.md «Одна
// механика — один компонент»).
//
// Занятия приезжают в DTO готовыми названиями (`classTitles`), а не id:
// `GET /classes` закрыт ролью (`ClassesController`), и звать его ученику —
// это 403 ради данных, которые всё равно нечем подписать. Названия
// подставляет сервер (MaterialsService.listForStudent), поэтому рубрикация
// из ADR-0047 видна и ученику, а не только учителю (MaterialCard.tsx).
// Материал без привязки — материал всей школы, подпись тогда одна: вид.
//
// Тег (ADR-0058) больше не хвост подписи, а действие (ADR-0068): пилюля под
// подписью ставит тот же фильтр библиотеки, что и пилюли над списком.
// Выбранный тег живёт на экране («tag» в LibraryScreen.tsx) — карточка сама
// его не хранит, второго источника правды нет. У архива (ArchivedLessonCard.tsx,
// ADR-0056) фильтра библиотеки нет — selectedTag/onSelectTag там не передаются
// вовсе (см. StudentMaterialCardTagProps), а не приходят с пустым обработчиком.
//
// Закрытый материал (ADR-0048): сегодня сервер всегда отдаёт `url` и
// никогда `locked` — рубильник платного доступа приезжает следующим PR.
// Контракт (`MyMaterialDto.locked?: true`) уже учтён, чтобы экран не
// переделывать второй раз.
import type { CSSProperties } from 'react';
import { MATERIAL_KIND_LABELS, type MyMaterialDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { PILL_CLASS, pillActiveStyle, pillStyle } from '../components/pillStyles';
import { StudentMaterialCardActions } from './StudentMaterialCardActions';

const TAGS_GROUP_LABEL = 'Теги материала';

const rowStyle: CSSProperties = { padding: '16px 20px' };
// Компактный вариант (проп `compact`) — материал внутри карточки занятия
// архива уже стоит на паддинге строки занятия (lessonRowStyle), свой боковой
// паддинг там даёт двойной отступ и чужеродную рамку.
const compactRowStyle: CSSProperties = { padding: '10px 0' };
// Перенос пилюль на экране 360px (CLAUDE.md «Мобильный экран первым») — у
// материала бывает несколько тегов, в одну строку они не поместятся.
const tagsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 4,
};

interface StudentMaterialCardBaseProps {
  material: MyMaterialDto;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (LibraryScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
  /** Материал внутри карточки занятия архива (ArchivedLessonCard.tsx,
   * ADR-0056) — не своя строка списка библиотеки: боковые паддинги там
   * лишние, отступ уже даёт сама строка занятия. */
  compact?: boolean;
}

/** Тег — действие фильтра библиотеки (ADR-0068), а не подпись сама по себе:
 * без `onSelectTag` ставить его было бы некуда. Поэтому оба пропса — пара, не
 * два независимых необязательных поля (LibraryScreen.tsx передаёт оба,
 * ArchivedLessonCard.tsx — ни одного). */
type StudentMaterialCardTagProps =
  | { selectedTag: string; onSelectTag: (tag: string) => void }
  | { selectedTag?: undefined; onSelectTag?: undefined };

type StudentMaterialCardProps = StudentMaterialCardBaseProps &
  StudentMaterialCardTagProps;

export function StudentMaterialCard({
  material,
  selectedTag,
  onSelectTag,
  isLast = false,
  compact = false,
}: StudentMaterialCardProps) {
  return (
    <li
      style={{
        ...(compact ? compactRowStyle : rowStyle),
        borderBottom: isLast ? 'none' : '1px solid var(--panel)',
      }}
    >
      <div style={listCardTitleStyle}>{material.title}</div>
      <div style={listCardMetaStyle}>
        {/* Порядок — вид, занятия (тот же приём, что у MaterialCard.tsx);
            тег ушёл из подписи в свою строку ниже — там он действие, а не
            текст (ADR-0068). */}
        {[MATERIAL_KIND_LABELS[material.kind], ...material.classTitles].join(' · ')}
      </div>
      {/* Без onSelectTag (карточка занятия архива) фильтра библиотеки нет —
          неактивная пилюля была бы мёртвой кнопкой (CLAUDE.md), строку не
          рисуем вовсе. */}
      {material.tags.length > 0 && onSelectTag && (
        <div style={tagsRowStyle} role="group" aria-label={TAGS_GROUP_LABEL}>
          {material.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={PILL_CLASS}
              style={
                tag === selectedTag ? { ...pillStyle, ...pillActiveStyle } : pillStyle
              }
              aria-pressed={tag === selectedTag}
              onClick={() => onSelectTag(tag === selectedTag ? '' : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <StudentMaterialCardActions material={material} />
    </li>
  );
}
