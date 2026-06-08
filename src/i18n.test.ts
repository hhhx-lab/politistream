import assert from "assert";
import { createTranslator, getUiText, isLanguage, nextLanguage } from "./i18n";

function testChineseIsDefaultUiLanguage() {
  assert.equal(getUiText("zh", "searchHome.eyebrow"), "深度研究");
  assert.equal(getUiText("zh", "nav.newsCrawler"), "新闻爬虫");
  assert.equal(getUiText("zh", "research.createAndRun"), "创建并运行");
}

function testEnglishSwitchReturnsEnglishLabels() {
  assert.equal(getUiText("en", "searchHome.eyebrow"), "Deep Research");
  assert.equal(getUiText("en", "nav.newsCrawler"), "News Crawler");
  assert.equal(getUiText("en", "research.createAndRun"), "Create & Run");
  assert.equal(getUiText("en", "searchHome.hero"), "One workbench for deep research, data crawling, analytics, and visualization. Search first, drill deeper, analyze, then publish charts.");
  assert.equal(getUiText("en", "searchHome.constraintHint"), "Choose a mode first, then refine constraints. Time range, domains, languages, content types, and keywords are passed to the backend planner.");
}

function testTranslatorFallsBackToKeyForMissingLabels() {
  const t = createTranslator("zh");
  assert.equal(t("missing.label"), "missing.label");
}

function testLanguageHelpers() {
  assert.equal(isLanguage("zh"), true);
  assert.equal(isLanguage("en"), true);
  assert.equal(isLanguage("fr"), false);
  assert.equal(nextLanguage("zh"), "en");
  assert.equal(nextLanguage("en"), "zh");
}

testChineseIsDefaultUiLanguage();
testEnglishSwitchReturnsEnglishLabels();
testTranslatorFallsBackToKeyForMissingLabels();
testLanguageHelpers();

console.log("i18n tests passed");
