// Фасад встроенного плеера записи (PLAN.md §«Запись открывается ссылкой
// наружу, плеера на странице нет»). Главное свойство компонента — до нажатия
// на кнопку наружу не уходит ни одного запроса: картинки-превью с хостинга
// нет намеренно (YouTube/Rutube отдали бы её со своего домена ещё до того,
// как ученик решил смотреть), вместо неё своя заглушка и кнопка. `iframe` с
// внешним доменом появляется в разметке только по нажатию.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { videoEmbedUrl } from '@xuanxue/shared';
import { Button } from './Button';

const frameStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  aspectRatio: '16 / 9',
  border: 'none',
  borderRadius: 'var(--radius-card)',
};

const WATCH_LABEL = 'Смотреть здесь';
// Доступное имя фрейма — про содержимое, а не про кнопку: скринридер читает
// его как «запись, фрейм», и «Смотреть здесь, фрейм» там звучало бы как
// второе действие (CLAUDE.md «Доступность»).
const FRAME_TITLE = 'Запись видео';

export function VideoEmbed({ url, title }: { url: string; title?: string }) {
  const [opened, setOpened] = useState(false);
  const embedUrl = videoEmbedUrl(url);

  // Хостинг не встраивается (ВКонтакте без oid/id/hash, Яндекс.Диск) —
  // рендерим null целиком: у вызывающего экрана остаётся своя обычная
  // ссылка, пустой рамки плеера здесь быть не должно.
  if (!embedUrl) {
    return null;
  }

  // До нажатия — только кнопка, без серого прямоугольника 16:9 на её месте:
  // показывать нечего (превью с хостинга мы не грузим намеренно), а пустая
  // коробка в списке материалов или записей растит каждую строку на экран
  // высотой ни за чем.
  if (!opened) {
    return (
      <Button variant="secondary" onClick={() => setOpened(true)}>
        {WATCH_LABEL}
      </Button>
    );
  }

  return (
    <iframe
      src={embedUrl}
      title={title ?? FRAME_TITLE}
      style={frameStyle}
      // Без Referer плеер не стартует: страницы кабинета отдаются с
      // `Referrer-Policy: no-referrer` (умолчание helmet, app.setup.ts), и
      // YouTube, не узнав, кто его встроил, рисует вместо записи «Video player
      // configuration error, Error 153» — так оно и вышло у учителя 2026-09-21
      // на первой же записи. Атрибут перебивает политику документа ровно для
      // этого фрейма и отдаёт только origin, без пути: хостингу достаточно
      // домена, а всем остальным ссылкам кабинета no-referrer остаётся.
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
