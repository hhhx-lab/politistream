import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

async function test() {
  try {
    const url = 'https://finance.yahoo.com/news/winklevoss-twins-sell-130m-bitcoin-115715521.html';
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await axios.get(proxyUrl, { timeout: 10000 });
    
    const dom = new JSDOM(response.data, { url });
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
