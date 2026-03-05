import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { storage } from './storage';
import { decryptPassword } from './imap';

export function getImapSmtpSettings(account: any): {
  imapHost: string | null;
  imapPort: number;
  smtpHost: string | null;
  smtpPort: number;
  imapPassword: string | null;
} {
  const fromColumns = {
    imapHost: account.imapHost || null,
    imapPort: typeof account.imapPort === 'number' ? account.imapPort : parseInt(account.imapPort) || 993,
    smtpHost: account.smtpHost || null,
    smtpPort: typeof account.smtpPort === 'number' ? account.smtpPort : parseInt(account.smtpPort) || 587,
    imapPassword: account.imapPassword || null,
  };

  if (fromColumns.imapHost && fromColumns.smtpHost && fromColumns.imapPassword) {
    return fromColumns;
  }
  
  if (account.accessToken) {
    try {
      const config = JSON.parse(account.accessToken);
      const fromLegacy = {
        imapHost: config.imapServer || null,
        imapPort: parseInt(config.imapPort) || 993,
        smtpHost: config.smtpServer || null,
        smtpPort: parseInt(config.smtpPort) || 587,
        imapPassword: account.refreshToken || null,
      };
      return {
        imapHost: fromColumns.imapHost || fromLegacy.imapHost,
        imapPort: fromColumns.imapHost ? fromColumns.imapPort : fromLegacy.imapPort,
        smtpHost: fromColumns.smtpHost || fromLegacy.smtpHost,
        smtpPort: fromColumns.smtpHost ? fromColumns.smtpPort : fromLegacy.smtpPort,
        imapPassword: fromColumns.imapPassword || fromLegacy.imapPassword,
      };
    } catch {}
  }
  
  return fromColumns;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

interface SmtpAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendEmailOptions {
  from: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  attachments?: SmtpAttachment[];
  inReplyTo?: string;
  references?: string[];
  forceUniqueThread?: boolean;
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
    const mailOptions: any = {
      from: options.from,
      to: options.to,
      cc: options.cc && options.cc.length > 0 ? options.cc.join(', ') : undefined,
      subject: options.subject,
      html: options.html,
    };
    if (options.forceUniqueThread) {
      const domain = options.from.split('@')[1] || 'localhost';
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      mailOptions.messageId = `<bulk-${uniqueId}@${domain}>`;
      mailOptions.headers = {
        'X-Entity-Ref-ID': `bulk-${uniqueId}`,
      };
    } else {
      if (options.inReplyTo) {
        mailOptions.inReplyTo = options.inReplyTo;
      }
      if (options.references && options.references.length > 0) {
        mailOptions.references = options.references.join(' ');
      }
    }
    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = options.attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType || 'application/octet-stream',
      }));
    }
    const info = await transporter.sendMail(mailOptions);
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function convertToGmailCompatibleHtml(html: string): string {
  let result = html;
  
  result = result.replace(/<p><br\s*\/?><\/p>/gi, '<div style="margin:0 0 1em 0"><br></div>');
  
  result = result.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, content) => {
    const existingStyle = attrs.match(/style="([^"]*)"/);
    if (existingStyle) {
      const newStyle = existingStyle[1] + ';margin:0 0 1em 0';
      const newAttrs = attrs.replace(/style="[^"]*"/, `style="${newStyle}"`);
      return `<div${newAttrs}>${content}</div>`;
    }
    return `<div${attrs} style="margin:0 0 1em 0">${content}</div>`;
  });
  
  result = result.replace(/<h1><strong>([\s\S]*?)<\/strong><\/h1>/gi, '<div style="font-size:20px;font-weight:bold">$1</div>');
  result = result.replace(/<h1>([\s\S]*?)<\/h1>/gi, '<div style="font-size:20px;font-weight:bold">$1</div>');
  
  result = result.replace(/&nbsp;/g, ' ');
  
  result = result.replace(/(<img[^>]*)\ssrc="data:image\/[^"]*"([^>]*>)/gi, '');
  
  result = result.replace(/<div><\/div>/g, '<div><br></div>');
  
  result = result.replace(/(<div[^>]*>)\s+/g, '$1');
  result = result.replace(/\s+(<\/div>)/g, '$1');
  
  return result;
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
    
    if (emailAccount.provider === 'imap') {
      try {
        const { smtpHost, smtpPort, imapPassword } = getImapSmtpSettings(emailAccount);
        if (!smtpHost || !imapPassword) {
          console.error(`[BulkEmail] Missing SMTP settings for account ${emailAccount.email}`);
          await storage.updateBulkEmailJob(jobId, { 
            status: 'failed', 
            completedAt: new Date() 
          });
          return;
        }
        const decryptedPassword = decryptPassword(imapPassword);
        smtpConfig = {
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          user: emailAccount.email,
          password: decryptedPassword,
        };
      } catch (e) {
        console.error(`[BulkEmail] Failed to parse SMTP config: ${e}`);
        await storage.updateBulkEmailJob(jobId, { 
          status: 'failed', 
          completedAt: new Date() 
        });
        return;
      }
    } else {
      console.error(`[BulkEmail] Unsupported email provider or missing credentials: ${emailAccount.provider}`);
      await storage.updateBulkEmailJob(jobId, { 
        status: 'failed', 
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
      
      const ccEmails = job.cc ? job.cc.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
      
      const result = await sendEmail(transporter, {
        from: emailAccount.email,
        to: item.email,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        subject: item.renderedSubject,
        html: item.renderedBody,
        forceUniqueThread: true,
      });
      
      if (result.success) {
        sentCount++;
        const now = new Date();
        await storage.updateBulkEmailQueueItem(item.id, {
          status: 'sent',
          sentAt: now,
        });
        
        await storage.updateCampaignItem(item.lineItemId, {
          firstContactCompleted: true,
          firstContactAt: now,
          firstContactMethod: 'auto',
          status: 'contacted',
        });
        
        try {
          let conversation = await storage.getConversationByLineItem(item.lineItemId);
          if (!conversation) {
            conversation = await storage.createConversation({
              campaignLineItemId: item.lineItemId,
              emailAccountId: emailAccount.id,
              subjectPrefix: item.renderedSubject,
              lastMessageAt: now,
              status: 'active',
            });
          } else if (item.renderedSubject) {
            await storage.updateConversation(conversation.id, {
              subjectPrefix: item.renderedSubject,
              emailAccountId: emailAccount.id,
            });
          }
          
          await storage.createConversationMessage({
            conversationId: conversation.id,
            direction: 'outbound',
            senderEmail: emailAccount.email,
            senderName: emailAccount.email,
            recipientEmail: item.email,
            snippet: item.renderedSubject,
            bodyHtml: item.renderedBody,
            gmailMessageId: result.messageId || null,
            sendStatus: 'sent',
            sentAt: now,
          });
          console.log(`[BulkEmail] Created conversation for line item ${item.lineItemId}`);

          if (!conversation.gmailThreadId && result.messageId) {
            const convId = conversation.id;
            const msgId = result.messageId;
            setTimeout(async () => {
              try {
                const gmail = await import('./gmail');
                const cleanMsgId = msgId.replace(/^<|>$/g, '');
                const msgs = await gmail.listMessages(`rfc822msgid:${cleanMsgId}`, 1);
                if (msgs.length > 0) {
                  const fullMsg = await gmail.getMessage(msgs[0].id!);
                  const threadId = fullMsg.threadId;
                  if (threadId) {
                    await storage.updateConversation(convId, { gmailThreadId: threadId });
                    console.log(`[BulkEmail] Updated threadId for conversation ${convId}: ${threadId}`);
                  }
                }
              } catch (err) {
                console.warn(`[BulkEmail] Failed to fetch threadId for conversation ${convId}:`, err);
              }
            }, 5000);
          }
        } catch (convErr) {
          console.error(`[BulkEmail] Failed to create conversation for line item ${item.lineItemId}:`, convErr);
        }
        
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
