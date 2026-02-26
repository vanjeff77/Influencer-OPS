import OpenAI from "openai";
import { decryptPassword } from "../imap";

export interface LLMResponse {
  draft: string;
  classification: string;
  classificationLabel: string;
}

export interface LLMProvider {
  generateDraft(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
}

class ReplitAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }

  async generateDraft(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 2048,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    return parseJsonResponse(content);
  }
}

class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string, model: string = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  private model: string;

  async generateDraft(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    return parseJsonResponse(content);
  }
}

class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "claude-sonnet-4-20250514") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateDraft(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errText}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text || "";
    return parseJsonResponse(content);
  }
}

function parseJsonResponse(content: string): LLMResponse {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        draft: parsed.draft || parsed.reply || content,
        classification: parsed.classification || "unknown",
        classificationLabel: parsed.classificationLabel || parsed.classification_label || "미분류",
      };
    }
  } catch (e) {
    // Fall through to fallback
  }

  return {
    draft: content,
    classification: "unknown",
    classificationLabel: "미분류",
  };
}

interface WorkspaceAIConfig {
  aiProvider: string | null;
  aiApiKey: string | null;
  aiModel: string | null;
}

export function createProvider(workspace: WorkspaceAIConfig): LLMProvider {
  const provider = workspace.aiProvider || "replit";

  switch (provider) {
    case "openai": {
      if (!workspace.aiApiKey) throw new Error("OpenAI API key not configured");
      const decryptedKey = decryptPassword(workspace.aiApiKey);
      return new OpenAIProvider(decryptedKey, workspace.aiModel || "gpt-4o");
    }
    case "anthropic": {
      if (!workspace.aiApiKey) throw new Error("Anthropic API key not configured");
      const decryptedKey = decryptPassword(workspace.aiApiKey);
      return new AnthropicProvider(decryptedKey, workspace.aiModel || "claude-sonnet-4-20250514");
    }
    case "replit":
    default:
      return new ReplitAIProvider();
  }
}
