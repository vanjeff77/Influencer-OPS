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
}

interface AiDraftContext {
  draftId: number;
  draft: string;
  classification: string;
  classificationLabel: string;
  alternatives?: { classification: string; classificationLabel: string }[];
}

function buildNotificationBlocks(
  ctx: InboundEmailContext,
  aiDraft: AiDraftContext | null,
): SlackBlock[] {
  const bodyPreview = ctx.emailBody.length > 150 ? ctx.emailBody.substring(0, 150) + '...' : ctx.emailBody;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📨 새 메일 수신 — ${ctx.campaignName}`, emoji: true }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${ctx.influencerName}* (${ctx.senderEmail})` }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `>${bodyPreview.replace(/\n/g, '\n>')}` },
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

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `✨ *AI 초안* \`${aiDraft.classification} ${aiDraft.classificationLabel}\`\n${draftPreview}` },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "📋 초안 전문", emoji: true },
        action_id: "view_full_draft",
        value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId, draftId: aiDraft.draftId }),
      }
    });

    const actionElements: any[] = [
      {
        type: "button",
        text: { type: "plain_text", text: "📤 초안으로 발송", emoji: true },
        style: "primary",
        action_id: "send_draft",
        value: JSON.stringify({ conversationId: ctx.conversationId, draftId: aiDraft.draftId, draft: aiDraft.draft }),
      },
    ];

    if (aiDraft.alternatives && aiDraft.alternatives.length > 0) {
      for (const alt of aiDraft.alternatives) {
        actionElements.push({
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
    }

    actionElements.push(
      {
        type: "button",
        text: { type: "plain_text", text: "🔄 재생성", emoji: true },
        action_id: "open_regenerate_modal",
        value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌", emoji: true },
        action_id: "dismiss_draft",
        value: JSON.stringify({ draftId: aiDraft.draftId }),
      },
    );

    blocks.push({ type: "actions", block_id: `actions_${ctx.conversationId}_${Date.now()}`, elements: actionElements });
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

export async function sendSlackNotification(
  ctx: InboundEmailContext,
  aiDraft: AiDraftContext | null,
  workspace: Workspace
): Promise<void> {
  if (!workspace.slackEnabled || !workspace.slackBotToken || !workspace.slackChannelId) return;

  const targetChannel = ctx.clientSlackChannelId || workspace.slackChannelId;
  const blocks = buildNotificationBlocks(ctx, aiDraft);

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${workspace.slackBotToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: targetChannel,
        text: `📨 ${ctx.influencerName}님이 ${ctx.campaignName}에 메일을 보냈습니다.`,
        blocks,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('[SlackBot] Failed to send message:', data.error);
      if (ctx.clientSlackChannelId && targetChannel !== workspace.slackChannelId) {
        console.log('[SlackBot] Retrying with default workspace channel...');
        const retryResponse = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${workspace.slackBotToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: workspace.slackChannelId,
            text: `📨 ${ctx.influencerName}님이 ${ctx.campaignName}에 메일을 보냈습니다.`,
            blocks,
          }),
        });
        const retryData = await retryResponse.json();
        if (!retryData.ok) {
          console.error('[SlackBot] Retry also failed:', retryData.error);
        }
      }
    } else {
      console.log(`[SlackBot] Notification sent for conversation ${ctx.conversationId} to channel ${targetChannel}`);
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
): Promise<void> {
  try {
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, ts, blocks, text }),
    });
  } catch (err) {
    console.error('[SlackBot] Error updating message:', err);
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
    return handleSendDraftConfirm(payload, parsed);
  } else if (actionId === 'confirm_send_draft') {
    return handleSendDraft(payload, parsed);
  } else if (actionId === 'cancel_send_draft') {
    return handleCancelSend(payload, parsed);
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
  const values = payload.view?.state?.values;
  const metadata = payload.view?.private_metadata;

  if (!metadata) return { status: 200, body: {} };

  let parsed: any;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return { status: 200, body: {} };
  }

  const feedbackText = values?.feedback_block?.feedback_input?.value || '';

  regenerateInBackground(parsed.conversationId, parsed.workspaceId, feedbackText, payload).catch(err => {
    console.error('[SlackBot] Background regenerate failed:', err);
  });

  return { status: 200, body: {} };
}

