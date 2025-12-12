import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsCollectorService } from '../services/metrics-collector.service';
import { SchedulerService } from '../services/scheduler.service';
import { AddAccountDto } from '../dto/add-account.dto';
import { UpdateScheduleDto } from '../dto/update-schedule.dto';

@ApiTags('Metrics')
@Controller('api/metrics')
export class MetricsController {
  constructor(
    private metricsCollectorService: MetricsCollectorService,
    private schedulerService: SchedulerService,
  ) {}

  @Get('accounts')
  @ApiOperation({ summary: 'Получить список всех отслеживаемых аккаунтов' })
  @ApiResponse({
    status: 200,
    description: 'Список аккаунтов успешно получен',
  })
  async getAccounts() {
    const accounts = await this.metricsCollectorService.getAccountsStatus();
    return {
      success: true,
      count: accounts.length,
      accounts,
    };
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Добавить новый аккаунт для отслеживания' })
  @ApiResponse({
    status: 201,
    description: 'Аккаунт успешно добавлен',
  })
  @ApiResponse({
    status: 400,
    description: 'Неверные данные или аккаунт уже существует',
  })
  async addAccount(@Body() addAccountDto: AddAccountDto) {
    await this.metricsCollectorService.addAccount({
      platform: addAccountDto.platform,
      accountUrl: addAccountDto.accountUrl,
      accountName: addAccountDto.accountName,
    });

    return {
      success: true,
      message: 'Account added successfully',
      account: addAccountDto,
    };
  }

  @Post('collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Запустить сбор метрик вручную',
    description: 'Принудительно запускает процесс сбора метрик для всех аккаунтов, которые должны быть проверены',
  })
  @ApiResponse({
    status: 200,
    description: 'Сбор метрик успешно запущен',
  })
  async collectMetrics() {
    // Запускаем сбор в фоновом режиме
    this.schedulerService.triggerManualCollection().catch((error) => {
      console.error('Manual collection failed:', error);
    });

    return {
      success: true,
      message: 'Metrics collection started',
    };
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Получить информацию о текущем расписании' })
  @ApiResponse({
    status: 200,
    description: 'Информация о расписании получена',
  })
  getSchedule() {
    return {
      success: true,
      checkIntervalDays: this.metricsCollectorService.getCheckInterval(),
      cronExpression: this.schedulerService.getSchedule(),
      nextRun: this.schedulerService.getNextRun(),
    };
  }

  @Post('schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Изменить интервал проверки аккаунтов',
    description: 'Устанавливает новый интервал в днях между проверками аккаунтов',
  })
  @ApiResponse({
    status: 200,
    description: 'Расписание успешно обновлено',
  })
  updateSchedule(@Body() updateScheduleDto: UpdateScheduleDto) {
    this.metricsCollectorService.setCheckInterval(updateScheduleDto.checkIntervalDays);

    return {
      success: true,
      message: 'Schedule updated successfully',
      checkIntervalDays: updateScheduleDto.checkIntervalDays,
    };
  }
}
