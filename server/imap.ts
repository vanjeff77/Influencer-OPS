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

export interface ThreadSearchResult {
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  snippet: string;
  messageCount: number;
}

export async function searchThreads(
  config: ImapConfig, 
  searchMode: 'email' | 'subject' | 'messageId',
  query: string,
  limit: number = 20
): Promise<ThreadSearchResult[]> {
  const imap = await createImapConnection(config);
  
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', true, (err, box) => {
      if (err) {
        imap.end();
        reject(err);
        return;
      }

      let searchCriteria: any[];
      switch (searchMode) {
        case 'email':
          searchCriteria = [['OR', ['FROM', query], ['TO', query]]];
          break;
        case 'subject':
          searchCriteria = [['SUBJECT', query]];
          break;
        case 'messageId':
          searchCriteria = [['HEADER', 'MESSAGE-ID', query]];
          break;
        default:
          searchCriteria = [['OR', ['FROM', query], ['TO', query]]];
      }

      imap.search(searchCriteria, (searchErr, results) => {
        if (searchErr) {
          imap.end();
          reject(searchErr);
          return;
        }

        if (!results || results.length === 0) {
          imap.end();
          resolve([]);
          return;
        }

        const recentResults = results.slice(-limit * 3);
        const threadsMap = new Map<string, ThreadSearchResult>();
        let processedCount = 0;
        const totalToProcess = recentResults.length;

        if (totalToProcess === 0) {
          imap.end();
          resolve([]);
          return;
        }

        const fetch = imap.fetch(recentResults, {
          bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID REFERENCES IN-REPLY-TO)',
          struct: true,
        });

        fetch.on('message', (msg, seqno) => {
          let headerBuffer = '';
          
          msg.on('body', (stream) => {
            stream.on('data', (chunk) => {
              headerBuffer += chunk.toString('utf8');
            });
          });

          msg.once('end', async () => {
            try {
              const parsed = await simpleParser(headerBuffer);
              const subject = parsed.subject || '(제목 없음)';
              const threadKey = subject.replace(/^(Re:|Fwd:|RE:|FW:)\s*/gi, '').trim().toLowerCase();
              
              const fromAddress = Array.isArray(parsed.from?.value) 
                ? parsed.from.value[0]?.address || '' 
                : '';
              const toAddress = Array.isArray(parsed.to) 
                ? (parsed.to[0] as any)?.value?.[0]?.address || ''
                : (parsed.to as any)?.value?.[0]?.address || '';
              const messageId = parsed.messageId || `msg-${seqno}`;
              const date = parsed.date || new Date();

              if (threadsMap.has(threadKey)) {
                const existing = threadsMap.get(threadKey)!;
                existing.messageCount++;
                if (date > existing.date) {
                  existing.date = date;
                  existing.subject = subject;
                  existing.from = fromAddress;
                }
              } else {
                threadsMap.set(threadKey, {
                  threadId: messageId,
                  subject: subject,
                  from: fromAddress,
                  to: toAddress,
                  date: date,
                  snippet: '',
                  messageCount: 1,
                });
              }
            } catch (parseErr) {
              console.error('Error parsing header:', parseErr);
            }
            
            processedCount++;
            if (processedCount >= totalToProcess) {
              imap.end();
              const threads = Array.from(threadsMap.values())
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .slice(0, limit);
              resolve(threads);
            }
          });
        });

        fetch.once('error', (fetchErr) => {
          imap.end();
          reject(fetchErr);
        });

        fetch.once('end', () => {
          setTimeout(() => {
            if (processedCount < totalToProcess) {
              imap.end();
              const threads = Array.from(threadsMap.values())
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .slice(0, limit);
              resolve(threads);
            }
          }, 2000);
        });
      });
    });
  });
}

export async function fetchThreadMessages(
  config: ImapConfig,
  threadSubject: string
): Promise<EmailMessage[]> {
  const imap = await createImapConnection(config);
  
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', true, (err, box) => {
      if (err) {
        imap.end();
        reject(err);
        return;
      }

      const normalizedSubject = threadSubject.replace(/^(Re:|Fwd:|RE:|FW:)\s*/gi, '').trim();
      
      imap.search([['SUBJECT', normalizedSubject]], (searchErr, results) => {
        if (searchErr) {
          imap.end();
          reject(searchErr);
          return;
        }

        if (!results || results.length === 0) {
          imap.end();
          resolve([]);
          return;
        }

        const messages: EmailMessage[] = [];
        const fetch = imap.fetch(results, {
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
            messages.sort((a, b) => a.date.getTime() - b.date.getTime());
            resolve(messages);
          }, 500);
        });
      });
    });
  });
}

export interface ThreadMessage {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: Date;
  snippet: string;
  bodyHtml: string;
  bodyText: string;
  isRead: boolean;
}

