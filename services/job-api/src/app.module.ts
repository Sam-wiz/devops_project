import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TerminusModule } from '@nestjs/terminus';
import { JobsController } from './jobs/jobs.controller';
import { JobsService } from './jobs/jobs.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // RabbitMQ client configuration
    ClientsModule.register([
      {
        name: 'RABBITMQ_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'jobs.main',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
    TerminusModule,
  ],
  controllers: [JobsController, HealthController],
  providers: [JobsService],
})
export class AppModule {}