async function handleSendDraftConfirm(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const workspace = await findWorkspaceFromPayload(payload);
  if (!workspace?.slackBotToken || !payload.message?.ts) {
    return { status: 200, body: {} };
  }

  const existingBlocks = (payload.message.blocks || []).slice(0, 4);

  const confirmBlocks: SlackBlock[] = [
    ...existingBlocks,
    {
      type: "section",
      text: { type: "mrkdwn", text: "⚠️ *정말 이 초안을 발송하시겠습니까?*" }
    },
    {
      type: "actions",
      block_id: `confirm_${Date.now()}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ 확인 발송", emoji: true },
          style: "danger",
          action_id: "confirm_send_draft",
          value: JSON.stringify(parsed),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "↩️ 취소", emoji: true },
          action_id: "cancel_send_draft",
          value: JSON.stringify({ ...parsed, originalBlocks: payload.message.blocks }),
        },
      ]
    },
  ];

  await updateSlackMessage(
    workspace.slackBotToken,
    payload.channel?.id || workspace.slackChannelId!,
    payload.message.ts,
    confirmBlocks,
    '발송 확인 대기중...',
  );

  return { status: 200, body: {} };
}

async function handleCancelSend(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const workspace = await findWorkspaceFromPayload(payload);
  if (!workspace?.slackBotToken || !payload.message?.ts) {
    return { status: 200, body: {} };
  }

  const originalBlocks = parsed.originalBlocks;
  if (originalBlocks) {
    await updateSlackMessage(
      workspace.slackBotToken,
      payload.channel?.id || workspace.slackChannelId!,
      payload.message.ts,
      originalBlocks,
      '발송이 취소되었습니다.',
    );
  }

  return { status: 200, body: {} };
}

async function handleSendDraft(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, draftId, draft } = parsed;

  try {
    const conv = await storage.getConversation(conversationId);
    if (!conv) {
      return { status: 200, body: { text: '대화를 찾을 수 없습니다.' } };
    }

    const lineItem = await storage.getLineItemWithDetails(conv.campaignLineItemId);
    if (!lineItem) {
      return { status: 200, body: { text: '라인아이템을 찾을 수 없습니다.' } };
    }

    const campaign = await storage.getCampaign(lineItem.campaignId);
    if (!campaign) {
      return { status: 200, body: { text: '캠페인을 찾을 수 없습니다.' } };
    }

    const workspace = (await storage.getWorkspaces()).find(w => w.id === campaign.workspaceId);
    if (!workspace) {
      return { status: 200, body: { text: '워크스페이스를 찾을 수 없습니다.' } };
    }

    const members = await storage.getWorkspaceMembers(workspace.id);
    const ownerMember = members.find(m => m.role === 'WORKSPACE_OWNER') || members[0];
    if (!ownerMember) {
      return { status: 200, body: { text: '워크스페이스 멤버를 찾을 수 없습니다.' } };
    }

    const userAccounts = await storage.getEmailAccounts(ownerMember.userId, workspace.id);
    if (!userAccounts || userAccounts.length === 0) {
      return { status: 200, body: { text: '이메일 계정이 없습니다.' } };
    }

    const account = (conv.emailAccountId && userAccounts.find(a => a.id === conv.emailAccountId)) || userAccounts[0];
    const toEmail = lineItem.influencer?.email;
    if (!toEmail) {
      return { status: 200, body: { text: '인플루언서 이메일이 없습니다.' } };
    }

    const { convertToGmailCompatibleHtml } = await import('./smtp');
    const isPlainText = !/<[a-z][\s\S]*>/i.test(draft);
    const htmlBody = isPlainText
      ? draft.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      : draft;
    let finalBody = convertToGmailCompatibleHtml(htmlBody);
    if (account.useSignature && account.signature) {
      finalBody += `<br><br>--<br>${account.signature}`;
    }

    const existingMsgs = await storage.getConversationMessages(conversationId);
    const isReply = existingMsgs.length > 0;

    let subject = conv.subjectPrefix || `[${campaign.name}]`;
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (isReply) {
      const lastMsg = existingMsgs[existingMsgs.length - 1];
      if (lastMsg.gmailMessageId) {
        const formattedMsgId = lastMsg.gmailMessageId.includes('@')
          ? `<${lastMsg.gmailMessageId}>`
          : lastMsg.gmailMessageId;
        inReplyTo = formattedMsgId;
        references = formattedMsgId;
      }
      if (!subject.toLowerCase().startsWith('re:')) {
        subject = `Re: ${subject}`;
      }
    }

    const { getTransporter } = await import('./smtp');
    const transporter = await getTransporter(account);

    await transporter.sendMail({
      from: `"${account.senderName || account.email}" <${account.email}>`,
      to: toEmail,
      subject,
      html: finalBody,
      inReplyTo,
      references,
    });

    await storage.createConversationMessage({
      conversationId,
      direction: 'outbound',
      senderEmail: account.email,
      recipientEmail: toEmail,
      bodyHtml: finalBody,
      bodyText: draft,
      snippet: draft.substring(0, 200),
      sendStatus: 'sent',
      sentAt: new Date(),
    });

    if (draftId) {
      await storage.updateAiDraft(draftId, { status: 'used' });
    }

    const responseBlocks: SlackBlock[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: `✅ *발송 완료!* ${toEmail}로 답장이 발송되었습니다.` }
      }
    ];

    if (workspace.slackBotToken && payload.message?.ts) {
      await updateSlackMessage(
        workspace.slackBotToken,
        payload.channel?.id || workspace.slackChannelId!,
        payload.message.ts,
        [...(payload.message.blocks?.slice(0, 4) || []), ...responseBlocks],
        '답장이 발송되었습니다.',
      );
    }

    return { status: 200, body: {} };
  } catch (err) {
    console.error('[SlackBot] Send draft error:', err);
    return { status: 200, body: { text: '발송 실패: ' + (err as Error).message } };
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
    "AI 초안 재생성",
    [
      {
        type: "input",
        block_id: "feedback_block",
        element: {
          type: "plain_text_input",
          action_id: "feedback_input",
          multiline: true,
          placeholder: { type: "plain_text", text: "수정 요청사항을 입력하세요 (예: 좀 더 정중하게, 단가를 강조해주세요)" },
        },
        label: { type: "plain_text", text: "수정 요청사항" },
      } as any,
    ],
    "regenerate_with_feedback",
    JSON.stringify({ conversationId, workspaceId }),
    { type: "plain_text", text: "재생성" },
  );

  return { status: 200, body: {} };
}

async function handleViewFullEmail(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId } = parsed;
  const triggerId = payload.trigger_id;
  if (!triggerId) return { status: 200, body: {} };

  const workspace = (await storage.getWorkspaces()).find(w => w.id === workspaceId);
  if (!workspace?.slackBotToken) return { status: 200, body: {} };

  const messages = await storage.getConversationMessages(conversationId);
  const inboundMsgs = messages.filter(m => m.direction === 'inbound');
  const lastInbound = inboundMsgs[inboundMsgs.length - 1];

  const fullBody = lastInbound?.bodyText || lastInbound?.snippet || '(내용 없음)';
  const truncated = fullBody.length > 2900 ? fullBody.substring(0, 2900) + '...' : fullBody;

  await openSlackModal(
    workspace.slackBotToken,
    triggerId,
    "메일 원문",
    [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*보낸 사람:* ${lastInbound?.senderEmail || 'N/A'}` }
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

async function handleViewFullDraft(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { conversationId, workspaceId, draftId } = parsed;
  const triggerId = payload.trigger_id;
  if (!triggerId) return { status: 200, body: {} };

  const workspace = (await storage.getWorkspaces()).find(w => w.id === workspaceId);
  if (!workspace?.slackBotToken) return { status: 200, body: {} };

  let draft: any = null;
  if (draftId) {
    draft = await storage.getAiDraft(draftId);
  }
  if (!draft) {
    draft = await storage.getLatestPendingDraft(conversationId);
  }
  const draftText = draft?.draft || '(초안 없음)';
  const truncated = draftText.length > 2900 ? draftText.substring(0, 2900) + '...' : draftText;

  await openSlackModal(
    workspace.slackBotToken,
    triggerId,
    "AI 초안 전문",
    [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*분류:* \`${draft?.classification || ''} ${draft?.classificationLabel || ''}\`` }
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

async function handleDismissDraft(payload: any, parsed: any): Promise<{ status: number; body: any }> {
  const { draftId } = parsed;

  try {
    await storage.updateAiDraft(draftId, { status: 'dismissed' });

    const workspace = await findWorkspaceFromPayload(payload);
    if (workspace?.slackBotToken && payload.message?.ts) {
      const updatedBlocks = (payload.message.blocks || []).slice(0, 4);
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
      const errorBlocks = (payload.message.blocks || []).slice(0, 4);
      errorBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "❌ *AI 초안 생성 실패.* 다시 시도해 주세요." }
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

  if (workspace.slackBotToken && payload?.message?.ts) {
    const existingBlocks = (payload.message.blocks || []).slice(0, 4);
    const draftPreview = result.draft.length > 150 ? result.draft.substring(0, 150) + '...' : result.draft;

    const newBlocks: SlackBlock[] = [
      ...existingBlocks,
      {
        type: "section",
        text: { type: "mrkdwn", text: `✨ *AI 초안* \`${result.classification} ${result.classificationLabel}\`\n${draftPreview}` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "📋 초안 전문", emoji: true },
          action_id: "view_full_draft",
          value: JSON.stringify({ conversationId, workspaceId, draftId: newDraft.id }),
        }
      },
    ];

    const actionElements: any[] = [
      {
        type: "button",
        text: { type: "plain_text", text: "📤 초안으로 발송", emoji: true },
        style: "primary",
        action_id: "send_draft",
        value: JSON.stringify({ conversationId, draftId: newDraft.id, draft: result.draft }),
      },
    ];

    if (result.alternatives && result.alternatives.length > 0) {
      for (const alt of result.alternatives) {
        actionElements.push({
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
    }

    actionElements.push(
      {
        type: "button",
        text: { type: "plain_text", text: "🔄 재생성", emoji: true },
        action_id: "open_regenerate_modal",
        value: JSON.stringify({ conversationId, workspaceId }),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌", emoji: true },
        action_id: "dismiss_draft",
        value: JSON.stringify({ draftId: newDraft.id }),
      },
    );

    newBlocks.push({ type: "actions", block_id: `actions_${conversationId}_${Date.now()}`, elements: actionElements });

    await updateSlackMessage(
      workspace.slackBotToken,
      payload.channel?.id || workspace.slackChannelId!,
      payload.message.ts,
      newBlocks,
      'AI 초안이 재생성되었습니다.',
    );
  }
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
      },
      aiDraftCtx,
      workspace,
    );
  } catch (err) {
    console.error('[SlackBot] notifyInboundEmail error:', err);
  }
}
