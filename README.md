# LScholar

LScholar 是一款美观、高效、智能的桌面端学术文献追踪、管理与阅读辅助工具。它旨在帮助研究人员从繁杂的 RSS 订阅源中自动提取、清洗并智能化管理学术文献，结合本地 RAG（检索增强生成）技术，提供深度的文献问答与每日科研洞察。

![License](https://img.shields.io/badge/license-Non--Commercial-red)
![Electron](https://img.shields.io/badge/Electron-30.x-blue)
![Vue](https://img.shields.io/badge/Vue-3.x-green)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-accent)

## ✨ 核心特性

- 🎨 **现代美学设计**：原生深色模式支持，基于 Tailwind CSS 的 4px 基线网格系统，提供极致的视觉一致性与柔和的交互动画。
- 🤖 **智能 RSS 管理**：支持 AI 辅助生成 RSS 解析脚本，自动清洗非学术内容，确保文献库的纯净度。
- 🧠 **本地 RAG 问答**：集成 LanceDB 向量数据库，支持基于个人文献库的本地 AI 问答，所有检索与推理均可配置私有模型。
- 📅 **每日科研洞察**：AI 自动总结每日新增文献，结合用户研究偏好进行个性化推荐。
- 🗂️ **文献管理与导出**：支持三栏式高效阅读布局，一键导出 RIS 格式至 Zotero 等文献管理软件。
- 📊 **Token 消耗统计**：实时监控 AI 接口使用情况，按日/月统计 Token 消耗。

## 🛠️ 技术栈

- **前端**: Vue 3 (Composition API), Pinia, Element Plus, Tailwind CSS
- **桌面端**: Electron
- **数据库**: 
  - **结构化数据**: SQLite (`better-sqlite3`)
  - **向量数据**: LanceDB
- **图标**: Lucide Icons
- **工具**: Axios, node-cron, tiktoken, electron-builder

## 🚀 快速开始

### 环境要求

- Node.js (建议 v18 或更高)
- pnpm (推荐) 或 npm

### 安装依赖

```bash
pnpm install
```

### 开发模式运行

```bash
pnpm run dev
```

### 构建安装包

```bash
# 构建 Windows 版本
pnpm run build:win

# 构建 macOS 版本
pnpm run build:mac
```

## ⚙️ 配置说明

在“系统设置”中，您可以配置：
- OpenAI 兼容的 API Base URL 与 Key
- LLM 模型与 Embedding 模型名称
- 网络代理设置（支持 http/https）

## 📄 开源协议

本项目采用**非商业性使用协议**。您可以自由地查看、学习和修改代码，但**严禁将本项目及其衍生版本用于任何商业用途**。详情请参阅 [LICENSE](LICENSE) 文件。

---

*LScholar - 让科研追踪更智能。*
