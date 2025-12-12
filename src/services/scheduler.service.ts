import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { MetricsCollectorService } from './metrics-collector.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly jobName = 'metrics-collection-job';

  constructor(
    private metricsCollectorService: MetricsCollectorService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Запускается каждый день в 3:00 утра для проверки метрик
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'metrics-collection-job',
  })
  async handleCron() {
    this.logger.log('Scheduled metrics collection triggered');
    try {
      await this.metricsCollectorService.collectMetrics();
    } catch (error) {
      this.logger.error('Scheduled metrics collection failed', error);
    }
  }

  /**
   * Запускает сбор метрик вручную
   */
  async triggerManualCollection(): Promise<void> {
    this.logger.log('Manual metrics collection triggered');
    await this.metricsCollectorService.collectMetrics();
  }

  /**
   * Изменяет расписание проверки
   */
  updateSchedule(cronExpression: string): void {
    try {
      // Проверяем, существует ли задача
      let existingJob;
      try {
        existingJob = this.schedulerRegistry.getCronJob(this.jobName);
      } catch {
        existingJob = null;
      }

      // Если задача существует, останавливаем и удаляем её
      if (existingJob) {
        existingJob.stop();
        this.schedulerRegistry.deleteCronJob(this.jobName);
        this.logger.log('Stopped and removed existing cron job');
      }
      
      // Создаем новую задачу
      const newJob = new CronJob(
        cronExpression,
        async () => {
          this.logger.log('Scheduled metrics collection triggered');
          try {
            await this.metricsCollectorService.collectMetrics();
          } catch (error) {
            this.logger.error('Scheduled metrics collection failed', error);
          }
        },
        null, // onComplete
        false, // start immediately - false, мы запустим вручную
        'Europe/Moscow', // timezone
      );
      
      // Добавляем новую задачу в реестр
      this.schedulerRegistry.addCronJob(this.jobName, newJob);
      
      // Запускаем новую задачу
      newJob.start();
      
      this.logger.log(`Schedule updated to: ${cronExpression}, next run: ${newJob.nextDate().toJSDate()}`);
    } catch (error) {
      this.logger.error('Failed to update schedule', error);
      throw error;
    }
  }

  /**
   * Получает текущее расписание
   */
  getSchedule(): string {
    try {
      const job = this.schedulerRegistry.getCronJob(this.jobName);
      const cronTime = job.cronTime as any;
      // Возвращаем cron expression
      return cronTime.source || CronExpression.EVERY_DAY_AT_3AM;
    } catch (error) {
      this.logger.warn('Could not get current schedule, using default');
      return CronExpression.EVERY_DAY_AT_3AM;
    }
  }

  /**
   * Останавливает планировщик
   */
  stopScheduler(): void {
    try {
      const job = this.schedulerRegistry.getCronJob(this.jobName);
      job.stop();
      this.logger.log('Scheduler stopped');
    } catch (error) {
      this.logger.error('Failed to stop scheduler', error);
    }
  }

  /**
   * Запускает планировщик
   */
  startScheduler(): void {
    try {
      const job = this.schedulerRegistry.getCronJob(this.jobName);
      job.start();
      this.logger.log('Scheduler started');
    } catch (error) {
      this.logger.error('Failed to start scheduler', error);
    }
  }

  /**
   * Получает информацию о следующем запуске
   */
  getNextRun(): Date | null {
    try {
      const job = this.schedulerRegistry.getCronJob(this.jobName);
      return job.nextDate().toJSDate();
    } catch (error) {
      return null;
    }
  }
}
