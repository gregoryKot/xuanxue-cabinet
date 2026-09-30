import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { downloadJson } from './downloadJson';

describe('downloadJson', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:test-url');
  const revokeObjectURL = vi.fn();
  // Клик подменён: jsdom не скачивает файлы; ссылку, по которой кликнули,
  // достаём из контекстов вызова.
  let click: MockInstance<() => void>;
  const clickedLink = (): HTMLAnchorElement | undefined =>
    click.mock.contexts[0] as HTMLAnchorElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('кладёт данные в файл с заданным именем и читаемым отступом', async () => {
    downloadJson({ имя: 'Анна', числа: [1, 2] }, 'xuanxue-data.json');

    expect(clickedLink()?.download).toBe('xuanxue-data.json');
    expect(clickedLink()?.href).toBe('blob:test-url');
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('application/json');
    expect(await blob?.text()).toBe(
      JSON.stringify({ имя: 'Анна', числа: [1, 2] }, null, 2),
    );
  });

  it('временная ссылка не остаётся в документе', () => {
    downloadJson({}, 'a.json');

    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('временную ссылку отзывает позже клика, не в тот же такт', () => {
    downloadJson({}, 'a.json');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
