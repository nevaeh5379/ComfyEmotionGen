import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  test.setTimeout(120000); // 2분 타임아웃 설정
  page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
  await page.goto('http://localhost:5173/');
  await page.getByRole('tab', { name: '워크플로우 에디터' }).click();
  

  await page.waitForSelector('#graph-canvas', { timeout: 20000 });
  await page.waitForFunction(() => {
    return !document.body.innerText.includes("Extensions / Live graph loading...");
  }, { timeout: 640000 });


  const workflowPath = '/home/jihoon/Downloads/fortest.json';
  await page.locator('#comfy-file-input').first().setInputFiles(workflowPath);
  

  await page.waitForFunction(() => {
    const muterNode = window.app?.graph?.nodes?.find(
      (n: any) => n.type === "Fast Groups Muter (rgthree)"
    );
    if (!muterNode) return false;
    const nodeEl = document.querySelector(`[data-node-id="${String(muterNode.id)}"]`);
    const canvas = nodeEl?.querySelector('canvas');
    const width = canvas?.getBoundingClientRect().width || 0;
    return width > 0;
  }, { timeout: 30000 });


  await page.waitForTimeout(8000);


  await page.evaluate(() => {
    const targetNode = window.app.graph.nodes.find(
      (n: any) => n.type === "Fast Groups Muter (rgthree)"
    );
    if (targetNode) {
      targetNode.mode = 0; // ALWAYS로 강제 활성화
      

      if (typeof window.app.syncGraphNode === "function") {
        window.app.syncGraphNode(targetNode.id);
      }
      

      if (window.__useReactGraphStore) {
        const zoom = 1.0;

        const panX = 1024 / 2 - targetNode.pos[0] * zoom;
        const panY = 768 / 2 - targetNode.pos[1] * zoom;
        window.__useReactGraphStore.getState().setZoom(zoom);
        window.__useReactGraphStore.getState().setPan([panX, panY]);
      }
      
      if (window.app.canvas) {
        window.app.canvas.centerOnNode(targetNode);
        window.app.canvas.setDirty(true, true);
      }
    }
  });

  await page.waitForTimeout(5000);



  const beforeState = await page.evaluate(() => {
    const muterNode = window.app.graph.nodes.find(
      (n: any) => n.type === "Fast Groups Muter (rgthree)"
    );
    const widget = muterNode?.widgets?.find((w: any) => w.type === "custom" || w.name?.startsWith("Enable"));
    if (!widget) return null;


    const methods: string[] = [];
    let obj = widget;
    while (obj) {
      Object.getOwnPropertyNames(obj).forEach(prop => {
        try {
          if (typeof (widget as any)[prop] === "function" && !methods.includes(prop)) {
            methods.push(prop);
          }
        } catch(e) {}
      });
      obj = Object.getPrototypeOf(obj);
    }
    console.log("[CEG-DEBUG-METHODS] Methods:", methods);

    const group = widget.group;
    if (!group) return null;


    if (!group._children || group._children.size === 0) {
      group._children = group._children || new Set();
      const gx = group.pos[0];
      const gy = group.pos[1];
      const gw = group.size[0];
      const gh = group.size[1];
      
      window.app.graph.nodes.forEach((node: any) => {
        const x = node.pos[0];
        const y = node.pos[1];
        if (x >= gx && x <= gx + gw && y >= gy && y <= gy + gh) {
          group._children.add(node);
        }
      });
    }

    const nodes = Array.from(group._children).filter((c: any) => c.mode !== undefined);
    

    const domStates = nodes.map((n: any) => {
      const el = document.querySelector(`[data-node-id="${String(n.id)}"]`);
      return {
        id: n.id,
        className: el ? el.className : "",
        hasOpacity50: el ? el.className.includes("opacity-50") : false
      };
    });

    return {
      toggled: widget.toggled,
      childrenSize: group._children.size,
      nodeModes: nodes.map((n: any) => ({ id: n.id, mode: n.mode, type: n.type })),
      domStates
    };
  });
  console.log(`[TEST] Before click state: ${JSON.stringify(beforeState)}`);


  const clickCoords = await page.evaluate(async () => {
    const muterNode = window.app.graph.nodes.find(
      (n: any) => n.type === "Fast Groups Muter (rgthree)"
    );
    const widget = muterNode?.widgets?.find((w: any) => w.type === "custom" || w.name?.startsWith("Enable"));
    if (!widget) return { success: false, reason: "Widget not found" };

    const nodeEl = document.querySelector(`[data-node-id="${String(muterNode.id)}"]`);
    const canvas = nodeEl?.querySelector('canvas');
    if (!canvas) return { success: false, reason: "Canvas not found" };

    const rect = canvas.getBoundingClientRect();
    const zoom = window.__useReactGraphStore?.getState().zoom || 1.0;
    

    const localX = rect.width * 0.3; 
    const localY = rect.height * 0.5;

    return {
      success: true,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      },
      zoom,
      x: rect.left + localX,
      y: rect.top + localY
    };
  });

  console.log(`[TEST] Target coordinates calculated: ${JSON.stringify(clickCoords)}`);
  if (!clickCoords.success) {
    throw new Error(`Coordinate calculation failed: ${clickCoords.reason}`);
  }


  console.log(`[TEST] Clicking via Playwright mouse at screen x: ${clickCoords.x}, y: ${clickCoords.y}`);
  await page.mouse.click(clickCoords.x, clickCoords.y);


  await page.waitForTimeout(2000);


  const afterState = await page.evaluate(() => {
    const muterNode = window.app.graph.nodes.find(
      (n: any) => n.type === "Fast Groups Muter (rgthree)"
    );
    const widget = muterNode?.widgets?.find((w: any) => w.type === "custom" || w.name?.startsWith("Enable"));
    if (!widget || !widget.group) return null;

    const nodes = Array.from(widget.group._children || []).filter((c: any) => c.mode !== undefined);
    

    const domStates = nodes.map((n: any) => {
      const el = document.querySelector(`[data-node-id="${String(n.id)}"]`);
      return {
        id: n.id,
        className: el ? el.className : "",
        hasOpacity50: el ? el.className.includes("opacity-50") : false
      };
    });

    return {
      toggled: widget.toggled,
      nodeModes: nodes.map((n: any) => ({ id: n.id, mode: n.mode, type: n.type })),
      domStates
    };
  });
  console.log(`[TEST] After click state: ${JSON.stringify(afterState)}`);


  const beforeMode = beforeState?.nodeModes[0]?.mode;
  const afterMode = afterState?.nodeModes[0]?.mode;
  console.log(`[TEST] Verifying node mode changes: beforeMode=${String(beforeMode)} -> afterMode=${String(afterMode)}`);
  

  expect(afterMode).toBe(beforeMode === 0 ? 2 : 0);


  const expectedOpacity = (afterMode === 2); // NEVER(2) 이면 반투명 Mute 처리됨
  
  for (const node of afterState.domStates) {
    console.log(`[TEST] Node ID ${node.id} - HTML className: "${node.className}" (expectedOpacity=${String(expectedOpacity)})`);
    expect(node.hasOpacity50).toBe(expectedOpacity);
  }
});