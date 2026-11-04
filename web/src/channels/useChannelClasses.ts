// Занятия, которые кормят один канал, — данные секции на странице канала
// (ChannelClassesSection.tsx). Привязка живёт у занятия (`classes.channelIds`),
// поэтому отметка шлёт тот же `PATCH /classes/:id`, что и страница занятия, —
// второго пути записи нет. Строка секции — курс из нескольких занятий, так что
// запросов за раз несколько. Список в состоянии заменяется ответами PATCH
// (CLAUDE.md «Свежее состояние — из ответа записи»): оптимистичной правки нет,
// при сбое отметка остаётся такой, какой её вернул сервер.
import { useRef, useState } from 'react';
import type { ClassDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError } from '../api/http';
import { useClasses, type UseClassesResult } from '../schedule/useClasses';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';

export interface UseChannelClassesResult extends Omit<UseClassesResult, 'applyData'> {
  /** Занятия, чьи запросы в пути, — их строки отключаем. */
  pendingIds: ReadonlySet<string>;
  saveError: string | null;
  setLinkedMany: (classIds: readonly string[], linked: boolean) => Promise<void>;
}

export function useChannelClasses(channelId: string): UseChannelClassesResult {
  const { classes, loading, error, reload, applyData } = useClasses();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  // Свежий список на момент нажатия: channelIds считается от него, а не от
  // замыкания прошлого рендера.
  const latest = useRef(classes);
  latest.current = classes;

  async function saveOne(cls: ClassDto, linked: boolean): Promise<void> {
    const others = cls.channelIds.filter((id) => id !== channelId);
    const saved = await apiRoute('PATCH /classes/:id', {
      params: { id: cls.id },
      body: { channelIds: linked ? [...others, channelId] : others },
    });
    applyData((prev) =>
      prev ? prev.map((item: ClassDto) => (item.id === saved.id ? saved : item)) : prev,
    );
  }

  async function setLinkedMany(
    classIds: readonly string[],
    linked: boolean,
  ): Promise<void> {
    // Пишем только то, что действительно меняется: занятие уже в нужном
    // состоянии лишнего запроса не получает.
    const targets = (latest.current ?? []).filter(
      (cls) =>
        classIds.includes(cls.id) &&
        !pendingIds.has(cls.id) &&
        cls.channelIds.includes(channelId) !== linked,
    );
    if (targets.length === 0) return;

    setPendingIds(new Set(targets.map((cls) => cls.id)));
    setSaveError(null);
    const results = await Promise.allSettled(targets.map((cls) => saveOne(cls, linked)));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      const reason: unknown = failure.reason;
      setSaveError(reason instanceof ApiError ? reason.message : SAVE_ERROR_MESSAGE);
    }
    setPendingIds(new Set());
  }

  return { classes, loading, error, reload, pendingIds, saveError, setLinkedMany };
}
