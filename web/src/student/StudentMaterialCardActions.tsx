// Действия строки материала ученика — «Открыть» (ссылка) и «Скачать файл»
// (ADR-0057, слой 3.10). Материалов, закрытых от ученика, не бывает —
// доступа по оплате нет (ADR-0096, отменяет ADR-0048); единственный
// закрытый уровень, «только преподаватели», ученику не приходит вовсе.
// Вынесено из StudentMaterialCard.tsx (CLAUDE.md «Компонент React больше
// 150 — выноси хуки и подкомпоненты»).
import type { CSSProperties } from 'react';
import type { MyMaterialDto } from '@xuanxue/shared';
import { materialFilePath } from '../api/apiPaths';
import { textLinkHitAreaStyle, textLinkLineStyle } from '../components/screenLayout';
import { VideoEmbed } from '../components/VideoEmbed';

const OPEN_LABEL = 'Открыть';
// У материала бывает и ссылка, и свой файл — второе действие рядом с
// «Открыть», не вместо него.
const DOWNLOAD_FILE_LABEL = 'Скачать файл';

const actionRowStyle: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
};
// Цель нажатия 44 — оболочка textLinkHitAreaStyle, линию под буквами несёт
// внутренний span с textLinkLineStyle (см. JSX ниже): тот же приём, что у
// recordingLinkStyle в ArchivedLessonCard.tsx. Здесь две такие ссылки стоят
// в одном ряду («Открыть» и «Скачать файл») — раньше их линии рисовались по
// дну общей коробки 44px и тянулись одной полосой под обеими сразу.
const openLinkStyle: CSSProperties = textLinkHitAreaStyle;

interface StudentMaterialCardActionsProps {
  material: MyMaterialDto;
}

export function StudentMaterialCardActions({
  material,
}: StudentMaterialCardActionsProps) {
  return (
    <>
      <div style={actionRowStyle}>
        {material.url && (
          <a href={material.url} target="_blank" rel="noreferrer" style={openLinkStyle}>
            <span style={textLinkLineStyle}>{OPEN_LABEL}</span>
          </a>
        )}
        {material.file && (
          // Обычная ссылка, не apiFetch: сервер отвечает 302 на подписанный
          // адрес в другом домене, а `connectSrc: 'self'` в CSP
          // (api/src/security/csp.ts) оборвал бы такой редирект у fetch —
          // навигация по <a href> под CSP не ограничена, не «чинить» на apiFetch.
          <a href={`/api${materialFilePath(material.id)}`} style={openLinkStyle}>
            <span style={textLinkLineStyle}>{DOWNLOAD_FILE_LABEL}</span>
          </a>
        )}
      </div>
      {/* Материал вида «видео» — смотреть, не уходя из библиотеки (ADR-0100).
          Вид тут не проверяем: решает сам адрес, и статья со ссылкой на
          YouTube получит плеер так же законно, как видео. Не встраивается —
          компонент не рендерит ничего, остаётся ссылка «Открыть». */}
      {material.url && <VideoEmbed url={material.url} title={material.title} />}
    </>
  );
}
