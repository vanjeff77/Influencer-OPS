import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { storage } from './storage';
import { decryptPassword } from './imap';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export function createSmtpTransporter(config: SmtpConfig): Transporter {
  const isDev = process.env.NODE_ENV === 'development';
  
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: !isDev,
    },
  });
}

export async function sendEmail(transporter: Transporter, options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const info = await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, value || '');
  }
  return result;
}

export function validateVariables(template: string, variables: Record<string, string>): { valid: boolean; missingVars: string[] } {
  const varPattern = /\{\{\s*(\w+)\s*\}\}/g;
  const requiredVars: string[] = [];
  let match;
  
  while ((match = varPattern.exec(template)) !== null) {
    const varName = match[1].toLowerCase();
    if (!requiredVars.includes(varName)) {
      requiredVars.push(varName);
    }
  }
  
  const missingVars: string[] = [];
  for (const varName of requiredVars) {
    const value = variables[varName];
    if (!value || value.trim() === '') {
      missingVars.push(varName);
    }
  }
  
  return { valid: missingVars.length === 0, missingVars };
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;
const JITTER_MAX_MS = 2000;

function getDelayWithJitter(): number {
  const jitter = Math.random() * JITTER_MAX_MS;
  return BASE_DELAY_MS + jitter;
}

function isTransientError(error: string): boolean {
  const transientPatterns = [
    /timeout/i,
    /connection reset/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /temporarily unavailable/i,
    /try again/i,
    /rate limit/i,
    /too many/i,
  ];
  return transientPatterns.some(pattern => pattern.test(error));
}

interface BulkEmailWorkerState {
  isRunning: boolean;
  currentJobId: number | null;
}

const workerState: BulkEmailWorkerState = {
  isRunning: false,
  currentJobId: null,
};

export async function startBulkEmailWorker(jobId: number): Promise<void> {
  if (workerState.isRunning && workerState.currentJobId === jobId) {
    console.log(`[BulkEmail] Worker already running for job ${jobId}`);
    return;
  }
  
  workerState.isRunning = true;
  workerState.currentJobId = jobId;
  
  console.log(`[BulkEmail] Starting worker for job ${jobId}`);
  
  try {
    const job = await storage.getBulkEmailJob(jobId);
    if (!job) {
      console.error(`[BulkEmail] Job ${jobId} not found`);
      return;
    }
    
    await storage.updateBulkEmailJob(jobId, { status: 'processing' });
    
    const emailAccount = await storage.getEmailAccountById(job.emailAccountId);
    if (!emailAccount) {
      console.error(`[BulkEmail] Email account ${job.emailAccountId} not found`);
      await storage.updateBulkEmailJob(jobId, { 
        status: 'completed', 
        completedAt: new Date() 
      });
      return;
    }
    
    let smtpConfig: SmtpConfig;
    
    if (emailAccount.provider === 'imap' && emailAccount.accessToken) {
      try {
        const config = JSON.parse(emailAccount.accessToken);
        const decryptedPassword = decryptPassword(config.encryptedPassword);
        smtpConfig = {
          host: config.smtpServer,
          port: parseInt(config.smtpPort) || 587,
          secure: parseInt(config.smtpPort) === 465,
          user: emailAccount.email,
          password: decryptedPassword,
        };
      } catch (e) {
        console.error(`[BulkEmail] Failed to parse SMTP config: ${e}`);
        await storage.updateBulkEmailJob(jobId, { 
          status: 'completed', 
          completedAt: new Date() 
        });
        return;
      }
    } else {
      console.error(`[BulkEmail] Unsupported email provider: ${emailAccount.provider}`);
      await storage.updateBulkEmailJob(jobId, { 
        status: 'completed', 
        completedAt: new Date() 
      });
      return;
    }
    
    const transporter = createSmtpTransporter(smtpConfig);
    
    let sentCount = job.sentCount || 0;
    let failedCount = job.failedCount || 0;
    
    while (true) {
      const item = await storage.getNextPendingQueueItem(jobId);
      if (!item) {
        console.log(`[BulkEmail] No more pending items for job ${jobId}`);
        break;
      }
      
      console.log(`[BulkEmail] Processing item ${item.id} for ${item.email}`);
      
      await storage.updateBulkEmailQueueItem(item.id, { 
        status: 'sending',
        lastAttemptAt: new Date(),
        attempts: (item.attempts || 0) + 1,
      });
      
      const result = await sendEmail(transporter, {
        from: emailAccount.email,
        to: item.email,
        subject: item.renderedSubject,
        html: item.renderedBody,
      });
      
      if (result.success) {
        sentCount++;
        await storage.updateBulkEmailQueueItem(item.id, {
          status: 'sent',
          sentAt: new Date(),
        });
        
        await storage.updateCampaignItem(item.lineItemId, {
          firstContactCompleted: true,
          firstContactAt: new Date(),
          firstContactMethod: 'auto',
        });
        
        console.log(`[BulkEmail] Sent email to ${item.email}`);
      } else {
        const attempts = (item.attempts || 0) + 1;
        
        if (isTransientError(result.error || '') && attempts < MAX_RETRIES) {
          await storage.updateBulkEmailQueueItem(item.id, {
            status: 'queued',
            reason: `재시도 ${attempts}/${MAX_RETRIES}: ${result.error}`,
          });
          console.log(`[BulkEmail] Transient error for ${item.email}, will retry: ${result.error}`);
        } else {
          failedCount++;
          await storage.updateBulkEmailQueueItem(item.id, {
            status: 'failed',
            reason: result.error || '알 수 없는 오류',
          });
          console.log(`[BulkEmail] Failed to send to ${item.email}: ${result.error}`);
        }
      }
      
      await storage.updateBulkEmailJob(jobId, { sentCount, failedCount });
      
      const delay = getDelayWithJitter();
      console.log(`[BulkEmail] Waiting ${Math.round(delay)}ms before next email`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    await storage.updateBulkEmailJob(jobId, {
      status: 'completed',
      completedAt: new Date(),
      sentCount,
      failedCount,
    });
    
    console.log(`[BulkEmail] Job ${jobId} completed. Sent: ${sentCount}, Failed: ${failedCount}`);
    
  } catch (error: any) {
    console.error(`[BulkEmail] Worker error for job ${jobId}:`, error);
    await storage.updateBulkEmailJob(jobId, { 
      status: 'completed', 
      completedAt: new Date() 
    });
  } finally {
    workerState.isRunning = false;
    workerState.currentJobId = null;
  }
}

export function getWorkerStatus(): BulkEmailWorkerState {
  return { ...workerState };
}
