import { storage } from "./storage";
import type { Workspace } from "@shared/schema";

interface SlackBlock {
  type: string;
  text?: any;
  elements?: any[];
  accessory?: any;
  block_id?: string;
  fields?: any[];
}

interface InboundEmailContext {
  workspaceId: number;
  conversationId: number;
  messageId: number;
  influencerName: string;
  influencerEmail: string;
  campaignName: string;
  campaignId: number;
  emailBody: string;
  senderEmail: string;
  clientSlackChannelId?: string | null;
  lineItemStatus?: string | null;
  slackMentionUserIds?: string | null;
}

interface AiDraftContext {
  draftId: number;
  draft: string;
  classification: string;
  classificationLabel: string;
  alternatives?: { classification: string; classificationLabel: string }[];
}

function truncateForSlack(text: string, maxLen = 2900): string {
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

function textToRichTextBlock(text: string): any {
  const lines = text.split('\n');
  const elements: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) elements.push({ type: "text", text: "\n" });
    elements.push({ type: "text", text: lines[i] || "" });
  }
  if (elements.length === 0) {
    elements.push({ type: "text", text: "" });
  }
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements }],
  };
}

function richTextBlockToHtml(richText: any): string {
  if (!richText?.elements) return '';
  const parts: string[] = [];
  for (const block of richText.elements) {
    if (block.type === 'rich_text_section') {
      parts.push(richTextSectionToHtml(block.elements || []));
    } else if (block.type === 'rich_text_list') {
      const tag = block.style === 'ordered' ? 'ol' : 'ul';
      const items = (block.elements || []).map((item: any) => {
        return `<li>${richTextSectionToHtml(item.elements || [])}</li>`;
      }).join('');
      parts.push(`<${tag}>${items}</${tag}>`);
    } else if (block.type === 'rich_text_preformatted') {
      parts.push(`<pre>${richTextSectionToHtml(block.elements || [])}</pre>`);
    } else if (block.type === 'rich_text_quote') {
      parts.push(`<blockquote>${richTextSectionToHtml(block.elements || [])}</blockquote>`);
    }
  }
  return parts.join('');
}

