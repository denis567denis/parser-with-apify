import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class AddAccountDto {
  @ApiProperty({
    description: 'Платформа социальной сети',
    enum: ['tiktok', 'youtube', 'vk', 'pinterest'],
    example: 'youtube',
  })
  @IsEnum(['tiktok', 'youtube', 'vk', 'pinterest'])
  @IsNotEmpty()
  platform: 'tiktok' | 'youtube' | 'vk' | 'pinterest';

  @ApiProperty({
    description: 'URL аккаунта для отслеживания',
    example: 'https://www.youtube.com/@channelname',
  })
  @IsUrl()
  @IsNotEmpty()
  accountUrl: string;

  @ApiProperty({
    description: 'Название аккаунта (опционально)',
    example: 'Channel Name',
    required: false,
  })
  @IsString()
  @IsOptional()
  accountName?: string;
}
