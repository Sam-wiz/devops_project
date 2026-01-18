import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { BreakersService } from './breakers.service';

@Controller('breakers')
export class BreakersController {
  constructor(private readonly breakersService: BreakersService) {}

  /**
   * GET /breakers
   * Returns all circuit breakers and their current state
   */
  @Get()
  async getBreakers() {
    const breakers = await this.breakersService.getAllBreakers();
    return {
      count: breakers.length,
      breakers,
    };
  }

  /**
   * POST /breakers/:jobType/reset
   * Manually reset (close) a circuit breaker
   */
  @Post(':jobType/reset')
  @HttpCode(HttpStatus.OK)
  async resetBreaker(@Param('jobType') jobType: string) {
    await this.breakersService.resetBreaker(jobType);
    return {
      message: `Circuit breaker for '${jobType}' has been reset`,
      jobType,
    };
  }
}