function richTextSectionToHtml(elements: any[]): string {
  return elements.map((el: any) => {
    if (el.type === 'text') {
      let html = (el.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      if (el.style?.bold) html = `<b>${html}</b>`;
      if (el.style?.italic) html = `<i>${html}</i>`;
      if (el.style?.strike) html = `<s>${html}</s>`;
      if (el.style?.code) html = `<code>${html}</code>`;
      return html;
    } else if (el.type === 'link') {
      const linkText = el.text || el.url || '';
      return `<a href="${el.url}">${linkText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`;
    } else if (el.type === 'emoji') {
      return el.unicode ? String.fromCodePoint(...el.unicode.split('-').map((h: string) => parseInt(h, 16))) : `:${el.name}:`;
    }
    return '';
  }).join('');
}

function richTextBlockToPlainText(richText: any): string {
  if (!richText?.elements) return '';
  return richText.elements.map((block: any) => {
    const els = block.elements || [];
    return els.map((el: any) => el.text || el.url || '').join('');
  }).join('\n');
}

const contentCache = new Map<string, { data: string; expiry: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function setCacheEntry(key: string, data: string): void {
  if (contentCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of contentCache) {
      if (now > v.expiry) contentCache.delete(k);
    }
    if (contentCache.size > 500) {
      const oldest = contentCache.keys().next().value;
      if (oldest) contentCache.delete(oldest);
    }
  }
  contentCache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

function getCacheEntry(key: string): string | null {
  const entry = contentCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    contentCache.delete(key);
    return null;
  }
  return entry.data;
}

function buildThreadReplyBlocks(
  ctx: InboundEmailContext,
  aiDraft: AiDraftContext | null,
): SlackBlock[] {
  const bodyPreview = ctx.emailBody.length > 150 ? ctx.emailBody.substring(0, 150) + '...' : ctx.emailBody;

  setCacheEntry(`email_${ctx.conversationId}`, ctx.emailBody);

  const quotedBody = `\`\`\`\n${bodyPreview}\n\`\`\``;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `📨 *인플루언서 메일*  |  ${ctx.senderEmail}` }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: quotedBody },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "📄 전체 보기", emoji: true },
        action_id: "view_full_email",
        value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId }),
      }
    },
    { type: "divider" },
  ];

  if (aiDraft) {
    const draftPreview = aiDraft.draft.length > 150 ? aiDraft.draft.substring(0, 150) + '...' : aiDraft.draft;

    setCacheEntry(`draft_${aiDraft.draftId}`, JSON.stringify({
      draft: aiDraft.draft,
      classification: aiDraft.classification,
      classificationLabel: aiDraft.classificationLabel,
    }));

    const quotedDraft = `\`\`\`\n${draftPreview}\n\`\`\``;

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `✨ *AI 초안*  |  \`${aiDraft.classification} ${aiDraft.classificationLabel}\`` }
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: quotedDraft },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "📋 초안 전문", emoji: true },
        action_id: "view_full_draft",
        value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId, draftId: aiDraft.draftId }),
      }
    });

    const primaryActions: any[] = [
      {
        type: "button",
        text: { type: "plain_text", text: "✏️ 초안 사용하기", emoji: true },
        style: "primary",
        action_id: "send_draft",
        value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId, draftId: aiDraft.draftId }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "🔄 다른 답변 요청", emoji: true },
        action_id: "open_regenerate_modal",
        value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌", emoji: true },
        action_id: "dismiss_draft",
        value: JSON.stringify({ draftId: aiDraft.draftId, conversationId: ctx.conversationId, workspaceId: ctx.workspaceId }),
      },
    ];

    blocks.push({ type: "actions", block_id: `actions_${ctx.conversationId}_${Date.now()}`, elements: primaryActions });

    if (aiDraft.alternatives && aiDraft.alternatives.length > 0) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: "💡 *다른 답변 선택하기*" }],
      } as any);

      const altElements: any[] = [];
      for (const alt of aiDraft.alternatives) {
        altElements.push({
          type: "button",
          text: { type: "plain_text", text: `${alt.classification} ${alt.classificationLabel}`, emoji: true },
          action_id: `regenerate_alt_${alt.classification}`,
          value: JSON.stringify({
            conversationId: ctx.conversationId,
            workspaceId: ctx.workspaceId,
            requestedClassification: alt.classification,
            requestedClassificationLabel: alt.classificationLabel,
          }),
        });
      }
      blocks.push({ type: "actions", block_id: `alts_${ctx.conversationId}_${Date.now()}`, elements: altElements });
    }
  } else {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_AI 초안이 생성되지 않았습니다._" }
    });
    blocks.push({
      type: "actions",
      block_id: `gen_${ctx.conversationId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✨ AI 초안 생성", emoji: true },
          action_id: "generate_draft",
          value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId }),
        },
      ]
    });
  }

  return blocks;
}

function formatAbsoluteTime(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = dayNames[kst.getUTCDay()];
  const hours = kst.getUTCHours();
  const minutes = kst.getUTCMinutes().toString().padStart(2, '0');
  return `${month}/${day}(${dayOfWeek}) ${hours}시 ${minutes}분`;
}

interface ParentMessageInfo {
  conversationId: number;
  influencerName: string;
  campaignName: string;
  lineItemStatus?: string | null;
}


function buildStepperLine(status: string | null | undefined): string {
  const steps = [
    { key: 'contacted', label: '컨택완료' },
    { key: 'confirmed', label: '확정완료' },
    { key: 'contracted', label: '계약완료' },
  ];
  const statusKey = status || 'waiting';
  const currentIdx = statusKey === 'waiting' ? -1 : steps.findIndex(s => s.key === statusKey);

  const stepStr = steps.map((step, i) => {
    const icon = i <= currentIdx ? ':white_check_mark:' : ':white_large_square:';
    return `${icon} ${step.label}`;
  }).join(' → ');
  return `▶️진행 상태 :  ${stepStr}`;
}

async function buildParentMessageBlocks(
  info: ParentMessageInfo,
): Promise<{ blocks: SlackBlock[]; text: string }> {
  const { conversationId, influencerName, campaignName, lineItemStatus } = info;

  const stepperLine = buildStepperLine(lineItemStatus);

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📨 ${influencerName} — ${campaignName}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `> ${stepperLine}` },
    },
  ];

  const text = `📨 ${influencerName} — ${campaignName}`;
  return { blocks, text };
}

async function postSlackMessage(
  botToken: string,
  channelId: string,
  text: string,
  blocks: SlackBlock[],
  threadTs?: string,
): Promise<{ ok: boolean; ts?: string; channel?: string; error?: string }> {
  const body: any = { channel: channelId, text, blocks };
  if (threadTs) {
    body.thread_ts = threadTs;
    body.reply_broadcast = true;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function sendSlackNotification(
  ctx: InboundEmailContext,
  aiDraft: AiDraftContext | null,
  workspace: Workspace
): Promise<void> {
  if (!workspace.slackEnabled || !workspace.slackBotToken || !workspace.slackChannelId) return;

  const targetChannel = ctx.clientSlackChannelId || workspace.slackChannelId;
  const replyBlocks = buildThreadReplyBlocks(ctx, aiDraft);

  let mentionPrefix = '';
  if (ctx.slackMentionUserIds) {
    const userIds = ctx.slackMentionUserIds.split(',').map(id => id.trim()).filter(Boolean);
    if (userIds.length > 0) {
      mentionPrefix = userIds.map(id => `<@${id}>`).join(' ') + ' ';
    }
  }
  const replyText = `${mentionPrefix}📨 ${ctx.influencerName}님이 메일을 보냈습니다.`;

  try {
    const conv = await storage.getConversation(ctx.conversationId);
    const existingThreadTs = conv?.slackThreadTs;
    const existingChannelId = conv?.slackChannelId;

    if (existingThreadTs && existingChannelId) {
      const { blocks: parentBlocks, text: parentText } = await buildParentMessageBlocks({
        conversationId: ctx.conversationId, influencerName: ctx.influencerName,
        campaignName: ctx.campaignName, lineItemStatus: ctx.lineItemStatus,
      });
      const updateResult = await updateSlackMessage(workspace.slackBotToken, existingChannelId, existingThreadTs, parentBlocks, parentText);

      if (updateResult.ok) {
        const replyResult = await postSlackMessage(
          workspace.slackBotToken,
          existingChannelId,
          replyText,
          replyBlocks,
          existingThreadTs,
        );

        if (replyResult.ok) {
          console.log(`[SlackBot] Thread reply sent for conversation ${ctx.conversationId}`);
          return;
        }
        console.error(`[SlackBot] Thread reply failed (${replyResult.error}) for conversation ${ctx.conversationId}`);
        return;
      }

      const parentDeleteErrors = ['message_not_found', 'msg_not_found', 'channel_not_found', 'is_inactive'];
      if (!parentDeleteErrors.includes(updateResult.error || '')) {
        console.error(`[SlackBot] Parent update failed (non-recovery error: ${updateResult.error}), skipping for conversation ${ctx.conversationId}`);
        return;
      }

      console.log(`[SlackBot] Parent message deleted (${updateResult.error}), creating new thread for conversation ${ctx.conversationId}`);
    }

    const { blocks: parentBlocks, text: parentText } = await buildParentMessageBlocks({
      conversationId: ctx.conversationId, influencerName: ctx.influencerName,
      campaignName: ctx.campaignName, lineItemStatus: ctx.lineItemStatus,
    });

    let parentResult = await postSlackMessage(workspace.slackBotToken, targetChannel, parentText, parentBlocks);

    if (!parentResult.ok && ctx.clientSlackChannelId && targetChannel !== workspace.slackChannelId) {
      console.log(`[SlackBot] Client channel failed (${parentResult.error}), retrying with workspace channel...`);
      parentResult = await postSlackMessage(workspace.slackBotToken, workspace.slackChannelId, parentText, parentBlocks);
    }

    if (!parentResult.ok || !parentResult.ts) {
      console.error('[SlackBot] Failed to create parent message:', parentResult.error);
      return;
    }

    const actualChannel = parentResult.channel || targetChannel;
    await storage.updateConversation(ctx.conversationId, {
      slackThreadTs: parentResult.ts,
      slackChannelId: actualChannel,
    });

    const threadReplyResult = await postSlackMessage(
      workspace.slackBotToken,
      actualChannel,
      replyText,
      replyBlocks,
      parentResult.ts,
    );

    if (threadReplyResult.ok) {
      console.log(`[SlackBot] New thread created for conversation ${ctx.conversationId} in channel ${actualChannel}`);
    } else {
      console.error('[SlackBot] Failed to post thread reply:', threadReplyResult.error);
    }
  } catch (err) {
    console.error('[SlackBot] Error sending notification:', err);
  }
}

async function updateSlackMessage(
  botToken: string,
  channelId: string,
  ts: string,
  blocks: SlackBlock[],
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, ts, blocks, text }),
    });
    const data = await resp.json() as any;
    if (!data.ok) {
      console.error(`[SlackBot] Error updating message: ${data.error}`);
    }
    return { ok: data.ok, error: data.error };
  } catch (err) {
    console.error('[SlackBot] Error updating message:', err);
    return { ok: false, error: 'fetch_error' };
  }
}

async function openSlackModal(
  botToken: string,
  triggerId: string,
  title: string,
  blocks: SlackBlock[],
  callbackId?: string,
  privateMetadata?: string,
  submit?: { type: string; text: string },
): Promise<void> {
  const view: any = {
    type: "modal",
    title: { type: "plain_text", text: title.substring(0, 25) },
    blocks,
  };
  if (callbackId) view.callback_id = callbackId;
  if (privateMetadata) view.private_metadata = privateMetadata;
  if (submit) view.submit = submit;

  try {
    await fetch('https://slack.com/api/views.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trigger_id: triggerId, view }),
    });
  } catch (err) {
    console.error('[SlackBot] Open modal error:', err);
  }
}

export async function handleSlackInteraction(payload: any): Promise<{ status: number; body: any }> {
  const actionId = payload.actions?.[0]?.action_id;
  const actionValue = payload.actions?.[0]?.value;

  if (!actionId || !actionValue) {
    return { status: 200, body: {} };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(actionValue);
  } catch {
    return { status: 200, body: {} };
  }

  if (actionId === 'send_draft') {
    return handleOpenSendDraftModal(payload, parsed);
  } else if (actionId.startsWith('regenerate_alt_')) {
    return handleRegenerateAlt(payload, parsed);
  } else if (actionId === 'open_regenerate_modal') {
    return handleOpenRegenerateModal(payload, parsed);
  } else if (actionId === 'dismiss_draft') {
    return handleDismissDraft(payload, parsed);
  } else if (actionId === 'generate_draft') {
    return handleGenerateNewDraft(payload, parsed);
  } else if (actionId === 'view_full_email') {
    return handleViewFullEmail(payload, parsed);
  } else if (actionId === 'view_full_draft') {
    return handleViewFullDraft(payload, parsed);
  }

  return { status: 200, body: {} };
}

export async function handleSlackModalSubmission(payload: any): Promise<{ status: number; body: any }> {
  const callbackId = payload.view?.callback_id;
  const values = payload.view?.state?.values;
  const metadata = payload.view?.private_metadata;

  if (!metadata) return { status: 200, body: {} };

  let parsed: any;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return { status: 200, body: {} };
  }

  if (callbackId === 'send_edited_draft') {
    return handleSendEditedDraft(parsed, values);
  }

  const feedbackText = values?.feedback_block?.feedback_input?.value || '';

  regenerateInBackground(parsed.conversationId, parsed.workspaceId, feedbackText, payload).catch(err => {
    console.error('[SlackBot] Background regenerate failed:', err);
  });

  return { status: 200, body: {} };
}

async function getConversationCcEmails(conversationId: number, accountEmail: string, toEmail: string): Promise<string[]> {
  const conv = await storage.getConversation(conversationId);
  if (!conv) return [];

  const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
  if (lineItem?.campaignId) {
    const campaign = await storage.getCampaign(lineItem.campaignId);
    if (campaign?.ccEmails) {
      const ccSet = new Set<string>();
      for (const e of campaign.ccEmails.split(',')) {
        const trimmed = e.trim().toLowerCase();
        if (trimmed) ccSet.add(trimmed);
      }
      ccSet.delete(accountEmail.toLowerCase().trim());
      ccSet.delete(toEmail.toLowerCase().trim());
      return Array.from(ccSet);
    }
  }

  const existingMsgs = await storage.getConversationMessages(conversationId);
  const firstOutbound = existingMsgs.find(m => m.direction === 'outbound');
  const ccSet = new Set<string>();
  if (firstOutbound?.ccEmails && Array.isArray(firstOutbound.ccEmails)) {
    for (const e of firstOutbound.ccEmails) {
      if (e) ccSet.add(e.toLowerCase().trim());
    }
  }
  ccSet.delete(accountEmail.toLowerCase().trim());
  ccSet.delete(toEmail.toLowerCase().trim());
  return Array.from(ccSet);
}

async function handleOpenSendDraftModal(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId, draftId } = parsed;
  const triggerId = payload.trigger_id;
  if (!triggerId) return { status: 200, body: {} };

  const workspace = (await storage.getWorkspaces()).find(w => w.id === workspaceId);
  if (!workspace?.slackBotToken) return { status: 200, body: {} };

  const conv = await storage.getConversation(conversationId);
  if (!conv) return { status: 200, body: { text: '대화를 찾을 수 없습니다.' } };

  let draftText = '';
  if (draftId) {
    const draftRecord = await storage.getAiDraft(draftId);
    draftText = draftRecord?.draft || '';
  }
  if (!draftText) {
    const latestDraft = await storage.getLatestPendingDraft(conversationId);
    draftText = latestDraft?.draft || '';
  }

  const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
  const toEmail = lineItem?.influencer?.email || '(이메일 없음)';

  let accountEmail = '';
  if (conv.emailAccountId) {
    const directAccount = await storage.getEmailAccountById(conv.emailAccountId);
    if (directAccount) accountEmail = directAccount.email;
  }
  if (!accountEmail) {
    const members = await storage.getWorkspaceMembers(workspace.id);
    for (const member of members) {
      const userAccounts = await storage.getEmailAccounts(member.userId, workspace.id);
      if (userAccounts.length > 0) {
        accountEmail = userAccounts[0].email;
        break;
      }
    }
  }

  const ccEmails = await getConversationCcEmails(conversationId, accountEmail, toEmail);
  const ccDefault = ccEmails.length > 0 ? ccEmails.join(', ') : '';

  const existingMsgs = await storage.getConversationMessages(conversationId);
  const lastInbound = existingMsgs.filter((m: any) => m.direction === 'inbound').pop();

  const modalBlocks: SlackBlock[] = [];

  if (lastInbound) {
    const inboundBody = lastInbound.bodyText || lastInbound.snippet || '';
    const inboundPreview = inboundBody.length > 300 ? inboundBody.substring(0, 300) + '...' : inboundBody;
    modalBlocks.push(
      {
        type: "section",
        text: { type: "mrkdwn", text: `📨 *수신 메일*  |  ${lastInbound.senderEmail || ''}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`\`\`\n${inboundPreview}\n\`\`\`` },
      },
      { type: "divider" },
    );
  }

  modalBlocks.push(
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `📤 *발신:* ${accountEmail || '(계정 없음)'}  |  📥 *수신:* ${toEmail}` },
      ],
    } as any,
    {
      type: "input",
      block_id: "cc_block",
      element: {
        type: "plain_text_input",
        action_id: "cc_input",
        initial_value: ccDefault,
        placeholder: { type: "plain_text", text: "쉼표로 구분 (예: a@email.com, b@email.com)" },
      },
      label: { type: "plain_text", text: "참조 (CC)" },
      optional: true,
    } as any,
    {
      type: "input",
      block_id: "draft_body_block",
      element: {
        type: "rich_text_input",
        action_id: "draft_body_input",
        initial_value: textToRichTextBlock(draftText),
      },
      label: { type: "plain_text", text: "메일 본문" },
    } as any,
  );

  const metadata = JSON.stringify({
    conversationId,
    workspaceId,
    draftId,
    messageTs: payload.message?.ts,
    channelId: payload.channel?.id,
  });

  await openSlackModal(
    workspace.slackBotToken,
    triggerId,
    "초안 편집 및 발송",
    modalBlocks,
    "send_edited_draft",
    metadata,
    { type: "plain_text", text: "📤 발송하기" },
  );

  return { status: 200, body: {} };
}

