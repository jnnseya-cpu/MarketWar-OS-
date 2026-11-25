// DRIVE THE FRENCH INTERFACE IN A REAL BROWSER, WITH A REAL FRENCH DEVICE.
//
// npm run drive:french
//
// WHY A BROWSER AND NOT ONLY THE UNIT TESTS. The unit tests prove the
// dictionary is complete, the ranking leads with French and the lookup cannot
// render a key. None of that proves a French laptop SEES French, because every
// step between the two lives somewhere a test file cannot reach: Playwright's
// `locale` sets the real `navigator.languages` and the real `Accept-Language`,
// the provider reads them on mount, the context resolves one locale, and the
// sidebar renders through it. §186 was a chain of three working parts with the
// links broken, and the only instrument that would have caught it is this one.
//
// FOUR THINGS IT PROVES, AND THE LAST TWO ARE THE ONES THAT MATTER.
//
//   1. A French device gets a French shell with nobody touching a setting.
//   2. An English device still gets English — the device decides, so a
//      directive about French must not have quietly become a default for all.
//   3. THE SEARCH STILL WORKS IN ENGLISH ON A FRENCH SCREEN. `NAV` is the
//      command bar's index as well as the sidebar's list. Translating it in
//      place would have made a French screen searchable only in French, and
//      an English-speaking operator on a French laptop could no longer find a
//      screen by typing its English name. That is a regression no unit test
//      would have reported, because the data would still have been consistent
//      with itself.
//   4. `<html lang>` IS STILL NOT FRENCH. §186 removed it deliberately: a
//      document declaring French over English text silences the browser's
//      translate offer and makes a screen reader pronounce English with French
//      rules. The French shell is marked per element. If somebody ever
//      "fixes" this by setting the document language, this driver fails.
//
// It boots its own dev server, like `drive:brief`, so it needs nothing running.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { stopServer } = await import("./driver-preflight.mjs");
const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.DRIVE_PORT || 3127);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BRAND = "brand_fr_drive";

let proven = 0, broken = 0;
const say = (s) => process.stdout.write(`${s}\n`);
const ok = (name, cond, extra = "") => {
  if (cond) { proven++; say(`  ok     ${name}`); }
  else { broken++; say(`  BROKEN ${name}${extra ? ` — ${String(extra).slice(0, 300)}` : ""}`); }
};

try {
  const probe = await fetch(`${ORIGIN}/api/capabilities`);
  if (probe) {
    say(`Something is already serving ${ORIGIN} (HTTP ${probe.status}). Stop it first — \`fuser -k ${PORT}/tcp\` — or this would drive THAT process, not this code.`);
    process.exit(1);
  }
} catch { /* nothing listening, which is what we need */ }

const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  detached: true,
  cwd: root, env: { ...process.env, NODE_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d.toString(); });
server.stderr.on("data", (d) => { serverLog += d.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`${ORIGIN}/api/capabilities`); if (r.ok) { up = true; break; } }
  catch { /* still booting */ }
  await sleep(500);
}
if (!up) {
  say(`The server did not come up on ${PORT}.\n${serverLog.slice(-800)}`);
  stopServer(server, "SIGKILL");
  process.exit(1);
}

say("\nFRENCH, THE PREMIER TRANSLATION — driven in a real browser\n");

