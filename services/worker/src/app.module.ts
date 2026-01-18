import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TerminusModule } from '@nestjs/terminus';
import { WorkerController } from './worker/worker.controller';
import { WorkerService } from './worker/worker.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { EmailService } from './email/email.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // RabbitMQ client for publishing to retry/quarantine queues
    ClientsModule.register([
      {
        name: 'RABBITMQ_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'jobs.retry',
          queueOptions: {
            durable: true,
            // TTL for retry queue (delay before retry)
            messageTtl: parseInt(process.env.RETRY_DELAY_MS || '5000', 10),
            deadLetterExchange: '',
            deadLetterRoutingKey: 'jobs.main', // Send back to main queue after TTL
          },
        },
      },
    ]),
    TerminusModule,
  ],
  controllers: [WorkerController, HealthController],
  providers: [WorkerService, CircuitBreakerService, EmailService],
})
export class AppModule {}
