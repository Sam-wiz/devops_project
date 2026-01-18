import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly developerEmail: string;
  private readonly enabled: boolean;

  constructor() {
    this.developerEmail = process.env.DEVELOPER_EMAIL;
    this.enabled = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      this.developerEmail
    );

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log('Email service initialized');
    } else {
      console.warn('Email service disabled - missing SMTP configuration');
    }
  }

  async sendCircuitOpenAlert(jobType: string, errorCode: string, failureCount: number): Promise<void> {
    if (!this.enabled) {
      console.log(`[EMAIL DISABLED] Circuit breaker alert: ${jobType} - ${errorCode}`);
      return;
    }

    try {
      const subject = `🚨 Circuit Breaker OPEN: ${jobType}`;
      const html = `
        <h2>Circuit Breaker Alert</h2>
        <p><strong>Status:</strong> <span style="color: red;">OPEN</span></p>
        <p><strong>Job Type:</strong> ${jobType}</p>
        <p><strong>Error Code:</strong> ${errorCode}</p>
        <p><strong>Failure Count:</strong> ${failureCount}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        
        <hr>
        
        <h3>Issue Details</h3>
        <p>This job type is clogging the RabbitMQ pipeline due to repeated failures.</p>
        <p>The circuit breaker has been opened to prevent further damage.</p>
        
        <h3>Action Required</h3>
        <ul>
          <li>Investigate the root cause of failures for job type: <code>${jobType}</code></li>
          <li>Check logs for error code: <code>${errorCode}</code></li>
          <li>Fix the underlying issue</li>
          <li>Reset the circuit breaker via Control Plane API: <code>POST /breakers/${jobType}/reset</code></li>
        </ul>
        
        <p><em>This is an automated alert from the Worker Service.</em></p>
      `;

      await this.transporter.sendMail({
        from: `"Job Worker Alert" <${process.env.SMTP_USER}>`,
        to: this.developerEmail,
        subject,
        html,
      });

      console.log(`Circuit breaker alert email sent to ${this.developerEmail}`);
    } catch (error) {
      console.error('Failed to send circuit breaker alert email:', error.message);
    }
  }
}
