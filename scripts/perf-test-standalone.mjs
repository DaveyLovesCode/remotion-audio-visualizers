#!/usr/bin/env node

/**
 * Standalone performance test runner
 * Uses the real scene components via Vite, without Remotion
 *
 * Usage: node scripts/perf-test-standalone.mjs
 * Output: JSON with averageFps, minFps, maxFps, samples
 */

import { chromium } from "playwright";
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";

const VITE_PORT = 3001;
const TEST_DURATION = 10000;
const WARMUP_DURATION = 3000;
const STARTUP_TIMEOUT = 30000;

async function waitForServer(url, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

async function runPerfTest() {
  console.error("Starting Vite dev server...");

  // Start Vite dev server
  const vite = spawn("npm", ["run", "perf"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  let viteOutput = "";
  vite.stdout.on("data", (d) => (viteOutput += d.toString()));
  vite.stderr.on("data", (d) => (viteOutput += d.toString()));

  try {
    const serverUrl = `http://localhost:${VITE_PORT}`;
    const testPageUrl = `${serverUrl}/index.perf.html`;
    console.error(`Waiting for server at ${testPageUrl}...`);

    const ready = await waitForServer(testPageUrl, STARTUP_TIMEOUT);
    if (!ready) {
      console.error("Vite output:", viteOutput);
      throw new Error("Vite dev server failed to start");
    }

    console.error("Server ready. Launching browser...");

    // Launch browser with GPU acceleration
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--headless=new",
        "--no-sandbox",
        "--enable-gpu",
        "--use-gl=angle",
        "--use-angle=metal",
        "--ignore-gpu-blocklist",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    // Navigate to the perf test page
    console.error(`Navigating to ${testPageUrl}...`);
    await page.goto(testPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for canvas to appear
    await page.waitForSelector("canvas", { timeout: 30000 });
    console.error("Canvas found. Running performance test...");

    // Wait for warmup + test duration
    console.error(`Warming up for ${WARMUP_DURATION / 1000}s...`);
    await sleep(WARMUP_DURATION);

    // Reset samples after warmup
    await page.evaluate(() => {
      window.__fpsData.samples = [];
      window.__fpsData.frameCount = 0;
      window.__fpsData.lastSampleTime = performance.now();
    });

    console.error(`Measuring for ${TEST_DURATION / 1000}s...`);
    await sleep(TEST_DURATION);

    // Collect results
    const result = await page.evaluate(() => {
      const samples = window.__fpsData?.samples || [];
      if (samples.length === 0) {
        return { error: "No performance samples collected" };
      }

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      return {
        averageFps: Math.round(avg * 100) / 100,
        minFps: Math.round(Math.min(...samples) * 100) / 100,
        maxFps: Math.round(Math.max(...samples) * 100) / 100,
        samples: samples,
        sampleCount: samples.length,
      };
    });

    await browser.close();
    console.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    // Kill Vite
    vite.kill("SIGTERM");
    await sleep(500);
    if (!vite.killed) {
      vite.kill("SIGKILL");
    }
  }
}

runPerfTest().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