async function handleSendEditedDraft(parsed: any, values: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId, draftId, messageTs, channelId } = parsed;
  const richTextValue = values?.draft_body_block?.draft_body_input?.rich_text_value;
  const editedDraft = richTextValue ? richTextBlockToPlainText(richTextValue) : (values?.draft_body_block?.draft_body_input?.value || '');
  const editedDraftHtml = richTextValue ? richTextBlockToHtml(richTextValue) : '';
  const ccInput = values?.cc_block?.cc_input?.value || '';

  try {
    const conv = await storage.getConversation(conversationId);
    if (!conv) return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: '대화를 찾을 수 없습니다.' } } };

    const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
    if (!lineItem) return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: '라인아이템을 찾을 수 없습니다.' } } };

    const campaign = await storage.getCampaign(lineItem.campaignId);
    if (!campaign) return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: '캠페인을 찾을 수 없습니다.' } } };

    const workspace = (await storage.getWorkspaces()).find(w => w.id === campaign.workspaceId);
    if (!workspace) return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: '워크스페이스를 찾을 수 없습니다.' } } };

    let account: any = null;
    if (conv.emailAccountId) {
      account = await storage.getEmailAccountById(conv.emailAccountId);
    }
    if (!account) {
      const members = await storage.getWorkspaceMembers(workspace.id);
      for (const member of members) {
        const userAccounts = await storage.getEmailAccounts(member.userId, workspace.id);
        if (userAccounts.length > 0) {
          account = userAccounts[0];
          break;
        }
      }
    }
    if (!account) return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: '이메일 계정이 없습니다.' } } };
    const toEmail = lineItem.influencer?.email;
    if (!toEmail) return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: '인플루언서 이메일이 없습니다.' } } };

    const ccEmails = ccInput
      ? ccInput.split(',').map((e: string) => e.trim().toLowerCase()).filter((e: string) => e && e !== account.email.toLowerCase() && e !== toEmail.toLowerCase())
      : [];

    const { convertToGmailCompatibleHtml } = await import('./smtp');
    let htmlBody: string;
    if (editedDraftHtml) {
      htmlBody = editedDraftHtml;
    } else {
      const isPlainText = !/<[a-z][\s\S]*>/i.test(editedDraft);
      htmlBody = isPlainText
        ? editedDraft.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        : editedDraft;
    }
    let finalBody = convertToGmailCompatibleHtml(htmlBody);
    if (account.useSignature && account.signature) {
      finalBody += `<br><br>--<br>${account.signature}`;
    }

    const existingMsgs = await storage.getConversationMessages(conversationId);
    const isReply = existingMsgs.length > 0;

    let originalSubject = conv.subjectPrefix || '';

    if (!originalSubject || originalSubject === `[${campaign.name}]`) {
      const firstOutbound = existingMsgs.find((m: any) => m.direction === 'outbound');
      if (firstOutbound?.snippet) {
        originalSubject = firstOutbound.snippet;
      }
    }

    if (!originalSubject) {
      originalSubject = `[${campaign.name}]`;
    }

    let subject = originalSubject;
    let inReplyTo: string | undefined;
    let references: string | string[] | undefined;

    if (isReply) {
      const lastInbound = existingMsgs.filter((m: any) => m.direction === 'inbound').pop();
      const lastMessageId = lastInbound?.gmailMessageId || existingMsgs[existingMsgs.length - 1]?.gmailMessageId;
      if (lastMessageId) {
        inReplyTo = lastMessageId;
        const allRefs = existingMsgs
          .map((m: any) => m.gmailMessageId)
          .filter((id: string | null): id is string => !!id && id.startsWith('<'));
        references = allRefs.length > 0 ? allRefs : lastMessageId;
      }
      if (!subject.toLowerCase().startsWith('re:')) {
        subject = `Re: ${subject}`;
      }
    }

    let sentMessageId: string | null = null;

    if (account.provider === 'gmail' && account.refreshToken && account.useGmailApi) {
      const { sendEmailForAccount } = await import('./gmail');
      const gmailReplyHeaders = inReplyTo ? {
        inReplyTo,
        references: Array.isArray(references) ? references : references ? [references] : undefined,
      } : undefined;
      const gmailResult = await sendEmailForAccount(
        account.refreshToken, toEmail, subject, finalBody,
        conv.gmailThreadId || undefined, ccEmails, gmailReplyHeaders
      );
      sentMessageId = gmailResult.messageId || gmailResult.id || null;
    } else if (account.provider === 'imap' || (account.provider === 'gmail' && !account.useGmailApi)) {
      const { createSmtpTransporter, getImapSmtpSettings } = await import('./smtp');
      const { decryptPassword } = await import('./imap');

      const smtpSettings = getImapSmtpSettings(account);
      if (!smtpSettings.smtpHost || !smtpSettings.imapPassword) {
        return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: 'SMTP 설정이 완료되지 않았습니다.' } } };
      }

      const password = decryptPassword(smtpSettings.imapPassword);
      const transporter = createSmtpTransporter({
        host: smtpSettings.smtpHost,
        port: smtpSettings.smtpPort,
        secure: smtpSettings.smtpPort === 465,
        user: account.email,
        password,
      });

      const sendResult = await transporter.sendMail({
        from: `"${account.senderName || account.email}" <${account.email}>`,
        to: toEmail,
        cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
        subject,
        html: finalBody,
        inReplyTo,
        references,
      });
      sentMessageId = sendResult.messageId || null;
    } else {
      const { sendEmail: sendLegacyGmail } = await import('./gmail');
      const gmailReplyHeaders = inReplyTo ? {
        inReplyTo,
        references: Array.isArray(references) ? references : references ? [references] : undefined,
      } : undefined;
      const result = await sendLegacyGmail(toEmail, subject, finalBody, conv.gmailThreadId || undefined, ccEmails, undefined, gmailReplyHeaders);
      sentMessageId = result.id || null;
    }

    await storage.createConversationMessage({
      conversationId,
      direction: 'outbound',
      senderEmail: account.email,
      recipientEmail: toEmail,
      ccEmails: ccEmails.length > 0 ? ccEmails : null,
      bodyHtml: finalBody,
      bodyText: editedDraft,
      snippet: editedDraft.substring(0, 200),
      gmailMessageId: sentMessageId,
      sendStatus: 'sent',
      sentAt: new Date(),
    });

    if (draftId) {
      await storage.updateAiDraft(draftId, { status: 'used' });
    }

    if (workspace.slackBotToken && messageTs) {
      const targetChannel = channelId || workspace.slackChannelId!;

      const existingMsgsForReply = await storage.getConversationMessages(conversationId);
      const lastInboundMsg = existingMsgsForReply.filter(m => m.direction === 'inbound').pop();

      const inboundBlocks: SlackBlock[] = [];
      if (lastInboundMsg) {
        const inboundBody = lastInboundMsg.bodyText || lastInboundMsg.snippet || '';
        const inboundPreview = inboundBody.length > 150 ? inboundBody.substring(0, 150) + '...' : inboundBody;
        inboundBlocks.push(
          { type: "section", text: { type: "mrkdwn", text: `📨 *인플루언서 메일*  |  ${lastInboundMsg.senderEmail || ''}` } },
          { type: "section", text: { type: "mrkdwn", text: `\`\`\`\n${inboundPreview}\n\`\`\`` } },
          { type: "divider" },
        );
      }

      const replyPreview = editedDraft.length > 150 ? editedDraft.substring(0, 150) + '...' : editedDraft;
      const updatedBlocks: SlackBlock[] = [
        ...inboundBlocks,
        {
          type: "section",
          text: { type: "mrkdwn", text: `✅ *회신 완료*  |  → ${toEmail}${ccEmails.length > 0 ? `\n_CC: ${ccEmails.join(', ')}_` : ''}` }
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `\`\`\`\n${replyPreview}\n\`\`\`` }
        },
      ];

      await updateSlackMessage(
        workspace.slackBotToken,
        targetChannel,
        messageTs,
        updatedBlocks,
        '답장이 발송되었습니다.',
      );
    }

    await updateParentAfterAction(conversationId, workspace);

    return { status: 200, body: {} };
  } catch (err) {
    console.error('[SlackBot] Send edited draft error:', err);
    return { status: 200, body: { response_action: 'errors', errors: { draft_body_block: '발송 실패: ' + (err as Error).message } } };
  }
}

