import { parentPort, workerData } from 'worker_threads';

/**
 * Embedding Worker
 * 负责在独立进程中加载模型并进行推理，避免阻塞主进程
 * 改为长驻进程模式，模型只加载一次
 */

let extractor: any = null;
let currentModelName: string = '';

async function getExtractor(modelName: string, cacheDir: string) {
  if (extractor && currentModelName === modelName) {
    return extractor;
  }

  try {
    const { pipeline, env } = await import('@xenova/transformers');
    
    env.cacheDir = cacheDir;
    env.allowLocalModels = true;
    env.useBrowserCache = false;

    console.log(`[Worker] Loading model: ${modelName}`);
    
    const progress_callback = (progress: any) => {
      sendResult({ status: 'loading', progress });
    };

    extractor = await pipeline('feature-extraction', modelName, {
      quantized: true,
      progress_callback
    });
    currentModelName = modelName;
    return extractor;
  } catch (error: any) {
    console.error(`[Worker] Failed to load model ${modelName}:`, error);
    throw error;
  }
}

async function handleTask(data: any) {
  const { modelName, cacheDir, text, taskId } = data;

  try {
    const pipelineInstance = await getExtractor(modelName, cacheDir);

    const output = await pipelineInstance(text, {
      pooling: 'mean',
      normalize: true,
    });

    const embedding = Array.from(output.data);
    
    sendResult({ success: true, embedding, taskId });
  } catch (error: any) {
    sendResult({ success: false, error: error.message, taskId });
  }
}

function sendResult(result: any) {
  if (parentPort) {
    parentPort.postMessage(result);
  } else if (process.send) {
    process.send(result);
  }
}

// 处理启动逻辑
if (parentPort) {
  parentPort.on('message', (data: any) => {
    handleTask(data);
  });
} else {
  (process as any).on('message', (data: any) => {
    handleTask(data);
  });
}

// 发送就绪信号
sendResult({ status: 'ready' });