import { storage } from "./storage";
import * as gmail from "./gmail";
import type { EmailAccount } from "@shared/schema";
import { notifyInboundEmail } from "./slack-bot";

let isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

const SYNC_INTERVAL_MS = 1 * 60 * 1000;

async function triggerAiDraftGeneration(conversationId: number, triggerMessageId: number) {
  try {
    const existing = await storage.getDraftByTriggerMessage(triggerMessageId);
    if (existing) return;

    const conv = await storage.getConversation(conversationId);
    if (!conv) return;

    const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
    if (!lineItem) return;

    const campaign = await storage.getCampaign(lineItem.campaignId);
    if (!campaign) return;

    const allWorkspaces = await storage.getWorkspaces();
    const workspace = allWorkspaces.find(w => w.id === campaign.workspaceId);
    if (!workspace) return;

    if (!workspace.aiDraftEnabled) {
      notifyInboundEmail(conversationId, triggerMessageId).catch(err => {
        console.error('[AutoDraft] Slack notification failed (no AI):', err);
      });
      return;
    }

    const messages = await storage.getConversationMessages(conversationId);
    if (messages.length === 0) return;

    const { generateEmailDraft } = await import('./ai/draft-generator');
    const result = await generateEmailDraft(
      messages,
      lineItem.influencer || {},
      campaign,
      workspace,
      lineItem.offerFee,
    );

    const createdDraft = await storage.createAiDraft({
      conversationId,
      triggerMessageId,
      draft: result.draft,
      classification: result.classification,
      classificationLabel: result.classificationLabel,
      alternatives: result.alternatives ? JSON.stringify(result.alternatives) : undefined,
      status: 'pending',
    });

    console.log(`[AutoDraft] Generated AI draft for conversation ${conversationId}, classification: ${result.classification}`);

    notifyInboundEmail(conversationId, triggerMessageId).catch(err => {
      console.error('[AutoDraft] Slack notification failed:', err);
    });
  } catch (err) {
    console.error(`[AutoDraft] Failed to generate draft for conversation ${conversationId}:`, err);
    notifyInboundEmail(conversationId, triggerMessageId).catch(slackErr => {
      console.error('[AutoDraft] Slack notification failed (after AI error):', slackErr);
    });
  }
}

async function syncThreadToConversation(conversationId: number, gmailThreadId: string, account: EmailAccount): Promise<number> {
  const thread = await gmail.getThread(gmailThreadId);
  if (!thread.messages) return 0;

  const existingMessages = await storage.getConversationMessages(conversationId);
  const existingGmailIds = new Set(existingMessages.map(m => m.gmailMessageId).filter(Boolean));
  let synced = 0;

  for (const msg of thread.messages) {
    const msgId = msg.id;
    if (!msgId || existingGmailIds.has(msgId)) continue;

    const headers = gmail.parseMessageHeaders(msg);
    const gmailMsgId = headers.messageId;
    if (gmailMsgId && existingGmailIds.has(gmailMsgId)) continue;

    const body = gmail.getMessageBody(msg);
    const isOutbound = headers.from?.toLowerCase().includes(account.email.toLowerCase());

    const createdMsg = await storage.createConversationMessage({
      conversationId,
      direction: isOutbound ? 'outbound' : 'inbound',
      senderEmail: headers.from || null,
      senderName: null,
      recipientEmail: headers.to || null,
      ccEmails: headers.ccEmails?.length > 0 ? headers.ccEmails : null,
      snippet: gmail.generateSnippet(body.text || body.html),
      bodyHtml: body.html || null,
      bodyText: body.text || null,
      gmailMessageId: gmailMsgId || msgId,
      gmailThreadId,
      sendStatus: 'sent',
      receivedAt: headers.date ? new Date(headers.date) : new Date(),
    });

    existingGmailIds.add(gmailMsgId || msgId);
    synced++;

    if (!isOutbound) {
      await storage.updateConversation(conversationId, {
        status: 'replied',
        lastMessageAt: headers.date ? new Date(headers.date) : new Date(),
      });
      if (createdMsg) {
        triggerAiDraftGeneration(conversationId, createdMsg.id).catch(() => {});
      }
    }
  }

  return synced;
}

