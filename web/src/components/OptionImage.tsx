// Картинка варианта ответа (ADR-0035) — одна механика на весь кабинет
// (CLAUDE.md «Одна механика — один компонент»): редактор вопроса, экран
// сдачи, предпросмотр, карточка проверки и статистика показывают одну и ту
// же картинку по её адресу (`examImageSrc`), а не пишут `<img>` каждый сам.
// `loading="lazy"`/`decoding="async"` — картинок на экране может быть до
// десяти (вопрос с вариантами-картинками), декодирование не блокирует показ
// текста рядом. Адрес неизменяемый (браузер кеширует его сам, ADR-0035) —
// сброса кэша при замене картинки не нужно.
import type { CSSProperties } from 'react';
import { examImageSrc } from '../api/apiPaths';

// Не экспортирован: никто вне файла не ссылается на сам тип, только на
// строки 'thumb'/'full' при вызове компонента — второй именованный экспорт
// без потребителя уронил бы knip (CLAUDE.md «Храповики»).
type OptionImageSize = 'thumb' | 'full';

const MAX_HEIGHT_PX: Record<OptionImageSize, number> = { thumb: 96, full: 240 };

const baseStyle: CSSProperties = {
  display: 'block',
  maxWidth: '100%',
  height: 'auto',
  borderRadius: 3,
  border: '1px solid var(--line)',
  // Фото со стойкой/формой часто с прозрачным фоном (PNG) — белая подложка
  // не даёт ей слиться с --paper на светлой и тем более на тёмной схеме.
  background: '#fff',
};

interface OptionImageProps {
  imageId: string;
  /** Обязателен (CLAUDE.md «Доступность») — картинка несёт смысл варианта
   * ответа, не декоративна. */
  alt: string;
  size: OptionImageSize;
}

export function OptionImage({ imageId, alt, size }: OptionImageProps) {
  return (
    <img
      src={examImageSrc(imageId)}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={{ ...baseStyle, maxHeight: MAX_HEIGHT_PX[size] }}
    />
  );
}
