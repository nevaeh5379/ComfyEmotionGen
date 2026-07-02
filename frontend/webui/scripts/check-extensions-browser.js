import puppeteer from 'puppeteer';

async function main() {
  console.log("Launching headless browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const errors = [];
  const consoleMessages = [];

  page.on('console', msg => {
    const text = msg.text();
    console.log(`[Browser Console] ${msg.type()}: ${text}`);
    if (msg.type() === 'error' || text.includes('failed') || text.includes('TypeError') || text.includes('Error')) {
      errors.push(text);
    }
  });

  page.on('pageerror', err => {
    console.error(`[Browser PageError] ${err.stack || err.toString()}`);
    errors.push(err.stack || err.toString());
  });

  try {
    console.log("Navigating to http://127.0.0.1:6974 for origin initialization...");
    await page.goto('http://127.0.0.1:6974', { waitUntil: 'load', timeout: 30000 });

    // Set active tab to 'editor' via localStorage and reload
    await page.evaluate(() => {
      localStorage.setItem("ceg_activeTab", "editor");
    });

    console.log("Reloading page to boot directly into editor tab...");
    await page.reload({ waitUntil: 'load', timeout: 30000 });

    console.log("Waiting for custom nodes and graph canvas to be fully loaded...");
    await page.waitForSelector('#graph-canvas', { timeout: 20000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Extensions / Live graph loading..."), { timeout: 60000 });

    console.log("Replicating user action: Selecting and importing test workflow file...");
    const fileInput = await page.$('#comfy-file-input');
    const workflowPath = '/home/jihoon/ComfyEmotionGen/frontend/webui/public/test_workflow.json';
    await fileInput.uploadFile(workflowPath);

    console.log("Waiting 5 seconds for graph load and extension hooks to trigger...");
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (err) {
    console.error("Test runner crashed:", err);
    // Take a screenshot to help debug what was rendered
    try {
      await page.screenshot({ path: '/tmp/test_crashed_screenshot.png' });
      console.log("Crashed screenshot saved to /tmp/test_crashed_screenshot.png");
    } catch (scre) {
      console.error("Failed to take screenshot:", scre);
    }
    process.exit(1);
  } finally {
    await browser.close();
  }

  const failedExtensions = errors.filter(err => err.includes("Extension setup failed") || err.includes("Extension beforeConfigureGraph failed"));
  if (failedExtensions.length > 0) {
    console.error(`Test FAILED. Detected extension failures:\n${failedExtensions.join('\n')}`);
    process.exit(1);
  } else {
    console.log("Test PASSED. Replicated user's manual load workflow action without any extension errors.");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Test runner crashed in outer handler:", err);
  process.exit(1);
});
