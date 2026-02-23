import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// Get Gmail user profile (email address)
export async function getGmailProfile() {
  const gmail = await getUncachableGmailClient();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data;
}

// Send email with optional CC support
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  mimeType: string;
}

export async function sendEmail(to: string, subject: string, body: string, threadId?: string, cc?: string[], attachments?: EmailAttachment[], replyHeaders?: { inReplyTo?: string; references?: string[] }) {
  const gmail = await getUncachableGmailClient();
  
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.data.emailAddress;
  
  let rawMessage: string;
  
  if (attachments && attachments.length > 0) {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2)}`;
    
    const headerParts = [
      `From: ${from}`,
      `To: ${to}`,
    ];
    if (cc && cc.length > 0) {
      headerParts.push(`Cc: ${cc.join(', ')}`);
    }
    if (replyHeaders?.inReplyTo) {
      headerParts.push(`In-Reply-To: ${replyHeaders.inReplyTo}`);
    }
    if (replyHeaders?.references && replyHeaders.references.length > 0) {
      headerParts.push(`References: ${replyHeaders.references.join(' ')}`);
    }
    headerParts.push(
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body).toString('base64'),
    );
    
    for (const att of attachments) {
      headerParts.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="=?UTF-8?B?${Buffer.from(att.filename).toString('base64')}?="`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="=?UTF-8?B?${Buffer.from(att.filename).toString('base64')}?="`,
        '',
        att.content.toString('base64'),
      );
    }
    
    headerParts.push(`--${boundary}--`);
    rawMessage = headerParts.join('\r\n');
  } else {
    const messageParts = [
      `From: ${from}`,
      `To: ${to}`,
    ];
    if (cc && cc.length > 0) {
      messageParts.push(`Cc: ${cc.join(', ')}`);
    }
    if (replyHeaders?.inReplyTo) {
      messageParts.push(`In-Reply-To: ${replyHeaders.inReplyTo}`);
    }
    if (replyHeaders?.references && replyHeaders.references.length > 0) {
      messageParts.push(`References: ${replyHeaders.references.join(' ')}`);
    }
    messageParts.push(
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      body
    );
    rawMessage = messageParts.join('\n');
  }
  
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const request: any = {
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      threadId: threadId || undefined
    }
  };
  
  const response = await gmail.users.messages.send(request);
  return response.data;
}

// List messages from inbox
export async function listMessages(query?: string, maxResults: number = 50) {
  const gmail = await getUncachableGmailClient();
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query || undefined
  });
  
  return response.data.messages || [];
}

// Get full message details
export async function getMessage(messageId: string) {
  const gmail = await getUncachableGmailClient();
  
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });
  
  return response.data;
}

// Parse message headers including CC
export function parseMessageHeaders(message: any) {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  
  // Parse CC header into array of emails
  const ccHeader = getHeader('Cc');
  const ccEmails = ccHeader 
    ? ccHeader.split(',').map((email: string) => {
        // Extract email from "Name <email@domain.com>" format
        const match = email.trim().match(/<([^>]+)>/) || [null, email.trim()];
        return match[1];
      }).filter(Boolean)
    : [];
  
  return {
    from: getHeader('From'),
    to: getHeader('To'),
    cc: ccHeader,
    ccEmails,
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    messageId: getHeader('Message-ID'),
    inReplyTo: getHeader('In-Reply-To'),
    references: getHeader('References')
  };
}

// Get message body (HTML or plain text)
export function getMessageBody(message: any): { html: string; text: string } {
  const payload = message.payload;
  let html = '';
  let text = '';
  
  function extractParts(parts: any[]) {
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/plain' && part.body?.data) {
        text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        extractParts(part.parts);
      }
    }
  }
  
  if (payload.parts) {
    extractParts(payload.parts);
  } else if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/html') {
      html = decoded;
    } else {
      text = decoded;
    }
  }
  
  return { html, text };
}

// Generate snippet (first 2 lines or ~100 chars)
export function generateSnippet(text: string): string {
  const cleaned = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const lines = cleaned.split(/[.!?\n]/).filter(l => l.trim()).slice(0, 2);
  const snippet = lines.join('. ').substring(0, 150);
  return snippet.length < cleaned.length ? snippet + '...' : snippet;
}

// Get threads matching a query
export async function getThreads(query?: string, maxResults: number = 50) {
  const gmail = await getUncachableGmailClient();
  
  const response = await gmail.users.threads.list({
    userId: 'me',
    maxResults,
    q: query || undefined
  });
  
  return response.data.threads || [];
}

export async function getHistoryId(): Promise<string> {
  const gmail = await getUncachableGmailClient();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.historyId || '';
}

export async function getHistory(startHistoryId: string): Promise<{ messagesAdded: { id: string; threadId: string }[]; newHistoryId: string }> {
  const gmail = await getUncachableGmailClient();
  const messagesAdded: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  let newHistoryId = startHistoryId;

  do {
    const response: any = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      pageToken,
    });

    if (response.data.historyId) {
      newHistoryId = response.data.historyId;
    }

    const histories = response.data.history || [];
    for (const h of histories) {
      if (h.messagesAdded) {
        for (const ma of h.messagesAdded) {
          if (ma.message?.id && ma.message?.threadId) {
            messagesAdded.push({ id: ma.message.id, threadId: ma.message.threadId });
          }
        }
      }
    }

    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return { messagesAdded, newHistoryId };
}

// Get full thread with all messages
export async function getThread(threadId: string) {
  const gmail = await getUncachableGmailClient();
  
  const response = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  });
  
  return response.data;
}
