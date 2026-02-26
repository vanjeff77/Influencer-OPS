import { storage } from "./storage";
import * as gmail from "./gmail";
import type { EmailAccount } from "@shared/schema";

let isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

const SYNC_INTERVAL_MS = 3 * 60 * 1000;

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
    if (!workspace || !workspace.aiDraftEnabled) return;

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

    await storage.createAiDraft({
      conversationId,
      triggerMessageId,
      draft: result.draft,
      classification: result.classification,
      classificationLabel: result.classificationLabel,
      status: 'pending',
    });

    console.log(`[AutoDraft] Generated AI draft for conversation ${conversationId}, classification: ${result.classification}`);
  } catch (err) {
    console.error(`[AutoDraft] Failed to generate draft for conversation ${conversationId}:`, err);
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

    for (const threadId of threadIds) {
      try {
        const conv = await storage.getConversationByGmailThreadId(threadId);
        if (!conv) continue;

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
              await storage.updateConversation(conv.id, {
                status: 'replied',
                lastMessageAt: headers.date ? new Date(headers.date) : new Date(),
              });
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

async function runSyncCycle() {
  if (isSyncing) {
    console.log('[AutoSync] Previous cycle still running, skipping...');
    return;
  }

  isSyncing = true;
  try {
    const accounts = await storage.getAllGmailAccounts();
    if (accounts.length === 0) return;

    let totalSynced = 0;
    for (const account of accounts) {
      const result = await syncGmailAccountIncremental(account);
      totalSynced += result.synced;
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