async function handleRegenerateAlt(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId, requestedClassification, requestedClassificationLabel } = parsed;

  regenerateInBackground(conversationId, workspaceId, undefined, payload, requestedClassification, requestedClassificationLabel).catch(err => {
    console.error('[SlackBot] Alt regenerate error:', err);
  });

  return { status: 200, body: {} };
}

async function handleOpenRegenerateModal(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId } = parsed;
  const triggerId = payload.trigger_id;

  if (!triggerId) return { status: 200, body: {} };

  const workspace = (await storage.getWorkspaces()).find(w => w.id === workspaceId);
  if (!workspace?.slackBotToken) return { status: 200, body: {} };

  await openSlackModal(
    workspace.slackBotToken,
    triggerId,
    "다른 답변 요청",
    [
      {
        type: "input",
        block_id: "feedback_block",
        element: {
          type: "plain_text_input",
          action_id: "feedback_input",
          multiline: true,
          placeholder: { type: "plain_text", text: "요청사항을 입력하세요 (예: 좀 더 정중하게, 단가를 강조해주세요)" },
        },
        label: { type: "plain_text", text: "요청사항" },
      } as any,
    ],
    "regenerate_with_feedback",
    JSON.stringify({ conversationId, workspaceId }),
    { type: "plain_text", text: "답변 생성" },
  );

  return { status: 200, body: {} };
}

