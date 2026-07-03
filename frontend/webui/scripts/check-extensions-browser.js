import puppeteer from 'puppeteer';

async function main() {
  console.log("Launching headless browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  const errors = [];
  const consoleMessages = [];

  page.on('console', msg => {
    const text = msg.text();
    const loc = msg.location();
    const locStr = loc && loc.url ? ` at ${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : '';
    console.log(`[Browser Console] ${msg.type()}: ${text}${locStr}`);
    if (msg.type() === 'error' || text.includes('failed') || text.includes('TypeError') || text.includes('Error')) {
      errors.push(text);
    }
  });

  page.on('pageerror', err => {
    console.error(`[Browser PageError] ${err.stack || err.toString()}`);
    errors.push(err.stack || err.toString());
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      console.error(`[Browser NetworkError] ${response.status()} ${response.url()}`);
      errors.push(`Failed to load ${response.url()} (Status ${response.status()})`);
    }
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

    console.log("Checking if there are groups in the editor...");
    const groupsCount = await page.evaluate(() => {
      if (!window.app || !window.app.graph || !window.app.graph.groups) {
        return 0;
      }
      return window.app.graph.groups.length;
    });

    if (groupsCount === 0) {
      throw new Error("No groups found in the editor after loading the workflow JSON.");
    }

    // Wait 1.5s to give the async fast_groups_service enough time to run and generate widgets
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log("Checking if Fast Groups Muter (rgthree) node contains widgets...");
    const muterNodeCheck = await page.evaluate(() => {
      if (!window.app || !window.app.graph || !window.app.graph.nodes) {
        return { error: "Graph or nodes not loaded properly" };
      }
      const muterNodes = window.app.graph.nodes.filter(n => n.type === "Fast Groups Muter (rgthree)");
      if (muterNodes.length === 0) {
        return { error: "Fast Groups Muter (rgthree) node not found in the graph" };
      }
      const emptyMuterNode = muterNodes.find(n => !n.widgets || n.widgets.length === 0);
      if (emptyMuterNode) {
        return { error: "Fast Groups Muter (rgthree) node has no widgets" };
      }
      return {};
    });

    if (muterNodeCheck.error) {
      throw new Error(muterNodeCheck.error);
    }

    console.log("Checking if 'fast groups muter' is present in the browser Node Library...");
    
    // Wait for the search input in the sidebar to be visible
    await page.waitForSelector('input[placeholder="Search nodes..."]', { timeout: 10000 });
    
    // Focus and type 'fast groups muter' into the search input
    await page.focus('input[placeholder="Search nodes..."]');
    await page.type('input[placeholder="Search nodes..."]', 'fast groups muter');
    
    // Wait 1 second for React to filter and render the list
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify if any button in the sidebar node list contains the text/title "fast groups muter"
    const hasFastGroupsMuterInUI = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('div.flex-1.overflow-y-auto button'));
      return buttons.some(btn => {
        const text = btn.textContent || "";
        const title = btn.getAttribute("title") || "";
        return text.toLowerCase().includes("fast groups muter") || title.toLowerCase().includes("fast groups muter");
      });
    });

    if (!hasFastGroupsMuterInUI) {
      throw new Error("Fast Groups Muter node not found in the browser's Node Library sidebar");
    }

    // Clear the search input using React-friendly setter
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="Search nodes..."]');
      if (input) {
        const lastValue = input.value;
        input.value = '';
        const event = new Event('input', { bubbles: true });
        const tracker = input._valueTracker;
        if (tracker) {
          tracker.setValue(lastValue);
        }
        input.dispatchEvent(event);
      }
    });
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

  const failedExtensions = errors.filter(err => err.includes("Extension setup failed") || err.includes("Extension beforeConfigureGraph failed") || err.includes("TypeError:") || err.includes("SyntaxError:"));
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
