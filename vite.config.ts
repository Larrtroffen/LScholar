import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  css: {
    postcss: {
      plugins: [
        tailwindcss,
        autoprefixer,
      ],
    },
  },
  plugins: [
    vue(),
    wasm(),
    topLevelAwait(),
    electron([
      {
        // ================= MAIN PROCESS =================
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              // 关键修复 1：必须包含 'electron'
              external: [
                'electron', 
                'better-sqlite3',
                'tiktoken',
                '@lancedb/lancedb',
                'apache-arrow',
                'vm2',
                'tslib',
                'node-cron',
                '@xenova/transformers',
                'onnxruntime-node',
                'onnxruntime-web'
              ],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            }
          }
        }
      },
      {
        // ================= WORKER =================
        entry: 'src/main/embedding.worker.ts',
        vite: {
          build: {
            outDir: 'dist', // 确保这个目录是对的，通常 workers 放在 dist/main 下可能更好管理，但按你原配置放在 dist 也可以
            rollupOptions: {
              // 关键修复 2：Worker 也需要排除 electron (如果用了) 和其他原生库
              external: ['electron', '@xenova/transformers', 'onnxruntime-node'],
              output: {
                format: 'cjs', // 关键：Worker 也强制 CJS
                entryFileNames: 'embedding.worker.js', // 显式命名，避免混淆
              }
            }
          }
        }
      },
      {
        // ================= PRELOAD =================
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist/preload',
            rollupOptions: {
              // 关键修复 3：Preload 排除 electron
              external: ['electron'],
              output: {
                format: 'cjs', // 关键：Preload 强制 CJS
                entryFileNames: '[name].js',
              }
            }
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
    },
  },
});
