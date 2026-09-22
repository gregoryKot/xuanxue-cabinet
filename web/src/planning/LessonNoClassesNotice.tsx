// Разовое занятие привязывается к классу расписания — без единого класса
// форме нечего показывать (ревью п.9): вместо тупика с пустым селектом —
// объяснение и путь к решению. Вынесено из LessonFormFields.tsx (CLAUDE.md
// «Храповики»: файл рядом с потолком размера, дробим при первом же росте).
import { Link } from 'react-router-dom';
import { textLinkStyle } from '../components/screenLayout';

export function LessonNoClassesNotice() {
  return (
    <p style={{ margin: 0 }}>
      Сначала добавьте занятие в расписании.{' '}
      <Link to="/schedule" style={textLinkStyle}>
        Перейти в «Расписание»
      </Link>
    </p>
  );
}
