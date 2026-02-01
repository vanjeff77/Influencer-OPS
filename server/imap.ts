import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import crypto from 'crypto';

// Encryption key getter - must match routes.ts
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-secret-key-32chars-long!!';
  return Buffer.from(key.slice(0, 32).padEnd(32, '0'));
};

export function decryptPassword(encryptedPassword: string): string {
  // If not encrypted (no colon separator), return as-is
  if (!encryptedPassword.includes(':')) {
    return encryptedPassword;
  }
  
  try {
    const keyBuffer = getEncryptionKey();
    const [ivHex, encrypted] = encryptedPassword.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('Password decryption failed - account may need to be re-registered');
    throw new Error('비밀번호 복호화 실패. 계정을 다시 등록해 주세요.');
  }
}

export interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export interface EmailMessage {
  messageId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  snippet: string;
  body: string;
  isRead: boolean;
}

export function createImapConnection(config: ImapConfig): Promise<Imap> {
  return new Promise((resolve, reject) => {
    // Only disable certificate verification in development mode
    const isDev = process.env.NODE_ENV === 'development';
    
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { 
        rejectUnauthorized: !isDev, // Enable certificate verification in production
        servername: config.host, // Required for SNI
      },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    imap.once('ready', () => {
      resolve(imap);
    });

    imap.once('error', (err: Error) => {
      reject(err);
    });

    imap.connect();
  });
}

export async function fetchEmails(config: ImapConfig, folder: string = 'INBOX', limit: number = 10): Promise<EmailMessage[]> {
  const imap = await createImapConnection(config);
  
  return new Promise((resolve, reject) => {
    imap.openBox(folder, true, (err, box) => {
      if (err) {
        imap.end();
        reject(err);
        return;
      }

      const totalMessages = box.messages.total;
      if (totalMessages === 0) {
        imap.end();
        resolve([]);
        return;
      }

      const start = Math.max(1, totalMessages - limit + 1);
      const fetchRange = `${start}:${totalMessages}`;
      
      const messages: EmailMessage[] = [];
      const fetch = imap.seq.fetch(fetchRange, {
        bodies: '',
        struct: true,
      });

      fetch.on('message', (msg, seqno) => {
        let buffer = '';
        
        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('attributes', (attrs) => {
          msg.once('end', async () => {
            try {
              const parsed = await simpleParser(buffer);
              const fromAddress = Array.isArray(parsed.from?.value) 
                ? parsed.from.value[0]?.address || '' 
                : '';
              const toAddress = Array.isArray(parsed.to) 
                ? (parsed.to[0] as any)?.value?.[0]?.address || ''
                : (parsed.to as any)?.value?.[0]?.address || '';
              
              const textBody = parsed.text || '';
              const snippet = textBody.substring(0, 100).replace(/\n/g, ' ').trim();
              
              messages.push({
                messageId: parsed.messageId || `msg-${seqno}`,
                subject: parsed.subject || '(제목 없음)',
                from: fromAddress,
                to: toAddress,
                date: parsed.date || new Date(),
                snippet: snippet || '(내용 없음)',
                body: parsed.html || parsed.text || '',
                isRead: attrs.flags?.includes('\\Seen') || false,
              });
            } catch (parseErr) {
              console.error('Error parsing email:', parseErr);
            }
          });
        });
      });

      fetch.once('error', (fetchErr) => {
        imap.end();
        reject(fetchErr);
      });

      fetch.once('end', () => {
        imap.end();
        setTimeout(() => {
          messages.sort((a, b) => b.date.getTime() - a.date.getTime());
          resolve(messages);
        }, 500);
      });
    });
  });
}

export async function testImapConnection(config: ImapConfig): Promise<{ success: boolean; message: string; folders?: string[] }> {
  try {
    const imap = await createImapConnection(config);
    
    return new Promise((resolve) => {
      imap.getBoxes((err, boxes) => {
        if (err) {
          imap.end();
          resolve({ success: false, message: `폴더 목록 가져오기 실패: ${err.message}` });
          return;
        }
        
        const folders = Object.keys(boxes);
        imap.end();
        resolve({ success: true, message: 'IMAP 연결 성공', folders });
      });
    });
  } catch (err: any) {
    return { success: false, message: `IMAP 연결 실패: ${err.message}` };
  }
}
