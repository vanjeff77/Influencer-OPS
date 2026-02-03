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
export async function sendEmail(to: string, subject: string, body: string, threadId?: string, cc?: string[]) {
  const gmail = await getUncachableGmailClient();
  
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const from = profile.data.emailAddress;
  
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
  ];
  
  // Add CC header if provided
  if (cc && cc.length > 0) {
    messageParts.push(`Cc: ${cc.join(', ')}`);
  }
  
  messageParts.push(
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body
  );
  
  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
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
