import "dotenv/config";
import { getNews, initDb } from "./src/server/db";
import { archiveNewsToMarkdown } from "./src/server/services/storage";

async function archiveExisting() {
  console.log("正在初始化数据库并归档历史数据...");
  initDb();
  const allNews = getNews(1000); // 获取前 1000 条
  let count = 0;

  for (const item of allNews) {
    if (item.summary) { // 仅归档已分析过的
      await archiveNewsToMarkdown(item);
      count++;
    }
  }

  console.log(`成功归档 ${count} 篇新闻至 'archives' 文件夹。`);
  process.exit(0);
}

archiveExisting().catch(err => {
  console.error("手动归档失败:", err);
  process.exit(1);
});
