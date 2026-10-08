// Плитка «Ближайшее занятие» на главной (ADR-0173, плитка — ADR-0178): первое
// занятие из GET /me/lessons (StudentNextLesson.tsx без своей рамки — рамка
// у плитки) и вход «Все занятия» внутри. Занятий нет — плитки нет вовсе
// (studentHomeView.ts); раздел «Занятия» с архивом и библиотекой остаётся в
// панели для тех, кто пришёл за записями.
import type { MyLessonDto } from '@xuanxue/shared';
import { StudentNextLesson } from '../student/StudentNextLesson';
import { BoardTile } from './BoardTile';

const TITLE = 'Ближайшее занятие';
const ALL_LESSONS_MORE = { to: '/lessons', label: 'Все занятия' };

interface BoardNextLessonTileProps {
  lesson: MyLessonDto;
}

export function BoardNextLessonTile({ lesson }: BoardNextLessonTileProps) {
  return (
    <BoardTile title={TITLE} more={ALL_LESSONS_MORE}>
      <StudentNextLesson lesson={lesson} bare />
    </BoardTile>
  );
}
