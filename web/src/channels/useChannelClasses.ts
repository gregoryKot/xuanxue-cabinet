// Занятия, которые кормят один канал, — данные секции на странице канала
// (ChannelClassesSection.tsx). Привязка живёт у занятия (`classes.channelIds`),
// поэтому галочка шлёт тот же `PATCH /classes/:id`, что и страница занятия, —
// второго пути записи нет. Список в состоянии заменяется ответом PATCH
// (CLAUDE.md «Свежее состояние — из ответа записи»): оптимистичной правки нет,
// при сбое галочка остаётся как была.
import { useRef, useState } from 'react';
import type { ClassDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError } from '../api/http';
import { useClasses, type UseClassesResult } from '../schedule/useClasses';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';

export interface UseChannelClassesResult extends Omit<UseClassesResult, 'applyData'> {
  /** Занятие, чей запрос в пути — его строку отключаем. */
  pendingId: string | null;
  saveError: string | null;
  setLinked: (classId: string, linked: boolean) => Promise<void>;
}

export function useChannelClasses(channelId: string): UseChannelClassesResult {
  const { classes, loading, error, reload, applyData } = useClasses();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Свежий список на момент нажатия: channelIds считается от него, а не от
  // замыкания прошлого рендера.
  const latest = useRef(classes);
  latest.current = classes;

  async function setLinked(classId: string, linked: boolean): Promise<void> {
    const current = latest.current?.find((cls) => cls.id === classId);
    if (!current || pendingId) return;
    const others = current.channelIds.filter((id) => id !== channelId);
    const channelIds = linked ? [...others, channelId] : others;

    setPendingId(classId);
    setSaveError(null);
    try {
      const saved = await apiRoute('PATCH /classes/:id', {
        params: { id: classId },
        body: { channelIds },
      });
      applyData((prev) =>
        prev ? prev.map((cls: ClassDto) => (cls.id === saved.id ? saved : cls)) : prev,
      );
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : SAVE_ERROR_MESSAGE);
    } finally {
      setPendingId(null);
    }
  }

  return { classes, loading, error, reload, pendingId, saveError, setLinked };
}
