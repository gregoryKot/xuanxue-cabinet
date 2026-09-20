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
// его не хранит, второго источника правды нет.
//
// Закрытый материал (ADR-0048): сегодня сервер всегда отдаёт `url` и
// никогда `locked` — рубильник платного доступа приезжает следующим PR.
// Контракт (`MyMaterialDto.locked?: true`) уже учтён, чтобы экран не
// переделывать второй раз.
import type { CSSProperties } from 'react';
import { MATERIAL_KIND_LABELS, type MyMaterialDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { pillActiveStyle, pillStyle } from '../components/pillStyles';
import { textLinkStyle } from '../components/screenLayout';

const OPEN_LABEL = 'Открыть';
// VOICE.md: конкретика и действие — что случилось и что сделать дальше;
// текст ADR-0048 уже прошёл эту проверку.
const LOCKED_EXPLANATION =
  'Этот материал школа открывает после оплаты месяца. Напишите в чат школы — там подскажут, как оплатить.';
const TAGS_GROUP_LABEL = 'Теги материала';

const rowStyle: CSSProperties = { padding: '16px 20px' };
const actionRowStyle: CSSProperties = { marginTop: 8 };
const lockedTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
// Цель нажатия ≥44 по высоте (CLAUDE.md «Доступность») — тот же приём, что у
// recordingLinkStyle в ArchivedLessonCard.tsx.
const openLinkStyle: CSSProperties = {
  ...textLinkStyle,
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
};
// Перенос пилюль на экране 360px (CLAUDE.md «Мобильный экран первым») — у
// материала бывает несколько тегов, в одну строку они не поместятся.
const tagsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 4,
};

interface StudentMaterialCardProps {
  material: MyMaterialDto;
  /** Выбранный тег фильтра библиотеки (ADR-0068) — тот же `tag`, что у
   * пилюль над списком (LibraryScreen.tsx). Пустая строка — «Все». */
  selectedTag: string;
  /** Ставит тег фильтром библиотеки; повторное нажатие по уже выбранному
   * тегу снимает его (пустая строка) — приём из ListFilters.tsx. */
  onSelectTag: (tag: string) => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (LibraryScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function StudentMaterialCard({
  material,
  selectedTag,
  onSelectTag,
  isLast = false,
}: StudentMaterialCardProps) {
  return (
    <li style={{ ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <div style={listCardTitleStyle}>{material.title}</div>
      <div style={listCardMetaStyle}>
        {/* Порядок — вид, занятия (тот же приём, что у MaterialCard.tsx);
            тег ушёл из подписи в свою строку ниже — там он действие, а не
            текст (ADR-0068). */}
        {[MATERIAL_KIND_LABELS[material.kind], ...material.classTitles].join(' · ')}
      </div>
      {material.tags.length > 0 && (
        <div style={tagsRowStyle} role="group" aria-label={TAGS_GROUP_LABEL}>
          {material.tags.map((tag) => (
            <button
              key={tag}
              type="button"
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
      <div style={actionRowStyle}>
        {material.locked ? (
          <p style={lockedTextStyle}>{LOCKED_EXPLANATION}</p>
        ) : (
          material.url && (
            <a href={material.url} target="_blank" rel="noreferrer" style={openLinkStyle}>
              {OPEN_LABEL}
            </a>
          )
        )}
      </div>
    </li>
  );
}
