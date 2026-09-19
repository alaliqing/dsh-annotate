/**
 * Playwright is only needed to run these checks, and only from a checkout that
 * installed it (`pnpm install`, or point PLAYWRIGHT_MODULE at another project's
 * install). The plugins themselves depend on nothing.
 */
export async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "@playwright/test"].filter(Boolean);
  for (const spec of candidates) {
    try {
      const mod = await import(spec);
      if (mod.chromium) return mod;
      if (mod.default?.chromium) return mod.default;
    } catch (error) {
      void error;
    }
  }
  throw new Error(
    "Playwright not found. Run `pnpm install` in this repo, or set PLAYWRIGHT_MODULE to a project that has it installed."
  );
}
