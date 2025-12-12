import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';

// Services
import { GoogleSheetsService } from './services/google-sheets.service';
import { ApifyParserService } from './services/apify-parser.service';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { SchedulerService } from './services/scheduler.service';

// Controllers
import { MetricsController } from './controllers/metrics.controller';
import { AdminController } from './controllers/admin.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [MetricsController, AdminController],
  providers: [
    GoogleSheetsService,
    ApifyParserService,
    MetricsCollectorService,
    SchedulerService,
  ],
})
export class AppModule {}