async function handleViewFullEmail(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId } = parsed;
  const triggerId = payload.trigger_id;
  if (!triggerId) return { status: 200, body: {} };

  let bodyText = getCacheEntry(`email_${conversationId}`);

  const [workspace] = await Promise.all([
    workspaceId
      ? (storage.getWorkspaces().then(ws => ws.find(w => w.id === workspaceId)))
      : findWorkspaceFromPayload(payload),
    ...(bodyText ? [] : [
      storage.getConversationMessages(conversationId).then(msgs => {
        const lastInbound = msgs.filter(m => m.direction === 'inbound').pop();
        bodyText = lastInbound?.bodyText || lastInbound?.snippet || '(내용 없음)';
      }),
    ]),
  ]);

  if (!workspace?.slackBotToken) return { status: 200, body: {} };

  const truncated = truncateForSlack(bodyText || '(내용 없음)');

  await openSlackModal(
    workspace.slackBotToken,
    triggerId,
    "메일 원문",
    [
      {
        type: "section",
        text: { type: "mrkdwn", text: truncated }
      },
    ],
  );

  return { status: 200, body: {} };
}

async function handleViewFullDraft(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId, draftId } = parsed;
  const triggerId = payload.trigger_id;
  if (!triggerId) return { status: 200, body: {} };

  let cachedDraft = draftId ? getCacheEntry(`draft_${draftId}`) : null;
  let draftText = '';
  let classLabel = '';

  if (cachedDraft) {
    try {
      const parsed = JSON.parse(cachedDraft);
      draftText = parsed.draft || '';
      classLabel = `${parsed.classification || ''} ${parsed.classificationLabel || ''}`;
    } catch { cachedDraft = null; }
  }

  const [workspace] = await Promise.all([
    workspaceId
      ? (storage.getWorkspaces().then(ws => ws.find(w => w.id === workspaceId)))
      : findWorkspaceFromPayload(payload),
    ...(!draftText ? [
      (async () => {
        let draft: any = null;
        if (draftId) draft = await storage.getAiDraft(draftId);
        if (!draft) draft = await storage.getLatestPendingDraft(conversationId);
        draftText = draft?.draft || '(초안 없음)';
        classLabel = `${draft?.classification || ''} ${draft?.classificationLabel || ''}`;
      })(),
    ] : []),
  ]);

  if (!workspace?.slackBotToken) return { status: 200, body: {} };

  const truncated = truncateForSlack(draftText);

  await openSlackModal(
    workspace.slackBotToken,
    triggerId,
    "AI 초안 전문",
    [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*분류:* \`${classLabel}\`` }
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: truncated }
      },
    ],
  );

  return { status: 200, body: {} };
}

