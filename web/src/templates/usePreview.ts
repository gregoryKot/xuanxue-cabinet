// Предпросмотр шаблона на реальном занятии (docs/PLAN.md §6 «Шаблоны») —
// POST /settings/preview рендерит СОХРАНЁННЫЙ шаблон, не то, что напечатано
// в форме и ещё не сохранено (TemplateEditor.tsx предупреждает об этом сам).
import { useState } from 'react';
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

  async function preview(kind: TemplateKind, lessonId: string): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch<PreviewTemplateResult>('/settings/preview', {
        method: 'POST',
        body: { kind, lessonId },
      });
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : PREVIEW_ERROR);
    } finally {
      setPending(false);
    }
  }

  return { pending, result, error, preview };
}
