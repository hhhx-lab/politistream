import puppeteer from 'puppeteer';

async function test() {
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://finance.yahoo.com/news/winklevoss-twins-sell-130m-bitcoin-115715521.html', { waitUntil: 'networkidle2', timeout: 30000 });
    const content = await page.content();
    console.log("Success! Length:", content.length);
    await browser.close();
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
test();
