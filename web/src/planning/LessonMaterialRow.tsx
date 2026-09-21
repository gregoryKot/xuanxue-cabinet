// Строка материала в секции «Материалы» страницы даты занятия (ADR-0056).
// Одна строка на оба списка — привязанные («Убрать») и кандидаты из
// библиотеки («Добавить»): списки стоят на одном экране в двух пальцах друг
// от друга, и разъехаться по виду они не имеют права (CLAUDE.md «Одна
// механика — один компонент», jscpd).
import type { CSSProperties } from 'react';
import { MATERIAL_KIND_LABELS, type MaterialDto } from '@xuanxue/shared';
import { textLinkButtonStyle } from '../components/screenLayout';
import { MaterialFileDownloadLink } from '../materials/MaterialFileDownloadLink';

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--line)',
};
// Колонка названия в flex-строке: без `minWidth: 0` потомок не сжимается уже
// своего содержимого, и длинное название раздвигало бы страницу редактора в
// горизонтальный скролл (CLAUDE.md «Мобильный экран первым»).
const titleColumnStyle: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere' };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 };
// Ссылка на файл — своей строкой под подписью, а не рядом с кнопкой действия:
// на 360 px правая колонка уже занята «Добавить»/«Убрать» (CLAUDE.md
// «Мобильный экран первым»).
const fileLineStyle: CSSProperties = { marginTop: 2 };

interface LessonMaterialRowProps {
  material: MaterialDto;
  /** Хранилище файлов подключено (`fileStorageEnabled`, ADR-0057): нет ключей
   * — ссылки на скачивание нет вовсе, а не кнопка, которая ответит 503. Тот
   * же приём, что у поля файла на странице материала. Секция читает признак
   * один раз и раздаёт обоим спискам. */
  fileStorageEnabled: boolean;
  actionLabel: string;
  onAction: () => void;
}

export function LessonMaterialRow({
  material,
  fileStorageEnabled,
  actionLabel,
  onAction,
}: LessonMaterialRowProps) {
  // Вид и теги — та же подпись, что в строке библиотеки (MaterialCard.tsx):
  // учитель узнаёт материал по ней, а не по одному названию.
  const meta = [MATERIAL_KIND_LABELS[material.kind], ...material.tags].join(' · ');

  return (
    <li style={rowStyle}>
      <div style={titleColumnStyle}>
        <a href={material.url} target="_blank" rel="noreferrer">
          {material.title}
        </a>
        <div style={metaStyle}>{meta}</div>
        {/* Здесь только «Скачать файл» (ADR-0080): учителю на этом экране
            нужно увидеть, что файл есть, и забрать его; загрузка и замена
            живут на странице материала, в разделе «Материалы». */}
        {fileStorageEnabled && material.file && (
          <div style={fileLineStyle}>
            <MaterialFileDownloadLink materialId={material.id} />
          </div>
        )}
      </div>
      <button type="button" style={textLinkButtonStyle} onClick={onAction}>
        {actionLabel}
      </button>
    </li>
  );
}
