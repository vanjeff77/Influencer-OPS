import { google, gmail_v1 } from 'googleapis';

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

export function getAuthUrl(redirectUri: string, state?: string) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const client = createOAuth2Client();
  client.redirectUri = redirectUri;
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getGoogleUserInfo(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google user info');
  return res.json() as Promise<{
    id: string;
    email: string;
    name: string;
    picture?: string;
  }>;
}

export function getGmailClientForAccount(refreshToken: string): gmail_v1.Gmail {
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: client });
}

export async function getGmailProfileForAccount(refreshToken: string) {
  const gmail = getGmailClientForAccount(refreshToken);
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  mimeType: string;
}

function buildRawMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  cc?: string[],
  replyHeaders?: { inReplyTo?: string; references?: string[] },
  attachments?: EmailAttachment[]
): string {
  if (attachments && attachments.length > 0) {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2)}`;
    const headerParts = [`From: ${from}`, `To: ${to}`];
    if (cc && cc.length > 0) headerParts.push(`Cc: ${cc.join(', ')}`);
    if (replyHeaders?.inReplyTo) headerParts.push(`In-Reply-To: ${replyHeaders.inReplyTo}`);
    if (replyHeaders?.references && replyHeaders.references.length > 0)
      headerParts.push(`References: ${replyHeaders.references.join(' ')}`);
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
    return headerParts.join('\r\n');
  } else {
    const messageParts = [`From: ${from}`, `To: ${to}`];
    if (cc && cc.length > 0) messageParts.push(`Cc: ${cc.join(', ')}`);
    if (replyHeaders?.inReplyTo) messageParts.push(`In-Reply-To: ${replyHeaders.inReplyTo}`);
    if (replyHeaders?.references && replyHeaders.references.length > 0)
      messageParts.push(`References: ${replyHeaders.references.join(' ')}`);
    messageParts.push(
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body).toString('base64'),
    );
    return messageParts.join('\r\n');
  }
}

function encodeRawMessage(rawMessage: string): string {
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendEmailForAccount(
  refreshToken: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string,
  cc?: string[],
  replyHeaders?: { inReplyTo?: string; references?: string[] },
  attachments?: EmailAttachment[]
): Promise<{ id: string; threadId: string; messageId: string }> {
  const gmail = getGmailClientForAccount(refreshToken);
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.data.emailAddress || '';

  const rawMessage = buildRawMessage(from, to, subject, body, cc, replyHeaders, attachments);
  const encodedMessage = encodeRawMessage(rawMessage);

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      threadId: threadId || undefined,
    },
  });

  const sentId = response.data.id || '';
  const sentThreadId = response.data.threadId || '';

  let rfc822MessageId = '';
  try {
    const sentMsg = await gmail.users.messages.get({
      userId: 'me',
      id: sentId,
      format: 'metadata',
      metadataHeaders: ['Message-ID'],
    });
    const msgIdHeader = sentMsg.data.payload?.headers?.find(
      (h: any) => h.name?.toLowerCase() === 'message-id'
    );
    rfc822MessageId = msgIdHeader?.value || '';
  } catch (e) {
    // fallback: use gmail internal id
  }

  return { id: sentId, threadId: sentThreadId, messageId: rfc822MessageId };
}

// === Legacy Replit Connector functions (backward compatibility) ===

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
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

export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function getGmailProfile() {
  const gmail = await getUncachableGmailClient();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data;
}

export async function sendEmail(to: string, subject: string, body: string, threadId?: string, cc?: string[], attachments?: EmailAttachment[], replyHeaders?: { inReplyTo?: string; references?: string[] }) {
  const gmail = await getUncachableGmailClient();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.data.emailAddress || '';

  const rawMessage = buildRawMessage(from, to, subject, body, cc, replyHeaders, attachments);
  const encodedMessage = encodeRawMessage(rawMessage);

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      threadId: threadId || undefined,
    },
  });

  return response.data;
}

export async function listMessages(query?: string, maxResults: number = 50) {
  const gmail = await getUncachableGmailClient();
  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query || undefined
  });
  return response.data.messages || [];
}

export async function getMessage(messageId: string) {
  const gmail = await getUncachableGmailClient();
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });
  return response.data;
}

export function parseMessageHeaders(message: any) {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  
  const ccHeader = getHeader('Cc');
  const ccEmails = ccHeader 
    ? ccHeader.split(',').map((email: string) => {
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

export function generateSnippet(text: string): string {
  const cleaned = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const lines = cleaned.split(/[.!?\n]/).filter(l => l.trim()).slice(0, 2);
  const snippet = lines.join('. ').substring(0, 150);
  return snippet.length < cleaned.length ? snippet + '...' : snippet;
}

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

export async function getThread(threadId: string) {
  const gmail = await getUncachableGmailClient();
  const response = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  });
  return response.data;
}

// === Per-account versions of Gmail API functions ===

export async function getHistoryIdForAccount(refreshToken: string): Promise<string> {
  const gmail = getGmailClientForAccount(refreshToken);
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.historyId || '';
}

export async function getHistoryForAccount(refreshToken: string, startHistoryId: string): Promise<{ messagesAdded: { id: string; threadId: string }[]; newHistoryId: string }> {
  const gmail = getGmailClientForAccount(refreshToken);
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

export async function getMessageForAccount(refreshToken: string, messageId: string) {
  const gmail = getGmailClientForAccount(refreshToken);
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });
  return response.data;
}

export async function getThreadForAccount(refreshToken: string, threadId: string) {
  const gmail = getGmailClientForAccount(refreshToken);
  const response = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  });
  return response.data;
}

export async function getThreadsForAccount(refreshToken: string, query?: string, maxResults: number = 50) {
  const gmail = getGmailClientForAccount(refreshToken);
  const response = await gmail.users.threads.list({
    userId: 'me',
    maxResults,
    q: query || undefined
  });
  return response.data.threads || [];
}

export async function listMessagesForAccount(refreshToken: string, query?: string, maxResults: number = 50) {
  const gmail = getGmailClientForAccount(refreshToken);
  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query || undefined
  });
  return response.data.messages || [];
}

export async function resolveThreadIdFromMessageId(refreshToken: string, rfc822MessageId: string): Promise<string | null> {
  const cleanId = rfc822MessageId.trim().replace(/^<|>$/g, '');
  const msgs = await listMessagesForAccount(refreshToken, `rfc822msgid:${cleanId}`, 1);
  if (msgs.length > 0 && msgs[0].id) {
    const fullMsg = await getMessageForAccount(refreshToken, msgs[0].id);
    return fullMsg.threadId || null;
  }
  return null;
}
