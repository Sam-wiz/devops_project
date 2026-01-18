import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  // Create microservice for RabbitMQ consumer
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
      queue: 'jobs.main',
      queueOptions: {
        durable: true,
      },
      // Prefetch 1 job at a time to prevent overwhelming worker during circuit open
      prefetchCount: 1,
    },
  });

  // Also create HTTP server for health checks
  const httpApp = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3001;
  await httpApp.listen(port);
  console.log(`Worker health endpoint running on port ${port}`);

  await app.listen();
  console.log('Worker service started, listening for jobs...');
}

bootstrap();
