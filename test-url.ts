import axios from 'axios';
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

async function test() {
  const url = 'https://www.cnbc.com/2026/03/17/orlando-bravo-pushes-back-on-private-markets-criticism-everybodys-extremely-comfortable.html';
  
  console.log("Testing Jina...");
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await axios.get(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown"
      },
      timeout: 10000,
    });
    console.log("Jina Success! Length:", response.data.length);
  } catch (error: any) {
    console.log("Jina Error:", error.message);
  }

  console.log("Testing Puppeteer...");
  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const content = await page.content();
    
    const dom = new JSDOM(content, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article && article.textContent && article.textContent.length > 500) {
      console.log("Puppeteer Success! Length:", article.textContent.length);
    } else {
      console.log("Puppeteer parsed content too short or null");
    }
  } catch (e: any) {
    console.log("Puppeteer Error:", e.message);
  } finally {
    if (browser) {
      await browser.close().catch(console.error);
    }
  }
}
test();
