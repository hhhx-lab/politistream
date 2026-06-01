import assert from "assert";
import { getServerRuntimeConfig } from "./runtime";

function testDefaultRuntimeConfig() {
  const config = getServerRuntimeConfig({});
  assert.equal(config.port, 3001);
  assert.equal(config.appUrl, "http://localhost:3000");
  assert.equal(config.refreshRssOnStartup, false);
}

function testBackendPortOverridesPort() {
  const config = getServerRuntimeConfig({
    BACKEND_PORT: "4100",
    PORT: "3900",
    APP_URL: "http://localhost:5173",
    RSS_REFRESH_ON_STARTUP: "true",
  });

  assert.equal(config.port, 4100);
  assert.equal(config.appUrl, "http://localhost:5173");
  assert.equal(config.refreshRssOnStartup, true);
}

function testPortFallbackAndInvalidValues() {
  assert.equal(getServerRuntimeConfig({ PORT: "3900" }).port, 3900);
  assert.equal(getServerRuntimeConfig({ BACKEND_PORT: "nope", PORT: "bad" }).port, 3001);
  assert.equal(getServerRuntimeConfig({ RSS_REFRESH_ON_STARTUP: "false" }).refreshRssOnStartup, false);
  assert.equal(getServerRuntimeConfig({ RSS_REFRESH_ON_STARTUP: "1" }).refreshRssOnStartup, true);
}

testDefaultRuntimeConfig();
testBackendPortOverridesPort();
testPortFallbackAndInvalidValues();

console.log("runtime tests passed");
