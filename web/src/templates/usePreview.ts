// Предпросмотр шаблона на реальном занятии (docs/PLAN.md §6 «Шаблоны») —
// POST /settings/preview рендерит СОХРАНЁННЫЙ шаблон, не то, что напечатано
// в форме и ещё не сохранено (TemplateEditor.tsx предупреждает об этом сам).
//
// requestId + AbortController — тем же приёмом, что hooks/useAbortableFetch.ts
// (аудит 2026-09-21, MED). Сам хук здесь не переиспользован: его `load`
// фиксирован на монтировании и сам уходит в эффект при первом рендере, а
// preview(kind, lessonId) зовут вручную с разными аргументами — быстрое
// переключение занятия в select (TemplatePreviewSection.tsx) вызывает его
// снова и снова, и без сверки id поздний ответ на СТАРОЕ занятие (второй POST
// ответил раньше первого) переписал бы уже показанный результат нового.
import { useRef, useState } from 'react';
import type { PreviewTemplateResult, TemplateKind } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';

const PREVIEW_ERROR = 'Не удалось показать предпросмотр. Попробуйте ещё раз.';

export interface UsePreviewResult {
  pending: boolean;
  result: PreviewTemplateResult | null;
  error: string | null;
  preview: (kind: TemplateKind, lessonId: string) => Promise<void>;
}

export function usePreview(): UsePreviewResult {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PreviewTemplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  async function preview(kind: TemplateKind, lessonId: string): Promise<void> {
    // Новый вызов обрывает предыдущий в полёте (signal) — иначе оба запроса
    // долетают, и порядок ответов сервера решает, что останется на экране.
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const thisRequest = (requestId.current += 1);

    setPending(true);
    setError(null);
    try {
      const res = await apiFetch<PreviewTemplateResult>('/settings/preview', {
        method: 'POST',
        body: { kind, lessonId },
        signal: controller.signal,
      });
      if (requestId.current !== thisRequest) return; // обогнал более новый вызов
      setResult(res);
    } catch (err) {
      if (requestId.current !== thisRequest) return;
      setResult(null);
      setError(err instanceof ApiError ? err.message : PREVIEW_ERROR);
    } finally {
      if (requestId.current === thisRequest) setPending(false);
    }
  }

  return { pending, result, error, preview };
}
