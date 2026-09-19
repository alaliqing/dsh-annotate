/**
 * Standalone check of the injected overlay: inject it into the real app at
 * /app/, drive hover -> pick -> comment, and capture the states for design
 * review. Also verifies the postMessage contract and localStorage restore.
 */
import { loadPlaywright } from "./playwright.mjs";

const { chromium } = await loadPlaywright();
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "shots");
mkdirSync(outDir, { recursive: true });
const overlaySrc = readFileSync(path.join(here, "..", "packages", "dsh-annotate", "src", "overlay.js"), "utf8");
const url = process.argv[2] ?? "http://127.0.0.1:5180/app/";

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console]", m.text());
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  window.__msgs = [];
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (d && d.source === "dsh-annotate-overlay") window.__msgs.push(d.type + (d.annotations ? ":" + d.annotations.length : ""));
  });
});
await page.evaluate(overlaySrc);
await page.waitForTimeout(300);
console.log("mounted:", await page.evaluate(() => !!document.querySelector(".dsa-layer")));
console.log("msgs after mount:", await page.evaluate(() => window.__msgs.join(",")));

// Enter picking mode the way the panel does, then hover a real target.
await page.evaluate(() =>
  window.postMessage({ source: "dsh-annotate-panel", type: "set-mode", mode: "picking" }, "*")
);
await page.waitForTimeout(120);
const target = await page.evaluate(() => {
  const el =
    document.querySelector("textarea, input[type=text]") ||
    document.querySelector("button") ||
    document.querySelector("main *");
  const r = el.getBoundingClientRect();
  window.__target = el;
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName.toLowerCase() };
});
console.log("target:", JSON.stringify(target));
await page.mouse.move(target.x, target.y);
await page.waitForTimeout(220);
console.log(
  "hover frame:",
  await page.evaluate(() => {
    const f = document.querySelector(".dsa-frame");
    const ro = document.querySelector(".dsa-readout");
    return JSON.stringify({ frame: f && f.style.display, w: f && f.style.width, readout: ro && ro.textContent });
  })
);
await page.screenshot({ path: path.join(outDir, "1-hover.png"), clip: { x: 0, y: 0, width: 1280, height: 820 } });

await page.mouse.click(target.x, target.y);
await page.waitForTimeout(260);
console.log("card:", await page.evaluate(() => !!document.querySelector(".dsa-card")));
await page.screenshot({ path: path.join(outDir, "2-card.png"), clip: { x: 0, y: 0, width: 1280, height: 820 } });

const comment = "按钮右侧内边距少了 8px，长标题时文字贴边";
await page.keyboard.type(comment, { delay: 4 });
await page.keyboard.press("Enter");
await page.waitForTimeout(320);
console.log("pin count:", await page.locator(".dsa-pin").count());
console.log("msgs:", await page.evaluate(() => window.__msgs.join(",")));
console.log(
  "annotation:",
  await page.evaluate(() =>
    JSON.stringify(
      (JSON.parse(localStorage.getItem("dsh-annotate:v1:" + location.pathname) || "[]")[0] || {}).selector
    )
  )
);
await page.screenshot({ path: path.join(outDir, "3-pin.png"), clip: { x: 0, y: 0, width: 1280, height: 820 } });

// Persistence: a reload must bring the pins back.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.evaluate(overlaySrc);
await page.waitForTimeout(300);
console.log("pins after reload:", await page.locator(".dsa-pin").count());

// Second annotation + list rendering check.
await page.evaluate(() =>
  window.postMessage({ source: "dsh-annotate-panel", type: "set-mode", mode: "picking" }, "*")
);
const second = await page.evaluate(() => {
  const el = document.querySelector("button");
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
await page.mouse.click(second.x, second.y);
await page.waitForTimeout(220);
await page.keyboard.type("主按钮语义上应该是 primary，现在是 ghost 样式", { delay: 3 });
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.evaluate(() =>
  window.postMessage({ source: "dsh-annotate-panel", type: "focus", id: "" }, "*")
);
await page.screenshot({ path: path.join(outDir, "4-two-pins.png"), clip: { x: 0, y: 0, width: 1280, height: 820 } });
console.log("final pin count:", await page.locator(".dsa-pin").count());
await browser.close();
