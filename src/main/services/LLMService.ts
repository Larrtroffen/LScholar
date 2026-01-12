import OpenAI from 'openai';
import { configService } from './ConfigService';
import { modelService } from './ModelService';
import { FunctionType } from '../../shared/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export class LLMService {
  private getClient(functionType: FunctionType): { client: OpenAI; modelName: string } {
    const assignment = configService.getAssignment(functionType);
    if (!assignment) {
      throw new Error(`No model assigned for function: ${functionType}`);
    }

    const model = modelService.getById(assignment.model_id);
    if (!model) {
      throw new Error(`Assigned model not found: ${assignment.model_id}`);
    }

    const client = new OpenAI({
      baseURL: model.base_url,
      apiKey: model.api_key || 'dummy',
      dangerouslyAllowBrowser: true
    });

    return { client, modelName: model.model_name };
  }

  async chat(functionType: FunctionType, messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const { client, modelName } = this.getClient(functionType);

    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages: messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        stream: false
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error(`LLM chat error (${functionType}):`, error);
      throw error;
    }
  }

  async *streamChat(functionType: FunctionType, messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
    const { client, modelName } = this.getClient(functionType);

    try {
      const stream = await client.chat.completions.create({
        model: modelName,
        messages: messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error(`LLM stream chat error (${functionType}):`, error);
      throw error;
    }
  }
}

export const llmService = new LLMService();