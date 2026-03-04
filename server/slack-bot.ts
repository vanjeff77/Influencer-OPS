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
}

interface AiDraftContext {
  draftId: number;
  draft: string;
  classification: string;
  classificationLabel: string;
  alternatives?: { classification: string; classificationLabel: string }[];
}

export async function sendSlackNotification(
  ctx: InboundEmailContext,
  aiDraft: AiDraftContext | null,
  workspace: Workspace
): Promise<void> {
  if (!workspace.slackEnabled || !workspace.slackBotToken || !workspace.slackChannelId) return;

  const bodyPreview = ctx.emailBody.length > 500 ? ctx.emailBody.substring(0, 500) + '...' : ctx.emailBody;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📨 새 메일 수신 — ${ctx.campaignName}`, emoji: true }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*인플루언서:*\n${ctx.influencerName}` },
        { type: "mrkdwn", text: `*보낸 사람:*\n${ctx.senderEmail}` },
      ]
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*메일 내용:*\n>${bodyPreview.replace(/\n/g, '\n>')}` }
    },
    { type: "divider" },
  ];

  if (aiDraft) {
    const draftPreview = aiDraft.draft.length > 800 ? aiDraft.draft.substring(0, 800) + '...' : aiDraft.draft;

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `✨ *AI 초안* (${aiDraft.classification} ${aiDraft.classificationLabel})\n\`\`\`${draftPreview}\`\`\`` }
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

    blocks.push({ type: "actions", block_id: `actions_${ctx.conversationId}`, elements: actionElements });

    blocks.push({
      type: "actions",
      block_id: `regen_${ctx.conversationId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🔄 다른 답변 요청하기", emoji: true },
          action_id: "open_regenerate_modal",
          value: JSON.stringify({ conversationId: ctx.conversationId, workspaceId: ctx.workspaceId }),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ 닫기", emoji: true },
          action_id: "dismiss_draft",
          value: JSON.stringify({ draftId: aiDraft.draftId }),
        },
      ]
    });
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

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
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

    const data = await response.json();
    if (!data.ok) {
      console.error('[SlackBot] Failed to send message:', data.error);
    } else {
      console.log(`[SlackBot] Notification sent for conversation ${ctx.conversationId}`);
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
    return handleSendDraft(payload, parsed);
  } else if (actionId.startsWith('regenerate_alt_')) {
    return handleRegenerateAlt(payload, parsed);
  } else if (actionId === 'open_regenerate_modal') {
    return handleOpenRegenerateModal(payload, parsed);
  } else if (actionId === 'dismiss_draft') {
    return handleDismissDraft(payload, parsed);
  } else if (actionId === 'generate_draft') {
    return handleGenerateNewDraft(payload, parsed);
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

  try {
    await fetch('https://slack.com/api/views.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${workspace.slackBotToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trigger_id: triggerId,
        view: {
          type: "modal",
          callback_id: "regenerate_with_feedback",
          private_metadata: JSON.stringify({ conversationId, workspaceId }),
          title: { type: "plain_text", text: "AI 초안 재생성" },
          submit: { type: "plain_text", text: "재생성" },
          blocks: [
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
            }
          ],
        },
      }),
    });
  } catch (err) {
    console.error('[SlackBot] Open modal error:', err);
  }

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

  const messages = await storage.getConversationMessages(conversationId);
  if (messages.length === 0) return;

  const { generateEmailDraft } = await import('./ai/draft-generator');
  const result = await generateEmailDraft(
    messages,
    lineItem.influencer || {},
    campaign,
    workspace,
    lineItem.offerFee,
    userFeedback,
    requestedClassification,
    requestedClassificationLabel,
  );

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
    const draftPreview = result.draft.length > 800 ? result.draft.substring(0, 800) + '...' : result.draft;
    const existingBlocks = (payload.message.blocks || []).slice(0, 4);

    const newBlocks: SlackBlock[] = [
      ...existingBlocks,
      {
        type: "section",
        text: { type: "mrkdwn", text: `✨ *AI 초안* (${result.classification} ${result.classificationLabel})\n\`\`\`${draftPreview}\`\`\`` }
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

    newBlocks.push({ type: "actions", block_id: `actions_${conversationId}_${Date.now()}`, elements: actionElements });
    newBlocks.push({
      type: "actions",
      block_id: `regen_${conversationId}_${Date.now()}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🔄 다른 답변 요청하기", emoji: true },
          action_id: "open_regenerate_modal",
          value: JSON.stringify({ conversationId, workspaceId }),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ 닫기", emoji: true },
          action_id: "dismiss_draft",
          value: JSON.stringify({ draftId: newDraft.id }),
        },
      ]
    });

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
      },
      aiDraftCtx,
      workspace,
    );
  } catch (err) {
    console.error('[SlackBot] notifyInboundEmail error:', err);
  }
}
