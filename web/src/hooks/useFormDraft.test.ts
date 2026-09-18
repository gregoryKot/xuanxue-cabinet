// React-обвязка над черновиком (lib/formDraft.ts) — восстановление,
// dirty/restored, discardDraft/forgetDraft, работа без хранилища при
// key === null. Сама работа с localStorage проверена в lib/formDraft.test.ts.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readDraft } from '../lib/formDraft';
import { useFormDraft } from './useFormDraft';

interface FormState {
  prompt: string;
}

const KEY = 'exam-item:new';
const initial = (): FormState => ({ prompt: '' });

afterEach(() => {
  localStorage.clear();
});

describe('useFormDraft — без сохранённого черновика', () => {
  it('монтируется с initial(), restored и dirty — false', () => {
    const { result } = renderHook(() => useFormDraft(KEY, initial));

    expect(result.current.state).toEqual({ prompt: '' });
    expect(result.current.restored).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it('правка пишет черновик в хранилище', () => {
    const { result } = renderHook(() => useFormDraft(KEY, initial));

    act(() => result.current.setState({ prompt: 'Вопрос' }));

    expect(result.current.dirty).toBe(true);
    expect(readDraft(KEY, Date.now())).toEqual({ prompt: 'Вопрос' });
  });

  it('откат правки руками до исходного — запись убирается', () => {
    const { result } = renderHook(() => useFormDraft(KEY, initial));

    act(() => result.current.setState({ prompt: 'Вопрос' }));
    act(() => result.current.setState({ prompt: '' }));

    expect(result.current.dirty).toBe(false);
    expect(readDraft(KEY, Date.now())).toBeNull();
  });
});

describe('useFormDraft — beforeunload', () => {
  it('пока есть правки — подтверждение на закрытие вкладки', () => {
    const { result } = renderHook(() => useFormDraft(KEY, initial));
    act(() => result.current.setState({ prompt: 'Вопрос' }));

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('без правок — обработчик снят, событие не отменяется', () => {
    const { result } = renderHook(() => useFormDraft(KEY, initial));
    act(() => result.current.setState({ prompt: 'Вопрос' }));
    act(() => result.current.discardDraft());

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('useFormDraft — второй монтаж', () => {
  it('видит черновик первого монтажа и восстанавливает его', () => {
    const first = renderHook(() => useFormDraft(KEY, initial));
    act(() => first.result.current.setState({ prompt: 'Черновик' }));
    first.unmount();

    const second = renderHook(() => useFormDraft(KEY, initial));

    expect(second.result.current.state).toEqual({ prompt: 'Черновик' });
    expect(second.result.current.restored).toBe(true);
    expect(second.result.current.dirty).toBe(true);
  });
});

describe('discardDraft', () => {
  it('возвращает state к initial() и стирает запись', () => {
    const { result } = renderHook(() => useFormDraft(KEY, initial));
    act(() => result.current.setState({ prompt: 'Вопрос' }));

    act(() => result.current.discardDraft());

    expect(result.current.state).toEqual({ prompt: '' });
    expect(result.current.dirty).toBe(false);
    expect(readDraft(KEY, Date.now())).toBeNull();
  });

  it('после восстановления гасит restored — заметка не должна остаться висеть', () => {
    const first = renderHook(() => useFormDraft(KEY, initial));
    act(() => first.result.current.setState({ prompt: 'Черновик' }));
    first.unmount();
    const { result } = renderHook(() => useFormDraft(KEY, initial));
    expect(result.current.restored).toBe(true);

    act(() => result.current.discardDraft());

    expect(result.current.restored).toBe(false);
  });
});

describe('forgetDraft', () => {
  it('стирает запись, не трогая state', () => {
    const { result } = renderHook(() => useFormDraft(KEY, initial));
    act(() => result.current.setState({ prompt: 'Вопрос' }));

    act(() => result.current.forgetDraft());

    expect(result.current.state).toEqual({ prompt: 'Вопрос' });
    expect(readDraft(KEY, Date.now())).toBeNull();
  });
});

describe('useFormDraft — key === null', () => {
  it('работает как useState: ничего не пишет и не читает в хранилище', () => {
    const { result } = renderHook(() => useFormDraft<FormState>(null, initial));

    act(() => result.current.setState({ prompt: 'Вопрос' }));

    expect(result.current.state).toEqual({ prompt: 'Вопрос' });
    expect(result.current.dirty).toBe(true);
    expect(result.current.restored).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('discardDraft и forgetDraft не трогают хранилище (нечего стирать по ключу)', () => {
    const { result } = renderHook(() => useFormDraft<FormState>(null, initial));
    act(() => result.current.setState({ prompt: 'Вопрос' }));

    act(() => result.current.forgetDraft());
    expect(result.current.state).toEqual({ prompt: 'Вопрос' });

    act(() => result.current.discardDraft());
    expect(result.current.state).toEqual({ prompt: '' });
    expect(localStorage.length).toBe(0);
  });
});
