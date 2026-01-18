import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * GET /metrics
   * Returns simple counters for circuit breakers and failures
   */
  @Get()
  async getMetrics() {
    return await this.metricsService.getMetrics();
  }
}
