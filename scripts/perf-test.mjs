#!/usr/bin/env node

/**
 * Performance test runner for the ACTUAL Remotion jellyfish scene
 * Starts Remotion studio, navigates to the scene, and measures real FPS
 *
 * Usage: node scripts/perf-test.mjs
 * Output: JSON with averageFps, minFps, maxFps, samples
 */

import { chromium } from "playwright";
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";

const STUDIO_PORT = 3000;
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
  console.error("Starting Remotion studio...");

  // Start Remotion studio
  const studio = spawn("npm", ["run", "studio", "--", "--port", String(STUDIO_PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  let studioOutput = "";
  studio.stdout.on("data", (d) => (studioOutput += d.toString()));
  studio.stderr.on("data", (d) => (studioOutput += d.toString()));

  try {
    // Wait for studio to be ready
    const studioUrl = `http://localhost:${STUDIO_PORT}`;
    console.error(`Waiting for studio at ${studioUrl}...`);

    const ready = await waitForServer(studioUrl, STARTUP_TIMEOUT);
    if (!ready) {
      console.error("Studio output:", studioOutput);
      throw new Error("Remotion studio failed to start");
    }

    console.error("Studio ready. Launching browser...");

    // Launch browser with GPU
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--headless=new",
        "--no-sandbox",
        "--enable-gpu",
        "--use-gl=angle",
        "--use-angle=metal",
        "--ignore-gpu-blocklist",
        // Keep vsync enabled for realistic measurement
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    // No need for WebGL hooks - Scene component has built-in performance tracking

    // Navigate to the LiquidCrystal composition
    const compositionUrl = `${studioUrl}/LiquidCrystal`;
    console.error(`Navigating to ${compositionUrl}...`);
    await page.goto(compositionUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for the canvas to appear
    await page.waitForSelector("canvas", { timeout: 30000 });
    console.error("Canvas found. Starting playback...");

    // Wait for scene to fully load
    await sleep(3000);

    // Click on the canvas/preview area to focus it
    console.error("Focusing preview area...");
    const canvas = await page.$("canvas");
    if (canvas) {
      await canvas.click();
      await sleep(300);
    }

    // Enable looping first (L key)
    console.error("Enabling loop mode...");
    await page.keyboard.press("l");
    await sleep(300);

    // Press Space to start playback
    console.error("Starting playback...");
    await page.keyboard.press("Space");
    await sleep(1000);

    // Verify playback started by checking render count
    const initialCount = await page.evaluate(() => window.__perfData?.renderCount || 0);
    await sleep(500);
    const afterCount = await page.evaluate(() => window.__perfData?.renderCount || 0);
    console.error(`Render count: ${initialCount} -> ${afterCount} (delta: ${afterCount - initialCount})`);

    if (afterCount - initialCount < 5) {
      // Playback didn't start, try clicking play button in transport
      console.error("Playback not detected, trying transport controls...");
      // Click in lower portion where transport is
      await page.mouse.click(960, 950);
      await sleep(300);
      await page.keyboard.press("Space");
      await sleep(500);
    }

    // Wait for React perf data to accumulate
    console.error("Measuring FPS...");
    const totalWait = WARMUP_DURATION + TEST_DURATION;
    await sleep(totalWait);

    // Read the React performance data
    const result = await page.evaluate(() => {
      const allSamples = window.__perfData?.samples || [];
      if (allSamples.length === 0) {
        return { error: "No performance samples collected" };
      }
      // Skip first 3 samples (warmup/startup) for steady-state measurement
      const samples = allSamples.slice(3);
      if (samples.length === 0) {
        return { error: "Not enough samples for steady-state measurement", allSamples };
      }
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      return {
        averageFps: Math.round(avg * 100) / 100,
        minFps: Math.round(Math.min(...samples) * 100) / 100,
        maxFps: Math.round(Math.max(...samples) * 100) / 100,
        samples: samples.map(s => Math.round(s * 100) / 100),
        sampleCount: samples.length,
      };
    });

    await browser.close();
    console.log(JSON.stringify(result, null, 2));
    return result;

  } finally {
    // Kill the studio process
    studio.kill("SIGTERM");
    await sleep(1000);
    if (!studio.killed) {
      studio.kill("SIGKILL");
    }
  }
}

runPerfTest().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
