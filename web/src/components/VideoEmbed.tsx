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

const placeholderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  aspectRatio: '16 / 9',
  background: 'var(--panel)',
  borderRadius: 'var(--radius-card)',
};

const frameStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  aspectRatio: '16 / 9',
  border: 'none',
  borderRadius: 'var(--radius-card)',
};

const WATCH_LABEL = 'Смотреть здесь';

export function VideoEmbed({ url, title }: { url: string; title?: string }) {
  const [opened, setOpened] = useState(false);
  const embedUrl = videoEmbedUrl(url);

  // Хостинг не встраивается (ВКонтакте без oid/id/hash, Яндекс.Диск) —
  // рендерим null целиком: у вызывающего экрана остаётся своя обычная
  // ссылка, пустой рамки плеера здесь быть не должно.
  if (!embedUrl) {
    return null;
  }

  if (!opened) {
    return (
      <div style={placeholderStyle}>
        <Button variant="secondary" onClick={() => setOpened(true)}>
          {WATCH_LABEL}
        </Button>
      </div>
    );
  }

  return (
    <iframe
      src={embedUrl}
      title={title ?? WATCH_LABEL}
      style={frameStyle}
      allowFullScreen
    />
  );
}