async function syncGmailAccountIncremental(account: EmailAccount): Promise<{ synced: number; accountEmail: string }> {
  const result = { synced: 0, accountEmail: account.email };

  try {
    if (!account.lastHistoryId) {
      const historyId = await gmail.getHistoryId();
      if (historyId) {
        await storage.updateEmailAccountHistoryId(account.id, historyId);
        console.log(`[AutoSync] Bootstrapped historyId for ${account.email}: ${historyId}`);
      }
      return result;
    }

    let historyResult;
    try {
      historyResult = await gmail.getHistory(account.lastHistoryId);
    } catch (err: any) {
      if (err?.code === 404 || err?.response?.status === 404) {
        console.log(`[AutoSync] HistoryId expired for ${account.email}, running thread-based backfill...`);
        const newHistoryId = await gmail.getHistoryId();
        if (newHistoryId) {
          await storage.updateEmailAccountHistoryId(account.id, newHistoryId);
        }
        try {
          const allConvs = await storage.getAllActiveConversationsWithGmailThread();
          for (const conv of allConvs) {
            if (!conv.gmailThreadId) continue;
            try {
              const synced = await syncThreadToConversation(conv.id, conv.gmailThreadId, account);
              result.synced += synced;
            } catch (threadErr) {
              console.warn(`[AutoSync] Backfill thread ${conv.gmailThreadId} failed:`, threadErr);
            }
          }
        } catch (backfillErr) {
          console.warn(`[AutoSync] Backfill failed:`, backfillErr);
        }
        return result;
      }
      throw err;
    }

    const { messagesAdded, newHistoryId } = historyResult;

    if (messagesAdded.length === 0) {
      await storage.updateEmailAccountHistoryId(account.id, newHistoryId);
      return result;
    }

    const threadIds = [...new Set(messagesAdded.map(m => m.threadId))];
    console.log(`[AutoSync] ${account.email}: ${messagesAdded.length} new messages in ${threadIds.length} threads`);

    let noThreadConvs: { id: number; emailAccountId: number | null; influencerEmail: string | null; campaignLineItemId: number }[] | null = null;

    for (const threadId of threadIds) {
      try {
        let conv = await storage.getConversationByGmailThreadId(threadId);

        if (!conv) {
          if (!noThreadConvs) {
            noThreadConvs = await storage.getConversationsWithoutGmailThread();
          }
          if (noThreadConvs.length > 0) {
            try {
              const firstMsgId = messagesAdded.find(m => m.threadId === threadId)?.id;
              if (firstMsgId) {
                const fullMsg = await gmail.getMessage(firstMsgId);
                const headers = gmail.parseMessageHeaders(fullMsg);
                const fromEmail = headers.from?.match(/<([^>]+)>/)?.[1]?.toLowerCase() || headers.from?.toLowerCase() || '';
                const toEmail = headers.to?.match(/<([^>]+)>/)?.[1]?.toLowerCase() || headers.to?.toLowerCase() || '';

                const extractEmail = (raw: string) => {
                  const m = raw.match(/<([^>]+)>/);
                  return m ? m[1].toLowerCase().trim() : raw.toLowerCase().trim();
                };
                const fromAddr = extractEmail(headers.from || '');
                const toAddr = extractEmail(headers.to || '');

                const matched = noThreadConvs.find(c => {
                  if (!c.influencerEmail) return false;
                  if (c.emailAccountId !== account.id) return false;
                  const emails = c.influencerEmail.toLowerCase().split(/[,\s]+/).map(e => e.trim()).filter(Boolean);
                  return emails.some(e => e === fromAddr || e === toAddr);
                });

                if (matched) {
                  await storage.updateConversation(matched.id, { gmailThreadId: threadId });
                  conv = await storage.getConversation(matched.id) as any;
                  noThreadConvs = noThreadConvs.filter(c => c.id !== matched.id);
                  console.log(`[AutoSync] Matched thread ${threadId} to conversation ${matched.id} via email ${fromEmail}`);

                  if (headers.subject && conv) {
                    const currentSubject = (conv as any).subjectPrefix || '';
                    const inboundSubject = headers.subject.replace(/^Re:\s*/i, '').trim();
                    if (inboundSubject && inboundSubject !== currentSubject) {
                      await storage.updateConversation(matched.id, { subjectPrefix: inboundSubject });
                    }
                  }
                }
              }
            } catch (matchErr) {
              console.warn(`[AutoSync] Failed to match thread ${threadId} by email:`, matchErr);
            }
          }
          if (!conv) continue;
        }

        const newMsgIds = messagesAdded
          .filter(m => m.threadId === threadId)
          .map(m => m.id);

        const existingMessages = await storage.getConversationMessages(conv.id);
        const existingGmailIds = new Set(existingMessages.map(m => m.gmailMessageId).filter(Boolean));

        for (const msgId of newMsgIds) {
          if (existingGmailIds.has(msgId)) continue;

          try {
            const fullMsg = await gmail.getMessage(msgId);
            const headers = gmail.parseMessageHeaders(fullMsg);
            const body = gmail.getMessageBody(fullMsg);

            const gmailMsgId = headers.messageId;
            if (gmailMsgId && existingGmailIds.has(gmailMsgId)) continue;

            const isOutbound = headers.from?.toLowerCase().includes(account.email.toLowerCase());

            const createdMsg = await storage.createConversationMessage({
              conversationId: conv.id,
              direction: isOutbound ? 'outbound' : 'inbound',
              senderEmail: headers.from || null,
              senderName: null,
              recipientEmail: headers.to || null,
              ccEmails: headers.ccEmails?.length > 0 ? headers.ccEmails : null,
              snippet: gmail.generateSnippet(body.text || body.html),
              bodyHtml: body.html || null,
              bodyText: body.text || null,
              gmailMessageId: gmailMsgId || msgId,
              gmailThreadId: threadId,
              sendStatus: 'sent',
              receivedAt: headers.date ? new Date(headers.date) : new Date(),
            });

            existingGmailIds.add(gmailMsgId || msgId);
            result.synced++;

            if (!isOutbound) {
              const updateData: any = {
                status: 'replied',
                lastMessageAt: headers.date ? new Date(headers.date) : new Date(),
              };
              if (headers.subject) {
                const cleanSubject = headers.subject.replace(/^Re:\s*/i, '').trim();
                if (cleanSubject) {
                  updateData.subjectPrefix = cleanSubject;
                }
              }
              await storage.updateConversation(conv.id, updateData);
              if (createdMsg) {
                triggerAiDraftGeneration(conv.id, createdMsg.id).catch(() => {});
              }
            }
          } catch (msgErr) {
            console.warn(`[AutoSync] Failed to fetch message ${msgId}:`, msgErr);
          }
        }
      } catch (threadErr) {
        console.warn(`[AutoSync] Failed to process thread ${threadId}:`, threadErr);
      }
    }

    await storage.updateEmailAccountHistoryId(account.id, newHistoryId);
  } catch (err) {
    console.error(`[AutoSync] Error syncing ${account.email}:`, err);
  }

  return result;
}

