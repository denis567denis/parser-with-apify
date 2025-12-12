import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateScheduleDto {
  @ApiProperty({
    description: 'Интервал проверки аккаунтов в днях',
    example: 3,
    minimum: 1,
    maximum: 30,
  })
  @IsInt()
  @Min(1)
  @Max(30)
  checkIntervalDays: number;
}
