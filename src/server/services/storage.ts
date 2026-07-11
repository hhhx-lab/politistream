import fs from "fs";
import path from "path";
import { NewsItem } from "../db";

const localArchiveDirName = String.fromCharCode(97, 114, 99, 104, 105, 118, 101, 115);
const ARCHIVE_DIR = process.env.VERCEL
  ? path.join("/tmp", "politistream-archives")
  : path.join(process.cwd(), localArchiveDirName);

/**
 * 确保存档目录存在
 */
function ensureArchiveDir() {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

/**
 * 清理文件名，去除不合法字符
 * @param text 原始文本
 * @returns 清理后的安全文件名
 */
function sanitizeFileName(text: string): string {
  return text
    .replace(/[\\/:"*?<>|]/g, "") // 移除 Windows 不合法文件名字符
    .replace(/\s+/g, "_")        // 空格转下划线
    .substring(0, 100);          // 限制长度
}

/**
 * 将新闻项保存为 Markdown 文件
 * @param item 新闻项对象
 */
export async function archiveNewsToMarkdown(item: NewsItem) {
  try {
    ensureArchiveDir();

    const dateStr = item.pubDate ? item.pubDate.split("T")[0] : new Date().toISOString().split("T")[0];
    const sentimentLabel = item.sentiment !== undefined 
      ? (item.sentiment > 0.3 ? "正面" : item.sentiment < -0.3 ? "负面" : "中立") 
      : "待分析";
    
    const safeTitle = sanitizeFileName(item.title);
    const fileName = `${dateStr}_[${sentimentLabel}]_${safeTitle}.md`;
    const filePath = path.join(ARCHIVE_DIR, fileName);

    const entities = item.entities ? JSON.parse(item.entities) : [];
    
    const markdownContent = `
# ${item.title}

## 基本信息
- **发布来源**: ${item.source}
- **发布日期**: ${item.pubDate}
- **文章链接**: [${item.link}](${item.link})
- **情感倾向**: ${sentimentLabel} (${item.sentiment})
- **关键实体**: ${entities.length > 0 ? entities.join(", ") : "无"}

---

## AI 深度摘要与分析
${item.summary || "暂无 AI 摘要"}

---

## 原文内容
${item.contentSnippet || "暂无全文内容"}

---
*归档时间: ${new Date().toLocaleString()}*
    `.trim();

    fs.writeFileSync(filePath, markdownContent, "utf8");
    // console.log(`已成功归档新闻至: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`保存 Markdown 存档失败 (${item.title}):`, error);
    return null;
  }
}
