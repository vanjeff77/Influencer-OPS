import { createProvider } from "./llm-provider";

export interface CandidateProfile {
  handle: string;
  followers?: number;
  bio?: string;
  category?: string;
  verified?: boolean;
  profileImageUrl?: string;
  sourceSeeds: string[];
}

export interface AnalysisResult {
  handle: string;
  score: number;
  reason: string;
}

interface WorkspaceAIConfig {
  aiProvider: string | null;
  aiApiKey: string | null;
  aiModel: string | null;
}

const CHUNK_SIZE = 25;

function buildSystemPrompt(): string {
  return `You are an expert influencer marketing analyst. Your task is to evaluate candidate influencer profiles based on given criteria and assign a relevance score from 0 to 100.

Scoring guidelines:
- 90-100: Perfect match — highly relevant to the criteria, strong metrics
- 70-89: Strong match — mostly aligned with criteria
- 50-69: Moderate match — partially relevant
- 30-49: Weak match — minimal relevance
- 0-29: Poor match — not relevant

When no specific criteria are provided, analyze the seed influencers' common characteristics (category, audience size, content style) and score candidates based on similarity to those patterns.

A candidate who is followed by multiple seed influencers should receive a bonus (up to +15 points) as this indicates stronger relevance in the niche.

You MUST respond with a valid JSON array. Each element must have exactly these fields:
- "handle": string (the candidate's handle)
- "score": number (0-100)
- "reason": string (brief Korean explanation of why this score was assigned, 1-2 sentences)

Example response:
[
  {"handle": "example_user", "score": 82, "reason": "뷰티 카테고리에서 활발히 활동하며, 팔로워 대비 높은 참여율을 보임"},
  {"handle": "another_user", "score": 45, "reason": "카테고리는 유사하나 팔로워 규모가 기준에 미달"}
]

Do NOT include any text outside the JSON array. Only output the JSON array.`;
}

function buildUserPrompt(
  candidates: CandidateProfile[],
  seedHandles: string[],
  criteria?: string | null
): string {
  const seedInfo = `시드 인플루언서: ${seedHandles.map(h => `@${h}`).join(", ")}`;

  const criteriaInfo = criteria
    ? `사용자 조건: ${criteria}`
    : "사용자 조건: 없음 (시드 인플루언서들의 공통 특성을 기반으로 평가해주세요)";

  const candidateList = candidates.map((c, i) => {
    const parts = [`${i + 1}. @${c.handle}`];
    if (c.followers != null) parts.push(`팔로워: ${c.followers.toLocaleString()}`);
    if (c.bio) parts.push(`바이오: ${c.bio}`);
    if (c.category) parts.push(`카테고리: ${c.category}`);
    if (c.verified) parts.push("인증됨");
    parts.push(`공통 시드 수: ${c.sourceSeeds.length}명 (${c.sourceSeeds.map(s => `@${s}`).join(", ")})`);
    return parts.join(" | ");
  }).join("\n");

  return `${seedInfo}\n${criteriaInfo}\n\n후보 프로필 목록:\n${candidateList}\n\nJSON 배열로 각 후보의 score와 reason을 평가해주세요.`;
}

function parseAnalysisResponse(content: string): AnalysisResult[] {
  try {
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => item.handle && typeof item.score === "number")
          .map((item: any) => ({
            handle: item.handle.replace(/^@/, ""),
            score: Math.max(0, Math.min(100, item.score)),
            reason: item.reason || "",
          }));
      }
    }
  } catch (e) {
    // fall through
  }

  try {
    const jsonObjects = content.match(/\{[^{}]*"handle"[^{}]*\}/g);
    if (jsonObjects) {
      return jsonObjects
        .map((str: string) => {
          try {
            const obj = JSON.parse(str);
            return {
              handle: (obj.handle || "").replace(/^@/, ""),
              score: Math.max(0, Math.min(100, obj.score || 0)),
              reason: obj.reason || "",
            };
          } catch {
            return null;
          }
        })
        .filter((r): r is AnalysisResult => r !== null && r.handle !== "");
    }
  } catch (e) {
    // fall through
  }

  return [];
}

function applySourceSeedBonus(results: AnalysisResult[], candidates: CandidateProfile[]): AnalysisResult[] {
  const candidateMap = new Map<string, CandidateProfile>();
  for (const c of candidates) {
    candidateMap.set(c.handle.toLowerCase(), c);
  }

  return results.map(r => {
    const candidate = candidateMap.get(r.handle.toLowerCase());
    if (candidate && candidate.sourceSeeds.length > 1) {
      const bonus = Math.min(15, (candidate.sourceSeeds.length - 1) * 5);
      return {
        ...r,
        score: Math.min(100, r.score + bonus),
      };
    }
    return r;
  });
}

export async function analyzeInfluencerCandidates(
  candidates: CandidateProfile[],
  seedHandles: string[],
  criteria: string | null | undefined,
  workspace: WorkspaceAIConfig
): Promise<AnalysisResult[]> {
  if (candidates.length === 0) return [];

  const provider = createProvider(workspace);
  const systemPrompt = buildSystemPrompt();
  const allResults: AnalysisResult[] = [];

  const chunks: CandidateProfile[][] = [];
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    chunks.push(candidates.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    const userPrompt = buildUserPrompt(chunk, seedHandles, criteria);

    try {
      const response = await provider.generateDraft(systemPrompt, userPrompt);
      const parsed = parseAnalysisResponse(response.draft);

      if (parsed.length > 0) {
        allResults.push(...parsed);
      } else {
        for (const c of chunk) {
          allResults.push({
            handle: c.handle,
            score: c.sourceSeeds.length > 1 ? 50 : 30,
            reason: "AI 분석 결과를 파싱하지 못해 기본 점수가 부여되었습니다.",
          });
        }
      }
    } catch (error) {
      console.error(`AI analysis failed for chunk:`, error);
      for (const c of chunk) {
        allResults.push({
          handle: c.handle,
          score: c.sourceSeeds.length > 1 ? 40 : 20,
          reason: "AI 분석 중 오류가 발생하여 기본 점수가 부여되었습니다.",
        });
      }
    }
  }

  const resultsWithBonus = applySourceSeedBonus(allResults, candidates);
  return resultsWithBonus;
}
