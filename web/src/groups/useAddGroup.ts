// Состояние поля «Новая группа» (ADR-0193): название, запрос в пути, ошибка.
// Логика вне компонента (CLAUDE.md «Тесты»): один и тот же ввод стоит на
// экране «Школа» и в форме занятия — `onAdd` у каждого свой, остальное общее.
import { useCallback, useState } from 'react';
import { errorFrom, type FormError } from '../components/FormServerError';
import { GROUP_LIMITS } from '@xuanxue/shared';

const EMPTY_NAME_MESSAGE = 'Впишите название группы.';
const SAVE_ERROR_MESSAGE = 'Не удалось добавить группу. Попробуйте ещё раз.';

export interface UseAddGroupResult {
  name: string;
  setName: (name: string) => void;
  pending: boolean;
  error: FormError | null;
  maxLength: number;
  submit: () => Promise<void>;
}

export function useAddGroup(
  onAdd: (name: string) => Promise<unknown>,
): UseAddGroupResult {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError({ message: EMPTY_NAME_MESSAGE });
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAdd(trimmed);
      setName('');
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR_MESSAGE));
    } finally {
      setPending(false);
    }
  }, [name, onAdd]);

  return { name, setName, pending, error, maxLength: GROUP_LIMITS.name, submit };
}
