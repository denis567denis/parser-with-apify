import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleSheetsService } from './google-sheets.service';
import { ApifyParserService } from './apify-parser.service';
import { AccountToTrack, VideoMetrics } from '../types/video-metrics.interface';

@Injectable()
export class MetricsCollectorService {
  private readonly logger = new Logger(MetricsCollectorService.name);
  private checkIntervalDays: number;

  constructor(
    private googleSheetsService: GoogleSheetsService,
    private apifyParserService: ApifyParserService,
    private configService: ConfigService,
  ) {
    this.checkIntervalDays = this.configService.get<number>('scheduler.checkIntervalDays', 1);
  }

  /**
   * Получает текущий интервал проверки
   */
  getCheckInterval(): number {
    return this.checkIntervalDays;
  }

  /**
   * Устанавливает новый интервал проверки
   */
  setCheckInterval(days: number): void {
    this.checkIntervalDays = days;
    this.logger.log(`Check interval updated to ${days} days`);
  }

  /**
   * Основной метод для сбора метрик по всем аккаунтам
   */
  async collectMetrics(): Promise<void> {
    this.logger.log('Starting metrics collection...');

    try {
      // Получаем список аккаунтов для отслеживания
      const accounts = await this.googleSheetsService.getAccountsToTrack();
      
      if (accounts.length === 0) {
        this.logger.warn('No accounts to track');
        return;
      }

      this.logger.log(`Found ${accounts.length} accounts to track`);

      // Фильтруем аккаунты, которые нужно проверить
      const accountsToCheck = this.filterAccountsToCheck(accounts);
      
      if (accountsToCheck.length === 0) {
        this.logger.log('No accounts need to be checked at this time');
        return;
      }

      this.logger.log(`Checking ${accountsToCheck.length} accounts`);

      // Собираем метрики для каждого аккаунта
      let totalProcessedVideos = 0;

      for (const account of accountsToCheck) {
        try {
          const processedVideos = await this.processAccount(account);
          totalProcessedVideos += processedVideos;
        } catch (error) {
          this.logger.error(`Failed to process account: ${account.accountUrl}`, error);
        }
      }

      this.logger.log(`Metrics collection completed. Total processed videos: ${totalProcessedVideos}`);
    } catch (error) {
      this.logger.error('Metrics collection failed', error);
      throw error;
    }
  }

  /**
   * Обрабатывает один аккаунт
   */
  private async processAccount(account: AccountToTrack): Promise<number> {
    this.logger.log(`Processing ${account.platform} account: ${account.accountUrl}`);

    try {
      // Парсим аккаунт через Apify
      const videos = await this.apifyParserService.parseAccount(
        account.platform,
        account.accountUrl,
      );

      if (videos.length === 0) {
        this.logger.warn(`No videos found for ${account.accountUrl}`);
        await this.googleSheetsService.updateLastChecked(account.accountUrl, new Date());
        return 0;
      }

      // Записываем ВСЕ видео (writeVideoMetrics сам решит добавить или обновить)
      await this.googleSheetsService.writeVideoMetrics(videos);
      this.logger.log(`Processed ${videos.length} videos for ${account.accountUrl}`);

      // Обновляем время последней проверки
      await this.googleSheetsService.updateLastChecked(account.accountUrl, new Date());

      return videos.length;
    } catch (error) {
      this.logger.error(`Error processing account ${account.accountUrl}`, error);
      throw error;
    }
  }

  /**
   * Фильтрует аккаунты, которые нужно проверить
   * (не проверялись более N дней или никогда не проверялись)
   */
  private filterAccountsToCheck(accounts: AccountToTrack[]): AccountToTrack[] {
    const now = new Date();
    const intervalMs = this.checkIntervalDays * 1000;

    return accounts.filter((account) => {
      if (!account.lastChecked) {
        return true; // Никогда не проверялся
      }

      const timeSinceLastCheck = now.getTime() - account.lastChecked.getTime();
      return timeSinceLastCheck >= intervalMs;
    });
  }

  /**
   * Добавляет новый аккаунт для отслеживания
   */
  async addAccount(account: AccountToTrack): Promise<void> {
    this.logger.log(`Adding account: ${account.accountUrl} (${account.platform})`);

    try {
      // Проверяем, что аккаунт еще не добавлен
      const existingAccounts = await this.googleSheetsService.getAccountsToTrack();
      const exists = existingAccounts.some((a) => a.accountUrl === account.accountUrl);

      if (exists) {
        this.logger.warn(`Account already exists: ${account.accountUrl}`);
        throw new Error('Account already exists');
      }

      // Добавляем аккаунт в таблицу
      await this.googleSheetsService.addAccountToTrack(account);
      this.logger.log(`Account added successfully: ${account.accountUrl}`);
    } catch (error) {
      this.logger.error(`Failed to add account: ${account.accountUrl}`, error);
      throw error;
    }
  }

  /**
   * Получает статус всех аккаунтов
   */
  async getAccountsStatus(): Promise<AccountToTrack[]> {
    return this.googleSheetsService.getAccountsToTrack();
  }
}