async function updateParentAfterAction(conversationId: number, workspace: Workspace): Promise<void> {
  try {
    if (!workspace.slackBotToken) return;
    const conv = await storage.getConversation(conversationId);
    if (!conv?.slackThreadTs || !conv?.slackChannelId) return;

    const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
    const campaign = lineItem ? await storage.getCampaign(lineItem.campaignId) : null;
    const influencerName = lineItem?.influencer?.name || 'Unknown';
    const campaignName = campaign?.name || '';

    const { blocks, text } = await buildParentMessageBlocks({
      conversationId, influencerName, campaignName,
      lineItemStatus: lineItem?.status,
    });
    await updateSlackMessage(workspace.slackBotToken, conv.slackChannelId, conv.slackThreadTs, blocks, text);
  } catch (err) {
    console.error('[SlackBot] updateParentAfterAction error:', err);
  }
}

export async function refreshSlackParentForLineItem(lineItemId: number): Promise<void> {
  try {
    const conv = await storage.getConversationByLineItem(lineItemId);
    if (!conv?.slackThreadTs || !conv?.slackChannelId) return;

    const lineItem = await storage.getLineItemWithDetails(lineItemId);
    if (!lineItem) return;

    const campaign = await storage.getCampaign(lineItem.campaignId);
    const workspace = (await storage.getWorkspaces()).find(w => w.id === campaign?.workspaceId);
    if (!workspace?.slackBotToken || !workspace.slackEnabled) return;

    const influencerName = lineItem.influencer?.name || 'Unknown';
    const campaignName = campaign?.name || '';

    const { blocks, text } = await buildParentMessageBlocks({
      conversationId: conv.id, influencerName, campaignName,
      lineItemStatus: lineItem.status,
    });
    await updateSlackMessage(workspace.slackBotToken, conv.slackChannelId, conv.slackThreadTs, blocks, text);
    console.log(`[SlackBot] Parent message refreshed for lineItem ${lineItemId}`);
  } catch (err) {
    console.error('[SlackBot] refreshSlackParentForLineItem error:', err);
  }
}

