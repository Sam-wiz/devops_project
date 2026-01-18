import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BreakersController } from './breakers/breakers.controller';
import { BreakersService } from './breakers/breakers.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [BreakersController, MetricsController, HealthController],
  providers: [BreakersService, MetricsService],
})
export class AppModule {}
