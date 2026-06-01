import puppeteer, { Browser, Page } from "puppeteer";
import { getResearchFetchConfig } from "../config";

let browser: Browser | null = null;
let activePages = 0;
const waiters: Array<() => void> = [];

export async function getBrowserPage(): Promise<Page> {
  const { browserMaxPages } = getResearchFetchConfig();
  while (activePages >= browserMaxPages) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }

  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  activePages += 1;
  const page = await browser.newPage();
  page.once("close", releasePageSlot);
  return page;
}

export async function closeBrowserPool() {
  if (browser) {
    await browser.close();
    browser = null;
  }
  activePages = 0;
  wakeNextWaiter();
}

function releasePageSlot() {
  activePages = Math.max(0, activePages - 1);
  wakeNextWaiter();
}

function wakeNextWaiter() {
  const next = waiters.shift();
  if (next) next();
}
