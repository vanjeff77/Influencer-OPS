import * as fs from "fs";
import * as path from "path";
import { createProvider } from "./llm-provider";
import type { Conversation, ConversationMessage, Influencer, Campaign, Workspace } from "@shared/schema";

let defaultFrameworkDoc: string | null = null;

export function getDefaultFrameworkDoc(): string {
  if (!defaultFrameworkDoc) {
    const candidates = [
      path.join(process.cwd(), "server", "ai", "email-framework.md"),
      path.join(process.cwd(), "dist", "server", "ai", "email-framework.md"),
    ];
    for (const docPath of candidates) {
      try {
        defaultFrameworkDoc = fs.readFileSync(docPath, "utf-8");
        break;
      } catch {}
    }
    if (!defaultFrameworkDoc) defaultFrameworkDoc = "";
  }
  return defaultFrameworkDoc;
}

function getFrameworkDoc(workspace: Workspace): string {
  if (workspace.aiFrameworkDoc) {
    return workspace.aiFrameworkDoc;
  }
  return getDefaultFrameworkDoc();
}

function buildSystemPrompt(workspace: Workspace): string {
  const framework = getFrameworkDoc(workspace);
  return `당신은 인플루언서 마케팅 에이전시 "밴스드"의 이메일 대응 AI 어시스턴트입니다.
아래 이메일 대응 프레임워크 문서를 숙지하고, 인플루언서의 이메일에 대한 답장 초안을 작성합니다.

## 프레임워크 문서

${framework}

## 출력 규칙

반드시 아래 JSON 형식으로만 응답하세요. JSON 외의 텍스트는 포함하지 마세요.

\`\`\`json
{
  "classification": "분류 코드 (예: A-3, B-1, R-2 등)",
  "classificationLabel": "분류 라벨 (예: 소폭 초과 네고, 즉시 수락 등)",
  "draft": "생성된 답장 초안 전체 텍스트",
  "alternatives": [
    { "classification": "대안1 코드", "classificationLabel": "대안1 라벨" },
    { "classification": "대안2 코드", "classificationLabel": "대안2 라벨" }
  ]
}
\`\`\`

- "alternatives"는 현재 선택한 분류 외에 차순위로 가능성 있는 대안 응답 옵션 2개입니다
- 각 대안은 해당 상황에서 담당자가 선택할 수 있는 다른 대응 방식이어야 합니다
- 예: 메인이 "네고 제안(R-2)"이면 대안으로 "수락(R-3)", "거절(R-1)" 등을 제시

## 답장 작성 규칙
1. 프레임워크의 톤&매너 규칙(섹션 0)을 반드시 따르세요
2. 인플루언서 응답을 PHASE 2 분류 체계에 따라 정확히 분류하세요
3. 분류에 맞는 PHASE 3 답장 템플릿을 사용하되, 맥락에 맞게 자연스럽게 조정하세요
4. 변수({인플루언서명}, {클라이언트} 등)는 제공된 컨텍스트 정보로 치환하세요
5. 치환할 수 없는 변수는 {변수명} 형태로 남겨두세요
6. 대화 이력에서 밴스드 측이 이전에 사용한 담당자명을 파악하여, 답장 끝에 동일한 이름으로 자연스럽게 서명하세요 (예: "감사합니다\\n김주현 드림"). 이전 대화에서 담당자명을 파악할 수 없으면 서명을 생략하세요`;
}

function buildUserPrompt(
  messages: ConversationMessage[],
  influencer: Partial<Influencer>,
  campaign: Partial<Campaign>,
  offerFee?: number | null,
  userFeedback?: string,
): string {
  const recentMessages = messages.slice(-10);
  
  const conversationHistory = recentMessages.map(m => {
    const direction = m.direction === "inbound" ? "인플루언서" : "밴스드";
    const text = m.bodyText || m.snippet || "(내용 없음)";
    const truncated = text.length > 1000 ? text.substring(0, 1000) + "..." : text;
    return `[${direction}] ${truncated}`;
  }).join("\n\n---\n\n");

  const parts: string[] = [];
  
  parts.push("## 대화 이력 (최신순)");
  parts.push(conversationHistory);
  
  parts.push("\n## 컨텍스트 정보");
  if (influencer.name) parts.push(`- 인플루언서명: ${influencer.name}`);
  if (campaign.name) parts.push(`- 캠페인명: ${campaign.name}`);
  if (campaign.client) parts.push(`- 클라이언트: ${campaign.client}`);
  if (offerFee != null) parts.push(`- 제안 단가: ${offerFee.toLocaleString()}원`);

  if (campaign.aiInstruction) {
    parts.push("\n## 캠페인별 추가 지침");
    parts.push(campaign.aiInstruction);
  }

  if (userFeedback && userFeedback.trim()) {
    parts.push("\n## 사용자 추가 요청사항");
    parts.push(userFeedback.trim());
  }
  
  parts.push("\n위 대화의 마지막 인플루언서 메시지에 대한 답장 초안을 작성해주세요.");

  return parts.join("\n");
}

export interface DraftAlternative {
  classification: string;
  classificationLabel: string;
}

export interface DraftResult {
  draft: string;
  classification: string;
  classificationLabel: string;
  alternatives?: DraftAlternative[];
}

export async function generateEmailDraft(
  messages: ConversationMessage[],
  influencer: Partial<Influencer>,
  campaign: Partial<Campaign>,
  workspace: Workspace,
  offerFee?: number | null,
  userFeedback?: string,
  requestedClassification?: string,
  requestedClassificationLabel?: string,
): Promise<DraftResult> {
  const provider = createProvider(workspace);
  const systemPrompt = buildSystemPrompt(workspace);
  
  let feedback = userFeedback;
  if (requestedClassification) {
    const classificationInstruction = `지정된 분류 코드로 초안을 작성하세요: ${requestedClassification}${requestedClassificationLabel ? ` (${requestedClassificationLabel})` : ''}. 이 분류에 맞는 PHASE 3 답장 템플릿을 사용하세요.`;
    feedback = feedback ? `${feedback}\n\n${classificationInstruction}` : classificationInstruction;
  }
  
  const userPrompt = buildUserPrompt(messages, influencer, campaign, offerFee, feedback);

  const result = await provider.generateDraft(systemPrompt, userPrompt);
  
  return {
    draft: result.draft,
    classification: result.classification,
    classificationLabel: result.classificationLabel,
    alternatives: Array.isArray(result.alternatives) ? result.alternatives : undefined,
  };
}
