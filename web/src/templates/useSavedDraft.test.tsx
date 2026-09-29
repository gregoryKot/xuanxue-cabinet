import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderBeforeEffects } from '../test-support/renderBeforeEffects';
import { useSavedDraft } from './useSavedDraft';

type Form = { time: string; day: string; enabled: boolean };

const SAVED: Form = { time: '10:00', day: '15', enabled: false };

// Без значения по умолчанию у version: `undefined` — это «настроек ещё нет», а
// параметр по умолчанию подменил бы его на 'v1'.
function setupForm(saved: Form, version: string | undefined) {
  return renderHook(
    (props: { saved: Form; version: string | undefined }) =>
      useSavedDraft(props.saved, props.version),
    { initialProps: { saved, version } },
  );
}

describe('useSavedDraft — старт', () => {
  it('первый рендер уже с сохранённым, без ожидания эффекта', () => {
    const seen: Form[] = [];
    renderHook(() => {
      const [draft] = useSavedDraft(SAVED, 'v1');
      seen.push(draft);
    });

    expect(seen[0]).toEqual(SAVED);
  });

  it('тот же updatedAt — набранное не перезатирается, даже если saved пришёл новым объектом', () => {
    const { result, rerender } = setupForm(SAVED, 'v1');

    act(() => result.current[1]((form) => ({ ...form, time: '09:30' })));
    rerender({ saved: { ...SAVED }, version: 'v1' });

    expect(result.current[0].time).toBe('09:30');
  });
});

describe('useSavedDraft — новый updatedAt', () => {
  it('поле не трогали — берёт новое сохранённое', () => {
    const { result, rerender } = setupForm(SAVED, 'v1');

    rerender({ saved: { ...SAVED, time: '11:15' }, version: 'v2' });

    expect(result.current[0]).toEqual({ ...SAVED, time: '11:15' });
  });

  it('поле набрано и не сохранено — остаётся как набрано, остальные поля обновляются', () => {
    const { result, rerender } = setupForm(SAVED, 'v1');

    act(() => result.current[1]((form) => ({ ...form, time: '09:30' })));
    // Кто-то другой сохранил день и включатель; время в ответе — старое.
    rerender({ saved: { ...SAVED, day: '20', enabled: true }, version: 'v2' });

    expect(result.current[0]).toEqual({ time: '09:30', day: '20', enabled: true });
  });

  it('набрали и вернули прежнее значение — поле снова не тронуто и берёт новое', () => {
    const { result, rerender } = setupForm(SAVED, 'v1');

    act(() => result.current[1]((form) => ({ ...form, time: '09:30' })));
    act(() => result.current[1]((form) => ({ ...form, time: SAVED.time })));
    rerender({ saved: { ...SAVED, time: '11:15' }, version: 'v2' });

    expect(result.current[0].time).toBe('11:15');
  });

  it('свой «Сохранить»: набранное совпало с ответом сервера — форма равна сохранённому', () => {
    const { result, rerender } = setupForm(SAVED, 'v1');

    act(() => result.current[1]((form) => ({ ...form, day: '31' })));
    rerender({ saved: { ...SAVED, day: '31' }, version: 'v2' });

    expect(result.current[0]).toEqual({ ...SAVED, day: '31' });
  });

  it('настройки пришли позже открытия экрана — тронутое остаётся, нетронутое загружается', () => {
    const { result, rerender } = setupForm(SAVED, undefined);

    act(() => result.current[1]((form) => ({ ...form, time: '09:30' })));
    rerender({ saved: { time: '12:00', day: '5', enabled: true }, version: 'v1' });

    expect(result.current[0]).toEqual({ time: '09:30', day: '5', enabled: true });
  });
});

describe('useSavedDraft — одно значение и его отсутствие', () => {
  it('строка: нетронутая берёт новое сохранённое, набранная остаётся', () => {
    const { result, rerender } = renderHook(
      (props: { saved: string; version: string }) =>
        useSavedDraft(props.saved, props.version),
      { initialProps: { saved: '60', version: 'v1' } },
    );

    rerender({ saved: '30', version: 'v2' });
    expect(result.current[0]).toBe('30');

    act(() => result.current[1]('45'));
    rerender({ saved: '20', version: 'v3' });
    expect(result.current[0]).toBe('45');
  });

  it('null до загрузки настроек, потом запись: черновика ещё нет — берётся загруженное', () => {
    type Texts = { anons: string; record: string };
    const { result, rerender } = renderHook(
      (props: { saved: Texts | null; version: string | undefined }) =>
        useSavedDraft<Texts | null>(props.saved, props.version),
      {
        initialProps: {
          saved: null as Texts | null,
          version: undefined as string | undefined,
        },
      },
    );
    expect(result.current[0]).toBeNull();

    rerender({ saved: { anons: 'А', record: 'Б' }, version: 'v1' });
    expect(result.current[0]).toEqual({ anons: 'А', record: 'Б' });

    act(() => result.current[1]((texts) => (texts ? { ...texts, anons: 'А+' } : texts)));
    rerender({ saved: { anons: 'А', record: 'Б2' }, version: 'v2' });
    expect(result.current[0]).toEqual({ anons: 'А+', record: 'Б2' });
  });
});

