import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(new URL('../imperium-like-digital-prototype/package.json', import.meta.url));
const { chromium } = require('playwright');
const origin = process.env.POLITY_PROFILE_ORIGIN ?? 'http://127.0.0.1:8795';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Large fictional state profiling requires a local server.');
const artifactDir = resolve('tmp', 'large-board-profile');
await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const profile of [{ name: 'desktop', width: 1440, height: 900, cpu: 1 }, { name: 'mobile', width: 390, height: 844, cpu: 4 }]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height } });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
      await page.goto(origin);
      await page.getByRole('button', { name: 'Start Game', exact: true }).click();
      await page.locator('.board-layout').waitFor();
      await page.waitForFunction(() => localStorage.getItem('polity-engine.localGame.v1'));
      await page.evaluate(() => {
        const envelope = JSON.parse(localStorage.getItem('polity-engine.localGame.v1'));
        const G = envelope.state.G;
        const player = G.players['1'];
        const template = G.cardDb[player.hand[0]];
        for (const [zone, count] of [['playArea', 30], ['history', 80], ['deck', 100]]) {
          for (let i = 0; i < count; i++) {
            const id = `profile_${zone}_${i}`;
            G.cardDb[id] = { ...template, id, displayName: `Fictional ${zone} ${i}`, effects: [] };
            player[zone].push(id);
          }
        }
        localStorage.setItem('polity-engine.localGame.v1', JSON.stringify(envelope));
      });
      await page.reload();
      const start = Date.now();
      await page.getByRole('button', { name: 'Resume Saved Game', exact: true }).click();
      await page.locator('.board-layout').waitFor();
      const resumeMs = Date.now() - start;
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const started = Date.now();
        await page.locator('button.card-tile:not(:disabled)').nth(i).click();
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        samples.push(Date.now() - started);
      }
      await page.screenshot({ path: resolve(artifactDir, `${profile.name}.png`) });
      results.push({ profile: profile.name, cpu: profile.cpu, additionalFictionalCards: 210, resumeMs, interactionMs: samples });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
await writeFile(resolve(artifactDir, 'report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