async function syncImapAccountConversations(account: EmailAccount): Promise<number> {
  let totalSynced = 0;

  try {
    const { getImapSmtpSettings } = await import('./smtp');
    const { imapHost, imapPort: imapPortNum, imapPassword: encPwd } = getImapSmtpSettings(account);
    if (!imapHost || !encPwd) return 0;

    const imap = await import('./imap');
    const password = imap.decryptPassword(encPwd);
    const imapConfig = { user: account.email, password, host: imapHost, port: imapPortNum, tls: true };

    const activeConvs = await storage.getActiveConversationsForImapSync(account.id, account.email);
    if (activeConvs.length === 0) return 0;

    const convDataMap = new Map<number, { conv: typeof activeConvs[0]; existingMessages: any[]; knownMsgIds: string[] }>();
    const allKnownMsgIds: string[] = [];
    const msgIdToConvId = new Map<string, number>();

    for (const conv of activeConvs) {
      if (conv.emailAccountId === null) {
        await storage.updateConversation(conv.id, { emailAccountId: account.id });
      }

      const existingMessages = await storage.getConversationMessages(conv.id);
      const knownMsgIds = existingMessages
        .map(m => m.gmailMessageId)
        .filter((id): id is string => !!id && id.startsWith('<'));

      if (knownMsgIds.length === 0) continue;

      convDataMap.set(conv.id, { conv, existingMessages, knownMsgIds });
      for (const mid of knownMsgIds) {
        allKnownMsgIds.push(mid);
        msgIdToConvId.set(mid.toLowerCase(), conv.id);
      }
    }

    if (allKnownMsgIds.length === 0) return 0;

    console.log(`[AutoSync-IMAP] ${account.email}: checking ${allKnownMsgIds.length} message IDs across ${convDataMap.size} conversations`);

    let allImapMessages: any[] = [];
    try {
      allImapMessages = await imap.fetchInboxReplies(imapConfig, allKnownMsgIds, 45000);
    } catch (imapErr) {
      console.warn(`[AutoSync-IMAP] IMAP fetch failed for ${account.email}:`, imapErr);
      return 0;
    }

    if (allImapMessages.length === 0) return 0;

    const msgToConv = new Map<any, number>();
    for (const msg of allImapMessages) {
      let convId: number | undefined;

      if (msg.inReplyTo) {
        convId = msgIdToConvId.get(msg.inReplyTo.toLowerCase());
      }
      if (!convId && msg.references?.length) {
        for (const ref of msg.references) {
          convId = msgIdToConvId.get(ref.toLowerCase());
          if (convId) break;
        }
      }
      if (!convId && msg.messageId) {
        convId = msgIdToConvId.get(msg.messageId.toLowerCase());
      }

      if (convId) {
        msgToConv.set(msg, convId);
        if (msg.messageId) {
          msgIdToConvId.set(msg.messageId.toLowerCase(), convId);
        }
      }
    }

    for (const [msg, convId] of msgToConv) {
      const data = convDataMap.get(convId);
      if (!data) continue;

      const existingMsgIds = new Set(data.existingMessages.map(m => m.gmailMessageId).filter(Boolean));
      if (msg.messageId && existingMsgIds.has(msg.messageId)) continue;

      const existingFingerprints = new Set(
        data.existingMessages.map(m => {
          const sender = (m.senderEmail || '').toLowerCase().trim();
          const date = m.receivedAt ? new Date(m.receivedAt).getTime() : (m.sentAt ? new Date(m.sentAt).getTime() : 0);
          const snip = (m.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return `${sender}|${date}|${snip}`;
        }).filter(f => f !== '|0|')
      );

      const msgSender = (msg.from || '').toLowerCase().trim();
      const msgDate = msg.date ? msg.date.getTime() : 0;
      const msgSnip = (msg.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const fingerprint = `${msgSender}|${msgDate}|${msgSnip}`;
      if (existingFingerprints.has(fingerprint)) continue;

      const isOutbound = msgSender.includes(account.email.toLowerCase());

      try {
        const createdMsg = await storage.createConversationMessage({
          conversationId: convId,
          direction: isOutbound ? 'outbound' : 'inbound',
          senderEmail: msg.from || null,
          senderName: null,
          recipientEmail: msg.to || null,
          snippet: msg.snippet || null,
          bodyHtml: msg.bodyHtml || null,
          bodyText: msg.bodyText || null,
          gmailMessageId: msg.messageId || null,
          gmailThreadId: null,
          sendStatus: 'sent',
          receivedAt: msg.date || new Date(),
        });

        data.existingMessages.push(createdMsg);
        totalSynced++;

        if (!isOutbound) {
          await storage.updateConversation(convId, {
            status: 'replied',
            lastMessageAt: msg.date || new Date(),
          });
          if (createdMsg) {
            triggerAiDraftGeneration(convId, createdMsg.id).catch(() => {});
          }
        }
      } catch (saveErr) {
        console.warn(`[AutoSync-IMAP] Error saving message for conversation ${convId}:`, saveErr);
      }
    }

    if (totalSynced > 0) {
      console.log(`[AutoSync-IMAP] ${account.email}: synced ${totalSynced} new messages across ${activeConvs.length} conversations`);
    }
  } catch (err) {
    console.error(`[AutoSync-IMAP] Error syncing ${account.email}:`, err);
  }

  return totalSynced;
}

async function runSyncCycle() {
  if (isSyncing) {
    console.log('[AutoSync] Previous cycle still running, skipping...');
    return;
  }

  isSyncing = true;
  try {
    let totalSynced = 0;

    const gmailAccounts = await storage.getAllGmailAccounts();
    for (const account of gmailAccounts) {
      const result = await syncGmailAccountIncremental(account);
      totalSynced += result.synced;
    }

    const imapAccounts = await storage.getAllImapAccounts();
    for (const account of imapAccounts) {
      const synced = await syncImapAccountConversations(account);
      totalSynced += synced;
    }

    if (totalSynced > 0) {
      console.log(`[AutoSync] Cycle complete: ${totalSynced} new messages synced`);
    }
  } catch (err) {
    console.error('[AutoSync] Cycle error:', err);
  } finally {
    isSyncing = false;
  }
}

export function startAutoSync() {
  if (syncInterval) return;

  console.log(`[AutoSync] Starting auto-sync every ${SYNC_INTERVAL_MS / 1000}s`);

  setTimeout(() => runSyncCycle(), 10000);

  syncInterval = setInterval(() => runSyncCycle(), SYNC_INTERVAL_MS);
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[AutoSync] Stopped');
  }
}

export async function syncCampaignConversations(campaignId: number): Promise<{ synced: number; total: number; errors: number }> {
  const campaignData = await storage.getCampaign(campaignId);
  if (!campaignData) throw new Error('Campaign not found');

  const conversations = await storage.getConversationsByCampaign(campaignId);
  const gmailConvs = conversations.filter(c => c.gmailThreadId);

  if (gmailConvs.length === 0) {
    return { synced: 0, total: 0, errors: 0 };
  }

  let totalSynced = 0;
  let errors = 0;

  const accounts = await storage.getAllGmailAccounts();
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const defaultAccount = accounts[0];

  if (!defaultAccount) {
    return { synced: 0, total: gmailConvs.length, errors: 0 };
  }

  for (const conv of gmailConvs) {
    try {
      if (!conv.gmailThreadId) continue;
      const account = (conv.emailAccountId && accountMap.get(conv.emailAccountId)) || defaultAccount;
      const synced = await syncThreadToConversation(conv.id, conv.gmailThreadId, account);
      totalSynced += synced;
    } catch (err) {
      console.warn(`[SyncAll] Error syncing conversation ${conv.id}:`, err);
      errors++;
    }
  }

  return { synced: totalSynced, total: gmailConvs.length, errors };
}
