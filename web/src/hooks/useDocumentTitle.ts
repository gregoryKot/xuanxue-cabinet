// Название вкладки по странице. У всех экранов один <title> из index.html
// («Сюань-Сюэ»), и человек со скринридером слышит его на каждой странице
// одинаково — WCAG 2.4.2 (уровень A) требует, чтобы название говорило, о чём
// страница. Хук ставит «<страница> — Сюань-Сюэ» и при уходе возвращает то, что
// было: переход на экран без своего названия не оставит чужое.
import { useEffect } from 'react';

// Держать в согласии с <title> в web/index.html.
const SITE_NAME = 'Сюань-Сюэ';

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — ${SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