async function fetchFromFolder(
  config: ImapConfig,
  folder: string,
  messageIds: string[]
): Promise<ThreadMessage[]> {
  let imap: Imap;
  try {
    imap = await createImapConnection(config);
  } catch (err) {
    console.log(`IMAP: Could not connect for folder ${folder}:`, (err as Error).message);
    return [];
  }

  return new Promise((resolve) => {
    imap.openBox(folder, true, (err) => {
      if (err) {
        imap.end();
        resolve([]);
        return;
      }

      const doSearch = (criteria: any[]): Promise<number[]> => {
        return new Promise((res) => {
          imap.search(criteria, (err, results) => {
            res(err || !results ? [] : results);
          });
        });
      };

      const searchAll = async () => {
        const allResults = new Set<number>();
        for (const mid of messageIds) {
          const r1 = await doSearch([['HEADER', 'MESSAGE-ID', mid]]);
          const r2 = await doSearch([['HEADER', 'IN-REPLY-TO', mid]]);
          const r3 = await doSearch([['HEADER', 'REFERENCES', mid]]);
          for (const r of [...r1, ...r2, ...r3]) allResults.add(r);
        }
        return Array.from(allResults);
      };

      searchAll().then((results) => {
        if (!results || results.length === 0) {
          imap.end();
          resolve([]);
          return;
        }

        const messages: ThreadMessage[] = [];
        const fetch = imap.fetch(results, { bodies: '', struct: true });

        fetch.on('message', (msg) => {
          let buffer = '';
          msg.on('body', (stream) => {
            stream.on('data', (chunk: Buffer) => {
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
                const ccValue = Array.isArray(parsed.cc)
                  ? parsed.cc.map((c: any) => c.value?.map((v: any) => v.address).join(', ')).join(', ')
                  : (parsed.cc as any)?.value?.map((v: any) => v.address).join(', ') || '';

                const refs = parsed.references
                  ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
                  : [];

                const textBody = parsed.text || '';
                const snippet = textBody.substring(0, 150).replace(/\n/g, ' ').trim();

                messages.push({
                  messageId: parsed.messageId || '',
                  inReplyTo: (parsed.inReplyTo as string) || null,
                  references: refs as string[],
                  subject: parsed.subject || '(제목 없음)',
                  from: fromAddress,
                  to: toAddress,
                  cc: ccValue,
                  date: parsed.date || new Date(),
                  snippet: snippet || '(내용 없음)',
                  bodyHtml: parsed.html || parsed.text || '',
                  bodyText: parsed.text || '',
                  isRead: attrs.flags?.includes('\\Seen') || false,
                });
              } catch (parseErr) {
                console.error('Error parsing email in fetchFromFolder:', parseErr);
              }
            });
          });
        });

        fetch.once('error', () => {
          imap.end();
          resolve([]);
        });

        fetch.once('end', () => {
          imap.end();
          setTimeout(() => {
            messages.sort((a, b) => a.date.getTime() - b.date.getTime());
            resolve(messages);
          }, 300);
        });
      });
    });
  });
}

export async function fetchThreadByMessageIds(
  config: ImapConfig,
  messageIds: string[],
  sentFolder?: string
): Promise<ThreadMessage[]> {
  if (!messageIds.length) return [];

  const inboxMessages = await fetchFromFolder(config, 'INBOX', messageIds);

  const sentFolders = sentFolder
    ? [sentFolder]
    : ['[Gmail]/Sent Mail', '[Gmail]/보낸편지함', 'Sent', 'INBOX.Sent', 'Sent Messages'];

  let sentMessages: ThreadMessage[] = [];
  for (const folder of sentFolders) {
    try {
      sentMessages = await fetchFromFolder(config, folder, messageIds);
      if (sentMessages.length > 0) break;
    } catch {
      continue;
    }
  }

  const allMessages = [...inboxMessages, ...sentMessages];
  const seen = new Set<string>();
  const unique = allMessages.filter(m => {
    if (!m.messageId || seen.has(m.messageId)) return false;
    seen.add(m.messageId);
    return true;
  });

  unique.sort((a, b) => a.date.getTime() - b.date.getTime());

  const knownIds = new Set(messageIds.map(id => id.toLowerCase()));
  for (const msg of unique) {
    if (msg.messageId) knownIds.add(msg.messageId.toLowerCase());
  }

  const newRefs = unique
    .flatMap(m => [m.inReplyTo, ...m.references])
    .filter((r): r is string => !!r && !knownIds.has(r.toLowerCase()));

  if (newRefs.length > 0) {
    const uniqueNewRefs = Array.from(new Set(newRefs));
    const extraInbox = await fetchFromFolder(config, 'INBOX', uniqueNewRefs);
    for (const m of extraInbox) {
      if (m.messageId && !seen.has(m.messageId)) {
        seen.add(m.messageId);
        unique.push(m);
      }
    }
    for (const folder of sentFolders) {
      try {
        const extraSent = await fetchFromFolder(config, folder, uniqueNewRefs);
        for (const m of extraSent) {
          if (m.messageId && !seen.has(m.messageId)) {
            seen.add(m.messageId);
            unique.push(m);
          }
        }
        if (extraSent.length > 0) break;
      } catch {
        continue;
      }
    }
    unique.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  return unique;
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
