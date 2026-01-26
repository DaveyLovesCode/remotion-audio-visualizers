#!/usr/bin/env node

/**
 * Performance test runner for the jellyfish scene
 * Uses a standalone test page with Playwright headless
 *
 * Usage: node scripts/perf-test.mjs
 * Output: JSON with averageFps, minFps, maxFps, samples
 */

import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3458;
const TEST_TIMEOUT = 20000; // Max time to wait for test to complete

async function runPerfTest() {
  // Simple HTTP server for the test page
  const publicDir = join(__dirname, "..", "public");
  const server = createServer((req, res) => {
    const filePath = join(publicDir, req.url === "/" ? "perf-test.html" : req.url);
    try {
      const content = readFileSync(filePath);
      const ext = filePath.split(".").pop();
      const contentType = {
        html: "text/html",
        js: "application/javascript",
        css: "text/css",
      }[ext] || "text/plain";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.error(`Server running on http://localhost:${PORT}`);

  try {
    // Launch headless Chromium
    const browser = await chromium.launch({
      headless: true,
      args: ["--headless=new", "--no-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    console.error("Navigating to test page...");
    await page.goto(`http://localhost:${PORT}/perf-test.html`, {
      waitUntil: "load",
      timeout: 30000,
    });

    // Wait for test to complete
    console.error("Waiting for test to complete...");
    const startWait = Date.now();
    let result = null;

    while (Date.now() - startWait < TEST_TIMEOUT) {
      result = await page.evaluate(() => window.__fpsData?.result);
      if (result) break;
      await sleep(500);
    }

    if (!result) {
      // Get current state for debugging
      const state = await page.evaluate(() => ({
        done: window.__fpsData?.done,
        samples: window.__fpsData?.samples?.length,
        measuring: window.__fpsData?.measuring,
      }));
      result = { error: "Test timed out", state };
    }

    await browser.close();
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    server.close();
  }
}

runPerfTest().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
