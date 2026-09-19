// Строка материала в библиотеке ученика (docs/PLAN.md §14, слой 3.2 у
// ученика; ADR-0047, ADR-0048). Список красит общая карточка
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
// Закрытый материал (ADR-0048): сегодня сервер всегда отдаёт `url` и
// никогда `locked` — рубильник платного доступа приезжает следующим PR.
// Контракт (`MyMaterialDto.locked?: true`) уже учтён, чтобы экран не
// переделывать второй раз.
import type { CSSProperties } from 'react';
import { MATERIAL_KIND_LABELS, type MyMaterialDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { textLinkStyle } from '../components/screenLayout';

const OPEN_LABEL = 'Открыть';
// VOICE.md: конкретика и действие — что случилось и что сделать дальше;
// текст ADR-0048 уже прошёл эту проверку.
const LOCKED_EXPLANATION =
  'Этот материал школа открывает после оплаты месяца. Напишите в чат школы — там подскажут, как оплатить.';

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

interface StudentMaterialCardProps {
  material: MyMaterialDto;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (LibraryScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function StudentMaterialCard({
  material,
  isLast = false,
}: StudentMaterialCardProps) {
  return (
    <li style={{ ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <div style={listCardTitleStyle}>{material.title}</div>
      <div style={listCardMetaStyle}>
        {/* Порядок — вид, занятия, теги (ADR-0058: рубрикация нужна прежде
            всего тому, кто ищет своё), тот же приём, что у MaterialCard.tsx. */}
        {[
          MATERIAL_KIND_LABELS[material.kind],
          ...material.classTitles,
          ...material.tags,
        ].join(' · ')}
      </div>
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
