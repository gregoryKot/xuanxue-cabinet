// Обвязка тестов тоже код: если React изменит порядок коммита и эффектов,
// тесты гонки (useSavedDraft.test.tsx) тихо станут пустыми и зелёными. Этот
// тест ловит такое сразу.
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { renderBeforeEffects } from './renderBeforeEffects';

describe('renderBeforeEffects', () => {
  it('ввод идёт после коммита, но раньше эффекта монтирования', async () => {
    const order: string[] = [];
    function Probe() {
      useEffect(() => {
        order.push('эффект монтирования');
      }, []);
      return <p>на экране</p>;
    }

    await renderBeforeEffects(<Probe />, (container) => {
      order.push(`ввод, в DOM: «${container.textContent}»`);
    });

    expect(order).toEqual(['ввод, в DOM: «на экране»', 'эффект монтирования']);
  });

  it('после прогона дерево убрано, а act-окружение возвращено', async () => {
    const before = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
    let seen: HTMLElement | null = null;

    await renderBeforeEffects(<p>раз</p>, (container) => {
      seen = container;
    });

    expect(seen).not.toBeNull();
    expect(document.body.contains(seen)).toBe(false);
    expect(
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT,
    ).toBe(before);
  });

  it('ошибка в run не оставляет дерево и не теряется', async () => {
    let seen: HTMLElement | null = null;

    await expect(
      renderBeforeEffects(<p>два</p>, (container) => {
        seen = container;
        throw new Error('утверждение не сошлось');
      }),
    ).rejects.toThrow('утверждение не сошлось');

    expect(document.body.contains(seen)).toBe(false);
  });
});
