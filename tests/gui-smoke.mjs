/**
 * Bounded end-to-end check for: zero-setup start, live style preview, and the
 * screenshot attachment. Every wait is short so a failure reports instead of
 * hanging.
 */
import { loadPlaywright } from "./playwright.mjs";

const { chromium } = await loadPlaywright();
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "shots"), { recursive: true });
const SHORT = { timeout: 4000 };

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1600, height: 940 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console]", m.text().slice(0, 200));
});
await page.goto(process.argv[2], { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(2000);

await page.getByRole("button", { name: "New Session" }).first().click(SHORT).catch((e) => console.log("new-session:", e.message.slice(0, 80)));
await page.waitForTimeout(1200);
await page.locator("text=/New Session/").last().click({ ...SHORT, force: true }).catch(() => {});
await page.waitForTimeout(1200);

await page.keyboard.press("Meta+Shift+KeyB");
let column = 0;
for (let i = 0; i < 12 && !column; i++) {
  await page.waitForTimeout(500);
  column = await page.locator(".dsa-col").count();
}
console.log("annotate column:", column);
if (!column) {
  console.log("body head:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160));
  await browser.close();
  process.exit(1);
}

// 1. zero setup: the host starts the dev server, the tab points itself at it.
let statusText = "";
for (let i = 0; i < 60; i++) {
  statusText = (await page.locator(".dsa-status").first().innerText(SHORT).catch(() => "")) || "";
  if (statusText.includes("运行中") || statusText.includes("出错")) break;
  await page.waitForTimeout(1000);
}
console.log("dev server status:", JSON.stringify(statusText));
console.log("url input:", await page.locator(".dsa-url").first().inputValue().catch(() => "(none)"));

const frame = page.frameLocator("iframe.dsa-frame");
let ready = 0;
for (let i = 0; i < 20 && !ready; i++) {
  await page.waitForTimeout(700);
  ready = await frame.locator("textarea").count();
}
console.log("preview element found:", ready);

// 2. style tweak with live preview
if (ready) {
  await page.locator('.dsa-ico[title^="标记模式"]').click(SHORT).catch(() => {});
  await page.waitForTimeout(400);
  await frame.locator("textarea").first().click({ position: { x: 40, y: 20 }, force: true, timeout: 5000 }).catch((e) => console.log("pick:", e.message.slice(0, 60)));
  await page.waitForTimeout(500);
  const cardOpen = await frame.locator(".dsa-card").count();
  console.log("card open:", cardOpen);
  if (cardOpen) {
    await frame.locator('.dsa-card [data-act="styles"]').click(SHORT);
    await page.waitForTimeout(300);
    const input = frame.locator('.dsa-styles .dsa-srow', { hasText: "font-size" }).locator("input");
    await input.fill("26px", SHORT);
    await page.waitForTimeout(400);
    console.log("live inline font-size:", await frame.locator("textarea").first().evaluate((el) => el.style.fontSize).catch(() => "(none)"));
    await page.screenshot({ path: path.join(here, "shots", "16-style-edit.png") });
    await frame.locator(".dsa-card textarea").first().click({ force: true, timeout: SHORT.timeout }).catch(() => {});
    await page.keyboard.type("字号调大后行高也需同步；确认样式改动随批注投递", { delay: 2 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    console.log("items:", await page.locator(".dsa-item").count());
  }

  // 3. screenshot attachment
  const cam = page.locator('.dsa-item .dsa-mini[title^="截取"]').first();
  if (await cam.count()) {
    await cam.click(SHORT);
    for (let i = 0; i < 40; i++) {
      if (await page.locator(".dsa-thumb").count()) break;
      await page.waitForTimeout(1000);
    }
    console.log("thumbnail:", await page.locator(".dsa-thumb").count());
    console.log(
      "composer images:",
      await page.evaluate(() => document.querySelectorAll('img[src^="blob:"], img[src^="data:image"]').length)
    );
    console.log("notice:", await page.locator(".dsa-notice").first().innerText(SHORT).catch(() => "(none)"));
  }

  await page.locator(".dsa-send").click(SHORT).catch(() => {});
  await page.waitForTimeout(700);
  const draft = (await page.locator("[contenteditable=true]").first().innerText().catch(() => "(none)")).slice(0, 760);
  console.log("--- draft ---\n" + draft);
  await page.screenshot({ path: path.join(here, "shots", "17-shot-and-payload.png") });
}
await browser.close();