async function handleDismissDraft(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { draftId, conversationId, workspaceId } = parsed;

  try {
    await storage.updateAiDraft(draftId, { status: 'dismissed' });

    const workspace = workspaceId
      ? (await storage.getWorkspaces()).find(w => w.id === workspaceId)
      : await findWorkspaceFromPayload(payload);

    if (workspace?.slackBotToken && payload.message?.ts) {
      const updatedBlocks = (payload.message.blocks || []).slice(0, 3);
      updatedBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "_AI 초안이 닫혔습니다._" }
      });
      await updateSlackMessage(
        workspace.slackBotToken,
        payload.channel?.id || workspace.slackChannelId!,
        payload.message.ts,
        updatedBlocks,
        'AI 초안이 닫혔습니다.',
      );
    }

    const resolvedConvId = conversationId || (await storage.getAiDraft(draftId))?.conversationId;
    if (resolvedConvId && workspace) {
      await updateParentAfterAction(resolvedConvId, workspace);
    }
  } catch (err) {
    console.error('[SlackBot] Dismiss draft error:', err);
  }

  return { status: 200, body: {} };
}

async function handleGenerateNewDraft(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId } = parsed;

  regenerateInBackground(conversationId, workspaceId, undefined, payload).catch(err => {
    console.error('[SlackBot] Generate new draft error:', err);
  });

  return { status: 200, body: {} };
}

