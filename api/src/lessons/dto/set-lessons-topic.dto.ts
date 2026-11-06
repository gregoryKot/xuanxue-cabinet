// Тело POST /lessons/topic (ADR-0197). Пустой `topic` допустим — он снимает
// тему у отмеченных занятий, поэтому `@IsNotEmpty()` здесь не нужен.
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsString,
  MaxLength,
} from 'class-validator';
import { LESSON_LIMITS, WEEK_TOPIC_MAX_IDS, type ApiRouteBody } from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class SetLessonsTopicDto implements ApiRouteBody<'POST /lessons/topic'> {
  @TrimString()
  @IsString()
  @MaxLength(LESSON_LIMITS.topic)
  topic!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WEEK_TOPIC_MAX_IDS)
  @IsMongoId({ each: true })
  lessonIds!: string[];
}