// Экран показывает то, что сервер вернул после записи (ADR-0087): «  Иван  »
// ушло, «Иван» вернулось — в поле «Иван». Проверяет DataControllerField.test.tsx
// на всём стеке, здесь — правило в чистом виде.
describe('useSavedDraft — своё «Сохранить» (submit)', () => {
  function setupText(saved: string) {
    return renderHook(
      (props: { saved: string; version: string }) =>
        useSavedDraft(props.saved, props.version),
      { initialProps: { saved, version: 'v1' } },
    );
  }

  it('ушло «  Иван  », сервер вернул «Иван» — в поле ответ сервера', async () => {
    const { result, rerender } = setupText('');

    act(() => result.current[1]('  Иван  '));
    await act(async () => {
      await result.current[2]('  Иван  ', () => Promise.resolve());
    });
    rerender({ saved: 'Иван', version: 'v2' });

    expect(result.current[0]).toBe('Иван');
  });

  it('сервер отказал — набранное остаётся черновиком, а чужое сохранение его не стирает', async () => {
    const { result, rerender } = setupText('');
    const failure = new Error('сеть');

    act(() => result.current[1]('Иван'));
    await act(async () => {
      await expect(result.current[2]('Иван', () => Promise.reject(failure))).rejects.toBe(
        failure,
      );
    });
    rerender({ saved: 'Пётр', version: 'v2' });

    expect(result.current[0]).toBe('Иван');
  });

  it('пока шёл запрос, учитель набрал ещё — дописанное остаётся', async () => {
    const { result, rerender } = setupText('');
    let finish = () => {};
    let request: Promise<void> = Promise.resolve();

    act(() => result.current[1]('Иван'));
    act(() => {
      request = result.current[2](
        'Иван',
        () => new Promise<void>((resolve) => (finish = resolve)),
      );
    });
    act(() => result.current[1]('Иван Иванов'));
    await act(async () => {
      finish();
      await request;
    });
    rerender({ saved: 'Иван', version: 'v2' });

    expect(result.current[0]).toBe('Иван Иванов');
  });

  it('запись из полей: ушедшие поля берут ответ, чужое несохранённое остаётся', async () => {
    const { result, rerender } = setupForm(SAVED, 'v1');
    const sent = { ...SAVED, day: '05' };

    act(() => result.current[1]({ ...sent, time: '09:30' }));
    await act(async () => {
      await result.current[2](sent, () => Promise.resolve());
    });
    rerender({ saved: { ...SAVED, day: '5' }, version: 'v2' });

    expect(result.current[0]).toEqual({ ...SAVED, day: '5', time: '09:30' });
  });
});

// Регрессия на мигание PaymentReminderSection.test.tsx «новое время включает
// „Сохранить напоминание“» (2026-09-29, красный `npm run check` на нагруженной
// машине): эффект монтирования делал setForm(снимок сохранённого) и вставал в
// очередь обновлений после первого ввода. Порядок «ввод раньше эффектов»
// задан здесь жёстко (renderBeforeEffects), а не удачей планировщика.
describe('useSavedDraft — ввод раньше эффектов монтирования', () => {
  function Probe() {
    const [draft, setDraft] = useSavedDraft(SAVED, 'v1');
    return (
      <input
        aria-label="Время"
        value={draft.time}
        onChange={(event) => setDraft({ ...draft, time: event.target.value })}
      />
    );
  }

  it('первый символ, введённый сразу после появления формы, не теряется', async () => {
    await renderBeforeEffects(<Probe />, (container) => {
      const input = container.querySelector('input');
      if (!input) throw new Error('поле не отрисовано');

      fireEvent.change(input, { target: { value: '09:30' } });

      expect(input.value).toBe('09:30');
    });
  });
});