async function regenerateInBackground(
  conversationId: number,
  workspaceId: number,
  userFeedback?: string,
  payload?: any,
  requestedClassification?: string,
  requestedClassificationLabel?: string,
): Promise<void> {
  const conv = await storage.getConversation(conversationId);
  if (!conv) return;

  const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
  if (!lineItem) return;

  const campaign = await storage.getCampaign(lineItem.campaignId);
  if (!campaign) return;

  const workspace = (await storage.getWorkspaces()).find(w => w.id === workspaceId);
  if (!workspace) return;

  if (workspace.slackBotToken && payload?.message?.ts) {
    const loadingBlocks = (payload.message.blocks || []).slice(0, 4);
    loadingBlocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "⏳ *AI 초안 생성 중...* 잠시만 기다려 주세요." }
    });
    await updateSlackMessage(
      workspace.slackBotToken,
      payload.channel?.id || workspace.slackChannelId!,
      payload.message.ts,
      loadingBlocks,
      'AI 초안 생성 중...',
    );
  }

  const messages = await storage.getConversationMessages(conversationId);
  if (messages.length === 0) return;

  let result: any;
  try {
    const { generateEmailDraft } = await import('./ai/draft-generator');
    result = await generateEmailDraft(
      messages,
      lineItem.influencer || {},
      campaign,
      workspace,
      lineItem.offerFee,
      userFeedback,
      requestedClassification,
      requestedClassificationLabel,
    );
  } catch (genErr) {
    console.error('[SlackBot] Draft generation failed:', genErr);
    if (workspace.slackBotToken && payload?.message?.ts) {
      const errorBlocks = (payload.message.blocks || []).slice(0, 3);
      errorBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `❌ *AI 초안 생성 실패.*\n사유: ${((genErr as Error).message || '알 수 없는 오류').slice(0, 150)}\n다시 시도해 주세요.` }
      });
      errorBlocks.push({
        type: "actions",
        block_id: `retry_${Date.now()}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "🔄 재시도", emoji: true },
            action_id: "generate_draft",
            value: JSON.stringify({ conversationId, workspaceId }),
          },
        ]
      });
      await updateSlackMessage(
        workspace.slackBotToken,
        payload.channel?.id || workspace.slackChannelId!,
        payload.message.ts,
        errorBlocks,
        'AI 초안 생성 실패.',
      );
    }
    return;
  }

  const newDraft = await storage.createAiDraft({
    conversationId,
    triggerMessageId: messages[messages.length - 1].id,
    draft: result.draft,
    classification: result.classification,
    classificationLabel: result.classificationLabel,
    alternatives: result.alternatives ? JSON.stringify(result.alternatives) : undefined,
    status: 'pending',
  });

  setCacheEntry(`draft_${newDraft.id}`, JSON.stringify({
    draft: result.draft,
    classification: result.classification,
    classificationLabel: result.classificationLabel,
  }));

  if (workspace.slackBotToken && payload?.message?.ts) {
    const existingBlocks = (payload.message.blocks || []).slice(0, 3);
    const draftPreview = result.draft.length > 150 ? result.draft.substring(0, 150) + '...' : result.draft;

    const quotedDraftRegen = `\`\`\`\n${draftPreview}\n\`\`\``;

    const newBlocks: SlackBlock[] = [
      ...existingBlocks,
      {
        type: "section",
        text: { type: "mrkdwn", text: `✨ *AI 초안*  |  \`${result.classification} ${result.classificationLabel}\`` }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: quotedDraftRegen },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "📋 초안 전문", emoji: true },
          action_id: "view_full_draft",
          value: JSON.stringify({ conversationId, workspaceId, draftId: newDraft.id }),
        }
      },
    ];

    const primaryActions: any[] = [
      {
        type: "button",
        text: { type: "plain_text", text: "✏️ 초안 사용하기", emoji: true },
        style: "primary",
        action_id: "send_draft",
        value: JSON.stringify({ conversationId, workspaceId, draftId: newDraft.id }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "🔄 다른 답변 요청", emoji: true },
        action_id: "open_regenerate_modal",
        value: JSON.stringify({ conversationId, workspaceId }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌", emoji: true },
        action_id: "dismiss_draft",
        value: JSON.stringify({ draftId: newDraft.id, conversationId, workspaceId }),
      },
    ];

    newBlocks.push({ type: "actions", block_id: `actions_${conversationId}_${Date.now()}`, elements: primaryActions });

    if (result.alternatives && result.alternatives.length > 0) {
      newBlocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: "💡 *다른 답변 선택하기*" }],
      } as any);

      const altElements: any[] = [];
      for (const alt of result.alternatives) {
        altElements.push({
          type: "button",
          text: { type: "plain_text", text: `${alt.classification} ${alt.classificationLabel}`, emoji: true },
          action_id: `regenerate_alt_${alt.classification}`,
          value: JSON.stringify({
            conversationId,
            workspaceId,
            requestedClassification: alt.classification,
            requestedClassificationLabel: alt.classificationLabel,
          }),
        });
      }
      newBlocks.push({ type: "actions", block_id: `alts_${conversationId}_${Date.now()}`, elements: altElements });
    }

    await updateSlackMessage(
      workspace.slackBotToken,
      payload.channel?.id || workspace.slackChannelId!,
      payload.message.ts,
      newBlocks,
      'AI 초안이 재생성되었습니다.',
    );
  }

  await updateParentAfterAction(conversationId, workspace);
}

async function findWorkspaceFromPayload(payload: any): Promise<Workspace | null> {
  const workspaces = await storage.getWorkspaces();
  const channelId = payload.channel?.id;
  if (channelId) {
    const ws = workspaces.find(w => w.slackChannelId === channelId);
    if (ws) return ws;
  }
  return workspaces.find(w => w.slackEnabled && w.slackBotToken) || null;
}

export async function notifyInboundEmail(
  conversationId: number,
  messageId: number,
): Promise<void> {
  try {
    const conv = await storage.getConversation(conversationId);
    if (!conv) return;

    const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
    if (!lineItem) return;

    const campaign = await storage.getCampaign(lineItem.campaignId);
    if (!campaign) return;

    const workspace = (await storage.getWorkspaces()).find(w => w.id === campaign.workspaceId);
    if (!workspace?.slackEnabled || !workspace.slackBotToken || !workspace.slackChannelId) return;

    const influencer = lineItem.influencer;
    if (!influencer) return;

    const messages = await storage.getConversationMessages(conversationId);
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    if (influencer.email && msg.senderEmail) {
      const senderAddr = (msg.senderEmail.match(/<([^>]+)>/)?.[1] || msg.senderEmail).toLowerCase().trim();
      const influencerEmails = influencer.email.toLowerCase().split(/[,\s]+/).map(e => e.trim()).filter(Boolean);
      if (!influencerEmails.some(e => senderAddr === e)) {
        return;
      }
    }

    let clientSlackChannelId: string | null = null;
    if (campaign.clientId) {
      const client = await storage.getClient(campaign.clientId);
      if (client?.slackChannelId) {
        clientSlackChannelId = client.slackChannelId;
      }
    }

    const draft = await storage.getLatestPendingDraft(conversationId);

    let aiDraftCtx: AiDraftContext | null = null;
    if (draft) {
      let alternatives: { classification: string; classificationLabel: string }[] | undefined;
      if (draft.alternatives) {
        try { alternatives = JSON.parse(draft.alternatives); } catch {}
      }
      aiDraftCtx = {
        draftId: draft.id,
        draft: draft.draft,
        classification: draft.classification || '',
        classificationLabel: draft.classificationLabel || '',
        alternatives,
      };
    }

    await sendSlackNotification(
      {
        workspaceId: workspace.id,
        conversationId,
        messageId,
        influencerName: influencer.name || 'Unknown',
        influencerEmail: influencer.email || '',
        campaignName: campaign.name,
        campaignId: campaign.id,
        emailBody: msg.bodyText || msg.snippet || '',
        senderEmail: msg.senderEmail || '',
        clientSlackChannelId,
        lineItemStatus: lineItem.status,
        slackMentionUserIds: campaign.slackMentionUserIds,
      },
      aiDraftCtx,
      workspace,
    );
  } catch (err) {
    console.error('[SlackBot] notifyInboundEmail error:', err);
  }
}
