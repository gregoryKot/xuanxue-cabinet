// Что делает одна строка списка групп на экране «Школа» (ADR-0193):
// переименование на месте и удаление. Логика вне компонента (CLAUDE.md
// «Тесты»); ошибка сервера («такая группа уже есть») остаётся в строке, где её
// и ждут, а не уезжает в общий баннер экрана.
import { useState } from 'react';
import type { GroupDto } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';

const EMPTY_NAME_MESSAGE = 'Впишите название группы.';
const RENAME_ERROR_MESSAGE = 'Не удалось сохранить название. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить группу. Попробуйте ещё раз.';

export interface UseGroupRowResult {
  editing: boolean;
  name: string;
  setName: (name: string) => void;
  pending: boolean;
  error: FormError | null;
  startEditing: () => void;
  cancelEditing: () => void;
  save: () => Promise<void>;
  remove: () => Promise<void>;
}

interface GroupRowActions {
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function useGroupRow(
  group: GroupDto,
  { onRename, onRemove }: GroupRowActions,
): UseGroupRowResult {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  // Запись общая для обоих действий: пока она в пути, кнопки заняты, а
  // провал оставляет строку как была и показывает текст сервера.
  async function run(action: () => Promise<void>, fallback: string): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorFrom(err, fallback));
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEditing() {
    setName(group.name);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError({ message: EMPTY_NAME_MESSAGE });
      return;
    }
    if (trimmed === group.name) {
      setEditing(false);
      return;
    }
    const saved = await run(() => onRename(group.id, trimmed), RENAME_ERROR_MESSAGE);
    if (saved) setEditing(false);
  }

  async function remove() {
    await run(() => onRemove(group.id), REMOVE_ERROR_MESSAGE);
  }

  return {
    editing,
    name,
    setName,
    pending,
    error,
    startEditing,
    cancelEditing: () => setEditing(false),
    save,
    remove,
  };
}
