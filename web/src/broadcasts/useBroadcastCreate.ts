// Отправка разовой рассылки — единственное, что делает страница
// `/broadcasts/new`. Не общий hooks/useEntityEditor.ts: тот про «прочитать
// запись по адресу, сохранить, удалить», а у разовой рассылки нет ни правки,
// ни удаления — API их не знает (BroadcastsController), отменить уже
// созданную можно из журнала.
import { useCallback } from 'react';
import type { CreateBroadcastInput } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';

export function useBroadcastCreate(): (input: CreateBroadcastInput) => Promise<void> {
  return useCallback(async (input: CreateBroadcastInput) => {
    await apiRoute('POST /broadcasts', { body: input });
  }, []);
}
