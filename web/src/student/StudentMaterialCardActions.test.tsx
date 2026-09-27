// Проверки StudentMaterialCardActions на материал без ссылки (ADR-0134) —
// отдельным файлом, не в StudentMaterialCard.test.tsx: тот уже 192 строки,
// а check-file-size-ratchet.mjs выше 150 не даёт файлу расти дальше
// (CLAUDE.md «файл до 150 строк растёт свободно; выше — только уменьшается»).
// Остальные сценарии действий строки (ссылка, файл, плеер) уже покрыты там.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MyMaterialDto } from '@xuanxue/shared';
import { StudentMaterialCardActions } from './StudentMaterialCardActions';

function makeMaterial(overrides: Partial<MyMaterialDto> = {}): MyMaterialDto {
  return {
    id: 'm1',
    title: 'Форма 24, разбор',
    kind: 'document',
    classTitles: [],
    tags: [],
    ...overrides,
  };
}

describe('StudentMaterialCardActions — материал без ссылки (ADR-0134)', () => {
  it('только файл — «Открыть» нет, «Скачать файл» есть, плеера нет', () => {
    render(
      <StudentMaterialCardActions
        material={makeMaterial({
          file: {
            name: 'форма.pdf',
            contentType: 'application/pdf',
            sizeBytes: 2048,
            uploadedAt: '2026-01-01T00:00:00Z',
          },
        })}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Открыть' })).not.toBeInTheDocument();
    const fileLink = screen.getByRole('link', { name: 'Скачать файл' });
    expect(fileLink).toHaveAttribute('href', '/api/materials/m1/file');
    expect(
      screen.queryByRole('button', { name: 'Смотреть здесь' }),
    ).not.toBeInTheDocument();
  });

  it('ссылка и файл вместе — оба действия рядом, как раньше', () => {
    render(
      <StudentMaterialCardActions
        material={makeMaterial({
          url: 'https://example.com/article',
          file: {
            name: 'форма.pdf',
            contentType: 'application/pdf',
            sizeBytes: 2048,
            uploadedAt: '2026-01-01T00:00:00Z',
          },
        })}
      />,
    );

    expect(screen.getByRole('link', { name: 'Открыть' })).toHaveAttribute(
      'href',
      'https://example.com/article',
    );
    expect(screen.getByRole('link', { name: 'Скачать файл' })).toHaveAttribute(
      'href',
      '/api/materials/m1/file',
    );
  });
});
