# PolitiStream: 实时政治动态聚合平台

![PolitiStream Banner](https://img.shields.io/badge/Status-Development-orange)
![Version](https://img.shields.io/badge/Version-0.1.0-blue)
![Tech Stack](https://img.shields.io/badge/Tech-React19_%7C_Express_%7C_SQLite_%7C_AI-green)

PolitiStream 是一个专为决策者和政治观察家设计的高性能、实时的美国政治新闻聚合平台。通过结合分布式爬虫技术与先进的 AI 内容治理引擎，PolitiStream 旨在从繁杂的信息流中提取出清晰、客观、可验证的核心动态。

---

## 🚀 核心特性

- **实时感知 (Real-time Ingestion)**: 
    - 集成权威 RSS 源（AP, Reuters, Politico, CNN）。
    - 60 秒极速轮询，确保第一时间捕捉突发动态。
- **AI 治理引擎 (AI Governance)**:
    - 由 **Gemini 2.5 Flash** 驱动。
    - **自动摘要**: 为每条新闻生成精准的三点高管摘要。
    - **情感量化**: 提供 -1.0 至 +1.0 的情感评分，洞察舆论走势。
    - **实体提取**: 自动识别关键政治人物及组织。
- **专家级 UI (Premium Visuals)**:
    - 基于 **React 19** 与 **Tailwind CSS v4** 构建。
    - 使用 **Motion** 打造细腻的微交互与平滑过渡。
    - “技术仪表盘”风格设计，高对比度，支撑沉浸式阅读。
- **高性能架构**:
    - 后端采用 **Express** + **better-sqlite3**。
    - 启用 **WAL (Write-Ahead Logging)** 模式，支持高并发读写。

---

## 🛠️ 技术选型

### 前端
- **React 19**: 响应式组件化开发。
- **Tailwind CSS v4**: 现代化的样式实用工具。
- **Motion**: 交互动画引擎。
- **Lucide React**: 矢量图标库。

### 后端
- **Node.js (Express)**: RESTful API 服务。
- **better-sqlite3**: 本地高性能关系型数据库。
- **Puppeteer / Cheerio**: 网页抓取与内容提取。

### AI 层
- **Google Gemini API**: 大模型内容理解与结构化。

---

## 📦 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd politistream
```

### 2. 环境配置
在根目录下创建 `.env` 文件，并填写必要的 API 密钥：

```env
GEMINI_API_KEY=your_google_gemini_api_key_here
PORT=3000
```

### 3. 安装依赖
```bash
npm install
```

### 4. 启动开发服务器
```bash
npm run dev
```
访问 `http://localhost:3000` 即可查看仪表盘。

---

## 📂 目录结构

```text
.
├── app/                  # 应用核心逻辑 (可能包含实验性组件)
├── src/
│   ├── components/       # UI 组件 (React)
│   ├── server/           # 后端逻辑
│   │   ├── db.ts         # SQLite 数据库配置与操作
│   │   └── services/     # RSS 抓取与 Gemini 处理服务
│   ├── types.ts          # TypeScript 类型定义
│   ├── App.tsx           # 前端入口组件
│   └── main.tsx          # 前端渲染起点
├── server.ts             # Express 服务入口 (集成 Vite 中间件)
├── DESIGN.md             # 技术架构与设计方案
└── package.json          # 依赖管理
```

---

## 🧪 测试脚本

项目包含多个测试脚本用于验证核心功能：
- `test-jina.ts`: 测试 Jina Reader 内容提取。
- `test-readability.ts`: 测试新闻正文可读性处理。
- `test-url.ts`: 验证 URL 抓取逻辑。

---

## 📝 许可证

[MIT License](LICENSE)

---

> **Note**: 本项目尚处于快速迭代阶段。AI 生成的内容仅供参考，请结合原始链接进行验证。