try {
  // Playwright lives outside this project's node_modules in this environment.
  let chromium = null;
  try { chromium = createRequire("/opt/node-tools/")("playwright").chromium; }
  catch { try { chromium = createRequire(import.meta.url)("playwright").chromium; } catch { /* none */ } }

  if (!chromium) {
    // LOUDER THAN A PASS. A skip that looks like a tick is how a gate becomes
    // decorative, which this repository has already paid for once.
    say("  SKIPPED — no Playwright here, so the SCREEN was NOT exercised. Nothing below ran.");
    broken++;
  } else {
    const browser = await chromium.launch({ args: ["--no-sandbox"] });

    // The container has no DNS and the dev runtime needs eval; neither is a
    // defect in this code, and each exclusion is matched specifically so
    // anything else still fails.
    const ENVIRONMENTAL = [/unsafe-eval/, /ERR_TUNNEL_CONNECTION_FAILED/, /googletagmanager|connect\.facebook\.net/];

    /** A page on a device whose language settings are `locale`. */
    async function openDashboard(locale) {
      const context = await browser.newContext({
        locale,
        // Playwright derives `Accept-Language` from `locale`; this makes the
        // ordered list explicit, because `navigator.languages` is what the
        // provider reads first and a single-entry list is the case that hid a
        // defect in §186.
        extraHTTPHeaders: { "Accept-Language": `${locale},${locale.split("-")[0]};q=0.9` },
        viewport: { width: 1280, height: 1400 },
      });
      const page = await context.newPage();
      const errors = [];
      const note = (t) => { if (!ENVIRONMENTAL.some((r) => r.test(t))) errors.push(t); };
      page.on("pageerror", (e) => note(String(e)));
      page.on("console", (m) => { if (m.type() === "error") note(m.text()); });

      await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.evaluate((id) => {
        localStorage.setItem("mw.brands.v2", JSON.stringify([{
          id, name: "Drive Co", industry: "Construction software", product: "CDE",
          audience: "UK main contractors", location: "London", offer: "Free audit",
          website: "https://example.co.uk", goal: "Leads", color: "#10b981",
        }]));
        localStorage.setItem("mw.activeBrand.v2", id);
        // No stored language: the DEVICE must decide, which is the whole point.
        localStorage.removeItem("mw.locale.v1");
      }, BRAND);
      await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "networkidle", timeout: 120_000 });
      // The provider resolves the locale in an effect, so the shell is English
      // for one paint. Waiting is not politeness: asserting before it settles
      // would read a correct platform as an untranslated one.
      await page.waitForTimeout(3000);
      return { context, page, errors };
    }

    // ------------------------------------------------- a French device, French
    {
      const { context, page, errors } = await openDashboard("fr-FR");
      const nav = page.locator("aside nav").first();
      const navText = (await nav.innerText()).replace(/\s+/g, " ");

      ok("the device language reached the client at all",
        (await page.evaluate(() => navigator.language)).startsWith("fr"),
        await page.evaluate(() => navigator.language));

      for (const french of [
        "Commandement",            // a group name
        "Centre de commandement",  // the screen a customer lands on
        "Domaines d'envoi",        // the screen §187 was about
        "Chasseur de contacts",
        "Facturation et ACU",      // the unit survives, the words do not
      ]) {
        ok(`the sidebar is in French: "${french}"`, navText.includes(french), navText.slice(0, 220));
      }

      for (const english of ["Command Center", "Sending Domains", "Contact Hunter"]) {
        ok(`and the English is gone from it: "${english}"`, !navText.includes(english), navText.slice(0, 220));
      }

      // A product name is not a word. §187's judgement, applied to prose.
      ok("product names survive in the French nav (OMNIRANK, SiteRaid AI)",
        navText.includes("OMNIRANK") && navText.includes("SiteRaid AI"), navText.slice(0, 220));

      // THE §186 INVARIANT, STILL HELD.
      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      ok("the DOCUMENT still does not claim French — the page body is English",
        htmlLang !== "fr" && !String(htmlLang).startsWith("fr"), `html lang="${htmlLang}"`);
      ok("the translated nav marks ITS OWN language instead",
        (await page.locator('aside nav[lang="fr"]').count()) === 1,
        `nav[lang=fr] count ${await page.locator("aside nav[lang]").count()}`);

      // THE CONTROL. Not everything is French, and the driver says so rather
      // than letting a reader assume a full translation shipped. The page body
      // is still English — which is exactly why the document must keep
      // declaring English.
      //
      // AND THE INSTRUMENT HAD TO BE REPLACED TO SAY IT. The first version
      // subtracted the nav's text from the body's with `replace()` — one of
      // them whitespace-normalised and the other not, so nothing was ever
      // removed and the "control" measured the nav it was supposed to exclude.
      // The same instrument error as §187's three assertions against its own
      // comments, and in the same direction. It reads the main region now.
      const mainText = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
      ok("the page BODY is still English, which is the honest state of this work",
        /[A-Za-z]{4,}/.test(mainText) && !/Centre de commandement|Domaines d'envoi/.test(mainText),
        mainText.slice(0, 200));

      // ---------------------------------------------- the search, both languages
      const bar = page.locator('button:has-text("MarketWar")').first();
      ok("the command bar prompt is French",
        (await page.locator("text=Que voulez-vous que MarketWar fasse").count()) > 0);

      if (await bar.count()) {
        await bar.click();
        await page.waitForTimeout(400);
        const input = page.locator('input[placeholder*="MarketWar"]').first();

        // ENGLISH TYPED ON A FRENCH SCREEN. The regression guard.
        await input.fill("sending");
        await page.waitForTimeout(400);
        const englishSearch = (await page.locator('[class*="max-h"]').first().innerText()).replace(/\s+/g, " ");
        ok("typing ENGLISH on a French screen still finds the screen",
          /Domaines d'envoi/.test(englishSearch), englishSearch.slice(0, 200));
        ok("and the result is LABELLED in French",
          !/Sending Domains/.test(englishSearch), englishSearch.slice(0, 200));

        // And French typed on a French screen, which is the easy half.
        await input.fill("domaines");
        await page.waitForTimeout(400);
        const frenchSearch = (await page.locator('[class*="max-h"]').first().innerText()).replace(/\s+/g, " ");
        ok("typing FRENCH finds it too", /Domaines d'envoi/.test(frenchSearch), frenchSearch.slice(0, 200));

        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      } else {
        ok("the command bar is on the dashboard", false, "no button matched");
      }

      // --------------------------------------- an explicit choice still wins
      const select = page.locator("aside select").first();
      if (await select.count()) {
        const codes = await select.locator("option").evaluateAll((os) => os.map((o) => o.value));
        ok("French is the first option in the picker", codes[0] === "fr", codes.join(","));
        await select.selectOption("en");
        await page.waitForTimeout(600);
        const afterEnglish = (await page.locator("aside nav").first().innerText()).replace(/\s+/g, " ");
        ok("choosing English puts the shell back into English",
          afterEnglish.includes("Sending Domains") && !afterEnglish.includes("Domaines d'envoi"),
          afterEnglish.slice(0, 200));
        ok("and the nav stops claiming to be French",
          (await page.locator('aside nav[lang="fr"]').count()) === 0);
      } else {
        ok("the language picker is in the sidebar", false, "no select matched");
      }

      ok("the French screen raised no error of its own", errors.length === 0, errors.join(" | "));
      await context.close();
    }

    // ------------------------------- the landing page, where the charts live
    {
      // THE DEFECT THIS DRIVER FOUND, AND THE GUARD THAT KEEPS IT FIXED.
      //
      // The first French browser ever pointed at this platform threw a React
      // hydration failure on the landing page's chart: the server rendered
      // `7.3` and the French client rendered `7,3`, so React discarded the
      // server's entire tree and rebuilt it. `toLocaleString()` with no locale
      // reads the RUNTIME's locale, which differs across the boundary — the
      // same fault as §186, in numbers instead of words.
      //
      // It is matched specifically. A hydration failure is not in the
      // environmental list and never will be: this container's missing DNS
      // cannot produce one.
      const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1280, height: 1400 } });
      const page = await context.newPage();
      const hydration = [];
      page.on("console", (m) => { if (/[Hh]ydrat/.test(m.text())) hydration.push(m.text()); });
      page.on("pageerror", (e) => { if (/[Hh]ydrat/.test(String(e))) hydration.push(String(e)); });
      await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(3500);
      ok("a French browser hydrates the charted landing page without a mismatch",
        hydration.length === 0, hydration.join(" | ").slice(0, 400));
      // Not vacuous: there are charts on that page, with numbers in them.
      const svgs = await page.locator("svg[role='img']").count();
      ok("and there really are charts on it to have broken", svgs >= 1, `svg count ${svgs}`);
      await context.close();
    }

    // ------------------------------------------- an English device, English
    {
      const { context, page, errors } = await openDashboard("en-GB");
      const navText = (await page.locator("aside nav").first().innerText()).replace(/\s+/g, " ");
      ok("an English device still gets English — French is premier, not compulsory",
        navText.includes("Sending Domains") && !navText.includes("Domaines d'envoi"),
        navText.slice(0, 200));
      // SCOPED TO THE SHELL, and the scope is the point rather than a
      // weakening. The language picker's own options carry `lang` on every
      // screen on purpose (§187): "Français" is a French word wherever it is
      // read, and a screen reader needs to know which voice to use for it.
      // What must not claim French on an English screen is the NAV.
      ok("and the English shell does not claim to be French",
        (await page.locator("aside nav[lang]").count()) === 0);
      ok("while the picker still names each language in its own",
        (await page.locator('aside option[lang="fr"]').count()) === 1);
      ok("the English screen raised no error of its own", errors.length === 0, errors.join(" | "));
      await context.close();
    }

    // -------------------------------- a Belgian device: region is discarded
    {
      const { context, page } = await openDashboard("fr-BE");
      const navText = (await page.locator("aside nav").first().innerText()).replace(/\s+/g, " ");
      ok("a fr-BE device is served French, not English for want of its own dictionary",
        navText.includes("Domaines d'envoi"), navText.slice(0, 200));
      await context.close();
    }

    await browser.close();
  }
} finally {
  // A process group, not the child: `npx next dev` is TWO processes and
  // signalling the child leaves the real server listening.
  stopServer(server, "SIGKILL");
}

say(`\n${proven} proven, ${broken} broken\n`);
process.exit(broken === 0 ? 0 : 1);
