import axios from 'axios';
import { db } from './db';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import ModelService from './services/ModelService';

// 定义 AI 配置接口
export interface AIConfig {
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  proxyUrl?: string;
}

// 获取主窗口实例
function getMainWindow() {
  return BrowserWindow.getAllWindows()[0];
}

// 获取模型缓存目录
function getModelCacheDir() {
  const isDev = !app.isPackaged;
  const cacheDir = isDev 
    ? path.join(process.cwd(), '.cache')
    : path.join(app.getPath('userData'), '.cache');
  return cacheDir;
}

// 检查模型是否已下载
export function checkModelExists(modelName: string): boolean {
  const cacheDir = getModelCacheDir();
  const modelPath = path.join(cacheDir, modelName.replace(/\//g, '-'));
  return fs.existsSync(modelPath);
}

// 手动下载模型
export async function downloadModel(modelName: string): Promise<void> {
  const mainWindow = getMainWindow();
  
  // 清除当前实例，强制重新加载
  LocalEmbeddingModel.clearInstance();
  
  // 触发加载，这会启动下载流程
  // 注意：这里我们临时传入 modelName 给 getInstance，或者修改 getInstance 支持参数
  await LocalEmbeddingModel.loadModel(modelName);
}

export async function getAISettings() {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
  const modelService = ModelService.getInstance();
  const activeModel = modelService.getModelForFunction('main');
  
  if (activeModel) {
    return {
      ...settings,
      llm_base_url: activeModel.base_url,
      llm_api_key: activeModel.api_key,
      llm_model_name: activeModel.model_name,
      proxy_url: activeModel.proxy_url
    };
  }
  return settings;
}

// 本地 Embedding 模型管理器
class LocalEmbeddingModel {
  private static instance: any = null;
  private static currentModel: string = '';
  private static initializationPromise: Promise<any> | null = null;

  static clearInstance() {
    this.instance = null;
    this.currentModel = '';
    this.initializationPromise = null;
  }

  // 专门用于下载或加载指定模型的方法
  static async loadModel(modelName: string) {
    // 如果正在初始化，等待初始化完成
    if (this.initializationPromise) {
      if (this.currentModel === modelName) {
        return this.initializationPromise;
      }
      this.initializationPromise = null;
    }

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    this.initializationPromise = (async () => {
      try {
        if (this.instance && this.currentModel !== modelName) {
          console.log('🔄 模型已更改，正在重新加载...');
          this.instance = null;
        }

        console.log(`🔄 正在加载本地 Embedding 模型: ${modelName}...`);
        
        const { pipeline, env } = await import('@xenova/transformers');
        
        const cacheDir = getModelCacheDir();
        env.cacheDir = cacheDir;
        env.allowLocalModels = true; 
        env.useBrowserCache = false;

        const mainWindow = getMainWindow();
        const progressCallback = (progress: any) => {
          if (mainWindow) {
            if (progress.status === 'progress') {
              const percent = Math.round(progress.progress * 100);
              mainWindow.webContents.send('embedding-download-progress', {
                percent,
                file: progress.file,
                progress: progress.progress
              });
            } else if (progress.status === 'done') {
              mainWindow.webContents.send('embedding-download-progress', {
                percent: 100,
                file: progress.file,
                progress: 1
              });
            }
          }
        };
        
        const newInstance = await pipeline('feature-extraction', modelName, {
          quantized: true,
          progress_callback: progressCallback
        });
        
        this.instance = newInstance;
        this.currentModel = modelName;
        console.log('✅ 本地 Embedding 模型加载完成');
        return this.instance;
      } catch (error) {
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  // 保持兼容性，但通常不应再被直接调用，除非是旧代码路径
  static async getInstance() {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    // 尝试从 ai_models 获取当前选中的本地模型，如果 settings 中存的是 ID
    // 但为了简单，这里我们假设调用者会使用 loadModel
    const modelName = settings.local_embedding_model || 'Xenova/bge-small-zh-v1.5';
    return this.loadModel(modelName);
  }

  static async generate(text: string, modelName?: string): Promise<number[]> {
    try {
      // 如果提供了 modelName，则加载该模型；否则加载默认
      const extractor = modelName ? await this.loadModel(modelName) : await this.getInstance();
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });
      return Array.from(output.data);
    } catch (error) {
      console.error('本地 Embedding 生成失败:', error);
      throw new Error('本地 Embedding 模型生成失败，请检查模型是否正确加载');
    }
  }
}

export async function updateTokenUsage(tokens: number) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO token_usage (date, tokens_used)
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET tokens_used = tokens_used + ?
  `).run(today, tokens, tokens);
}

function calculateTokens(text: string, modelName: string) {
  if (!text) return 0;
  try {
    const enc = encoding_for_model(modelName as TiktokenModel);
    const tokens = enc.encode(text).length;
    enc.free();
    return tokens;
  } catch {
    return Math.ceil((text || "").length / 4); // Fallback
  }
}

export async function callLLM(
  prompt: string, 
  systemPrompt: string = "You are a helpful academic assistant.", 
  maxTokens: number = 4000,
  config?: AIConfig
) {
  const modelService = ModelService.getInstance();
  const activeModel = modelService.getModelForFunction('main');
  
  // 优先使用传入的配置，否则使用通用配置
  const finalBaseUrl = config?.baseUrl || activeModel?.base_url;
  const finalApiKey = config?.apiKey || activeModel?.api_key;
  const finalModelName = config?.modelName || activeModel?.model_name;
  const finalProxyUrl = config?.proxyUrl || activeModel?.proxy_url;

  // 检查是否为本地模型（通过 URL 判断）
  const isLocalModel = finalBaseUrl && (
    finalBaseUrl.includes('localhost') || 
    finalBaseUrl.includes('127.0.0.1') ||
    finalBaseUrl.includes('0.0.0.0')
  );

  if (!finalBaseUrl) {
    throw new Error('API Base URL 未设置，请在设置页面配置 LLM API 地址');
  }

  if (!finalModelName) {
    throw new Error('LLM 模型未设置，请在设置页面配置模型名称（如 gpt-3.5-turbo）');
  }

  // 本地模型可以不需要 API Key
  if (!isLocalModel && !finalApiKey) {
    throw new Error('API Key 未设置，请在设置页面配置 LLM API Key');
  }

  try {
    const headers: any = {
      'Content-Type': 'application/json'
    };

    // 只有非本地模型才需要 Authorization header
    if (!isLocalModel && finalApiKey) {
      headers['Authorization'] = `Bearer ${finalApiKey}`;
    }

    const response = await axios.post(
      `${finalBaseUrl}/chat/completions`,
      {
        model: finalModelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        stream: false
      },
      {
        headers,
        proxy: finalProxyUrl ? {
          host: new URL(finalProxyUrl).hostname,
          port: parseInt(new URL(finalProxyUrl).port)
        } : false,
        timeout: 120000 // 2分钟超时，LLM 响应可能较慢
      }
    );

    const content = response.data.choices?.[0]?.message?.content || "";
    
    // Calculate tokens
    const inputTokens = calculateTokens((prompt || "") + (systemPrompt || ""), finalModelName);
    const outputTokens = calculateTokens(content, finalModelName);
    await updateTokenUsage(inputTokens + outputTokens);

    return content;
  } catch (error: any) {
    if (error.response) {
      // 服务器返回了错误响应
      const status = error.response.status;
      const data = error.response.data;
      let errorMsg = `LLM API 请求失败 (状态码: ${status})`;
      
      if (data && data.error) {
        errorMsg += `\n错误详情: ${data.error.message || data.error}`;
      } else if (data) {
        errorMsg += `\n错误详情: ${JSON.stringify(data)}`;
      }
      
      if (status === 400) {
        errorMsg += '\n\n可能原因：\n1. 模型名称不正确\n2. API Key 无效\n3. 请求参数格式不符合要求\n4. max_tokens 超出模型限制';
      } else if (status === 401) {
        errorMsg += '\n\n可能原因：API Key 无效或已过期';
      } else if (status === 429) {
        errorMsg += '\n\n可能原因：请求过于频繁，请稍后再试';
      }
      
      throw new Error(errorMsg);
    } else if (error.request) {
      // 请求已发出但没有收到响应
      throw new Error(`网络连接失败: ${error.message}\n\n请检查：\n1. Base URL 是否正确\n2. 网络连接是否正常\n3. 代理设置是否正确\n4. 防火墙是否阻止了连接\n5. 如果使用本地模型，请确保服务已启动`);
    } else {
      // 请求配置出错
      throw new Error(`请求配置错误: ${error.message}`);
    }
  }
}

export async function getEmbeddingSettings() {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
  const modelService = ModelService.getInstance();
  const activeModel = modelService.getModelForFunction('embedding');

  if (activeModel) {
    return {
      mode: settings.embedding_mode || 'remote',
      baseUrl: activeModel.base_url,
      apiKey: activeModel.api_key,
      modelName: activeModel.model_name,
      proxyUrl: activeModel.proxy_url,
      localModel: settings.local_embedding_model
    };
  }

  return {
    mode: settings.embedding_mode || 'remote',
    baseUrl: settings.embed_base_url,
    apiKey: settings.embed_api_key,
    modelName: settings.embed_model_name,
    proxyUrl: settings.embed_proxy_url,
    localModel: settings.local_embedding_model
  };
}

export async function getTranslationSettings() {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
  const modelService = ModelService.getInstance();
  const activeModel = modelService.getModelForFunction('translation');

  if (activeModel) {
    return {
      enabled: settings.translation_enabled === 1,
      autoEnabled: settings.auto_translation_enabled === 1,
      mode: settings.translation_mode || 'append',
      baseUrl: activeModel.base_url,
      apiKey: activeModel.api_key,
      modelName: activeModel.model_name,
      proxyUrl: activeModel.proxy_url
    };
  }

  return {
    enabled: settings.translation_enabled === 1,
    autoEnabled: settings.auto_translation_enabled === 1,
    mode: settings.translation_mode || 'append',
    baseUrl: settings.trans_llm_base_url,
    apiKey: settings.trans_llm_api_key,
    modelName: settings.trans_llm_model_name,
    proxyUrl: settings.trans_proxy_url
  };
}

export async function generateEmbedding(text: string, config?: AIConfig) {
  // 如果没有传入 config，尝试获取全局设置（兼容旧逻辑）
  const finalConfig = config || await getEmbeddingSettings();

  // 检查是否为本地模型 (provider === 'local' 或 mode === 'local')
  // 注意：新架构下，VectorService 会直接调用 Worker，这里主要作为 fallback 或测试用
  const isLocal = (finalConfig as any).mode === 'local' || (finalConfig as any).provider === 'local';

  if (isLocal) {
    console.log('🤖 使用本地 Embedding 模型生成向量...');
    try {
      // 优先使用传入的 modelName，否则回退到 localModel
      const modelName = finalConfig.modelName || (finalConfig as any).localModel;
      return await LocalEmbeddingModel.generate(text, modelName);
    } catch (error: any) {
      throw new Error(`本地 Embedding 生成失败: ${error.message}`);
    }
  }

  // 远程模式
  const finalBaseUrl = finalConfig.baseUrl;
  const finalApiKey = finalConfig.apiKey;
  const finalModelName = finalConfig.modelName;
  const finalProxyUrl = finalConfig.proxyUrl;

  if (!finalBaseUrl) {
    throw new Error('Embedding Base URL 未设置');
  }

  if (!finalApiKey) {
    throw new Error('Embedding API Key 未设置');
  }

  if (!finalModelName) {
    throw new Error('Embedding 模型未设置');
  }

  try {
    console.log('🌐 使用远程 Embedding API 生成向量...');
    const response = await axios.post(
      `${finalBaseUrl}/embeddings`,
      {
        model: finalModelName,
        input: text
      },
      {
        headers: {
          'Authorization': `Bearer ${finalApiKey}`,
          'Content-Type': 'application/json'
        },
        proxy: finalProxyUrl ? {
          host: new URL(finalProxyUrl).hostname,
          port: parseInt(new URL(finalProxyUrl).port)
        } : false,
        timeout: 30000 // 30秒超时
      }
    );
    return response.data.data[0].embedding;
  } catch (error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      let errorMsg = `Embedding API 请求失败 (状态码: ${status})`;
      
      if (data && data.error) {
        errorMsg += `\n错误详情: ${data.error.message || data.error}`;
      } else if (data) {
        errorMsg += `\n错误详情: ${JSON.stringify(data)}`;
      }
      
      if (status === 400) {
        errorMsg += '\n\n可能原因：\n1. Embedding 模型名称不正确\n2. API Key 无效\n3. 请求参数格式不符合要求';
      }
      
      throw new Error(errorMsg);
    } else if (error.request) {
      throw new Error(`网络连接失败: ${error.message}\n\n请检查：\n1. Base URL 是否正确\n2. 网络连接是否正常\n3. 代理设置是否正确`);
    } else {
      throw new Error(`请求配置错误: ${error.message}`);
    }
  }
}
