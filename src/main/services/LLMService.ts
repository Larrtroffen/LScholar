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

// 过滤思考链块 - 只移除标签，不触碰代码内容
function cleanThinkingBlocks(text: string): string {
  // 移除 XML 格式的思考标签
  text = text.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '');
  text = text.replace(/<thought[^>]*>[\s\S]*?<\/thought>/gi, '');
  
  // 移除 Markdown 格式的思考标签
  text = text.replace(/<thought_block>[\s\S]*?<\/thought_block>/gi, '');
  
  // 移除以特定前缀开头的行（这些是常见的思考/分析前缀）
  text = text.replace(/^[\s]*[📝💡🔍🤔分析思考]?\s*(Thinking|Analysis|思考|分析)[:：\s].*$/gmi, '');
  
  return text.trim();
}

export class LLMService {
  private getClient(functionType: FunctionType): { client: OpenAI; modelName: string } {
    // 文本生成功能统一使用 main_chat 模型
    if (functionType === 'script_generation' || functionType === 'insight') {
      functionType = 'main_chat';
    }

    const assignment = configService.getAssignment(functionType);
    if (!assignment || assignment.model_id === null) {
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

      const content = response.choices[0]?.message?.content || '';
      return cleanThinkingBlocks(content);
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
        // 流式输出时直接过滤思考块
        const cleaned = cleanThinkingBlocks(content);
        if (cleaned) {
          yield cleaned;
        }
      }
    } catch (error) {
      console.error(`LLM stream chat error (${functionType}):`, error);
      throw error;
    }
  }
}

export const llmService = new LLMService();
