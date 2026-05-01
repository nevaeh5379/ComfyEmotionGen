import * as vscode from "vscode";
import * as path from "path";

const BACKEND_URL = "http://localhost:8000";

interface RenderItem {
  filename: string;
  prompt: string;
  meta: Record<string, string>;
}

interface RenderResponse {
  count: number;
  items: RenderItem[];
}

export function activate(context: vscode.ExtensionContext) {
  console.log("CEG extension activated");

  const previewCmd = vscode.commands.registerCommand("ceg.preview", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor.");
      return;
    }

    const doc = editor.document;
    if (doc.languageId !== "ceg") {
      vscode.window.showWarningMessage("Not a CEG file.");
      return;
    }

    const template = doc.getText();

    // Show loading
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "CEG Preview",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Calling parser..." });

        try {
          const res = await fetch(`${BACKEND_URL}/render`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template }),
          });

          if (!res.ok) {
            const errText = await res.text();
            vscode.window.showErrorMessage(
              `Parser error (${res.status}): ${errText}`
            );
            return;
          }

          const data = (await res.json()) as RenderResponse;
          showPreviewPanel(context, data, doc.fileName);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Failed to connect to backend at ${BACKEND_URL}. Is the server running?\n\n${msg}`
          );
        }
      }
    );
  });

  context.subscriptions.push(previewCmd);
}

function showPreviewPanel(
  context: vscode.ExtensionContext,
  data: RenderResponse,
  sourcePath: string
) {
  const panel = vscode.window.createWebviewPanel(
    "cegPreview",
    `CEG Preview — ${path.basename(sourcePath)}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = buildPreviewHtml(data, sourcePath);
}

function buildPreviewHtml(data: RenderResponse, sourcePath: string): string {
  const rows = data.items
    .map(
      (item, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="filename">${escapeHtml(item.filename)}</td>
      <td class="prompt">${escapeHtml(item.prompt)}</td>
      <td class="meta">${escapeHtml(JSON.stringify(item.meta))}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CEG Preview</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
    }
    .header {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .header h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .header .meta {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .header .meta code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      vertical-align: top;
    }
    tr:hover td {
      background: var(--vscode-list-hoverBackground);
    }
    .num {
      width: 40px;
      color: var(--vscode-descriptionForeground);
      text-align: right;
    }
    .filename {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      white-space: nowrap;
    }
    .prompt {
      word-break: break-word;
    }
    .meta {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>CEG Parser Preview</h2>
    <p class="meta">
      <code>${escapeHtml(path.basename(sourcePath))}</code>
      &middot; ${data.count} item${data.count !== 1 ? "s" : ""}
    </p>
  </div>
  ${
    data.items.length === 0
      ? '<p class="empty">No items generated. Check your template.</p>'
      : `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>Filename</th>
        <th>Prompt</th>
        <th>Meta</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>`
  }
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function deactivate() {}
