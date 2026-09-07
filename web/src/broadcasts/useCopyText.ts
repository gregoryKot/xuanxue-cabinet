// «Скопировать» текст ручной доставки (docs/PLAN.md §6 п.5) —
// `navigator.clipboard` работает не везде (http без TLS, старый WebView в
// Telegram) — резерв через выделение в скрытом textarea и `execCommand('copy')`.
// `execCommand` тоже может не сработать (браузер без разрешения, страница вне
// фокуса) — тогда честная ошибка вместо тихого «ничего не произошло»
// (pr-k3-fixes.md п.12). Таймер сброса — в `useRef`, снимается в `useEffect`
// при размонтировании: без этого таймер после ухода с экрана падает на
// setState развёрнутого компонента.
import { useEffect, useRef, useState } from 'react';

const RESET_DELAY_MS = 2000;
const COPY_FAILED_MESSAGE =
  'Не удалось скопировать — выделите текст и скопируйте вручную.';

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

export interface UseCopyTextResult {
  copied: boolean;
  error: string | null;
  copy: (text: string) => Promise<void>;
}

export function useCopyText(): UseCopyTextResult {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function copy(text: string): Promise<void> {
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = fallbackCopy(text);
    }

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (!ok) {
      setCopied(false);
      setError(COPY_FAILED_MESSAGE);
      return;
    }
    setError(null);
    setCopied(true);
    timerRef.current = window.setTimeout(() => setCopied(false), RESET_DELAY_MS);
  }

  return { copied, error, copy };
}
