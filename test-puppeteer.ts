import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

async function test() {
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const url = 'https://finance.yahoo.com/news/winklevoss-twins-sell-130m-bitcoin-115715521.html';
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const content = await page.content();
    await browser.close();
    
    const dom = new JSDOM(content, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (article && article.textContent) {
      console.log("Extracted length:", article.textContent.length);
      console.log("Snippet:", article.textContent.replace(/\s+/g, ' ').trim().substring(0, 200));
    } else {
      console.log("Readability failed to extract content.");
    }
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
test();
