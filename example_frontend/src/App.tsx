import { useState, useRef, useEffect } from 'react';
import { Play, FileJson, Settings, Terminal, Cpu, Pause, SkipForward, Square } from 'lucide-react';
import './App.css';

interface RenderItem {
  filename: string;
  prompt: string;
  meta: Record<string, string>;
}

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

function App() {
  const [template, setTemplate] = useState<string>('{{set character = "1girl, silver hair"}}\n\n{{axis outfit}}\n  uniform : "school uniform"\n  dress   : "elegant dress"\n{{/axis}}\n\n{{combine outfit}}\n\n{{template}}{{character}}, {{outfit}}{{/template}}\n{{filename}}char_{{outfit.key}}{{/filename}}');
  const [workflowStr, setWorkflowStr] = useState<string>('{\n  "6": {\n    "class_type": "CLIPTextEncode",\n    "inputs": {\n      "text": "{{input}}, masterpiece"\n    }\n  }\n}');
  const [placeholder, setPlaceholder] = useState<string>('{{input}}');
  const [comfyUrl, setComfyUrl] = useState<string>('http://127.0.0.1:8188');
  const [dslServer, setDslServer] = useState<string>('http://localhost:8000');
  
  const [renderedItems, setRenderedItems] = useState<RenderItem[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const logIdCounter = useRef(0);
  const execControl = useRef({
    paused: false,
    cancelAll: false,
    skipCurrent: false,
  });
  
  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    logIdCounter.current += 1;
    const id = logIdCounter.current;
    setLogs(prev => [...prev, { id, message, type }]);
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleRender = async () => {
    setIsRendering(true);
    addLog(`Rendering template via ${dslServer}/render...`, 'info');
    try {
      const res = await fetch(`${dslServer}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || res.statusText);
      }
      const data = await res.json();
      setRenderedItems(data.items || []);
      addLog(`Successfully rendered ${data.count || (data.items?.length)} items.`, 'success');
    } catch (err: any) {
      addLog(`Render failed: ${err.message}`, 'error');
    } finally {
      setIsRendering(false);
    }
  };

  const waitForComfyUI = async (promptId: string) => {
    while (true) {
      if (execControl.current.cancelAll) return 'cancelled';
      if (execControl.current.skipCurrent) return 'skipped';
      
      try {
        const historyRes = await fetch(`${comfyUrl}/history/${promptId}`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData[promptId]) {
             return 'done';
          }
        }
      } catch (err) {
        // Silently wait if ComfyUI isn't responding immediately
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  const togglePause = () => {
    const newPaused = !execControl.current.paused;
    execControl.current.paused = newPaused;
    setIsPaused(newPaused);
    addLog(newPaused ? 'Batch execution paused.' : 'Batch execution resumed.', 'warning');
  };

  const skipCurrent = async () => {
    addLog('Skipping current item...', 'warning');
    execControl.current.skipCurrent = true;
    try {
      await fetch(`${comfyUrl}/interrupt`, { method: 'POST' });
    } catch (e) {
      addLog('Failed to interrupt ComfyUI.', 'error');
    }
  };

  const cancelAll = async () => {
    addLog('Cancelling entire batch execution...', 'error');
    execControl.current.cancelAll = true;
    try {
      await fetch(`${comfyUrl}/interrupt`, { method: 'POST' });
    } catch (e) {
      addLog('Failed to interrupt ComfyUI.', 'error');
    }
  };

  const handleExecuteBatch = async () => {
    if (renderedItems.length === 0) {
      addLog('No items to execute. Please render template first.', 'error');
      return;
    }
    
    let workflowJson;
    try {
      workflowJson = JSON.parse(workflowStr);
    } catch (err) {
      addLog('Invalid Workflow JSON. Please check syntax.', 'error');
      return;
    }

    setIsExecuting(true);
    setIsPaused(false);
    execControl.current = { paused: false, cancelAll: false, skipCurrent: false };

    addLog(`Starting batch execution for ${renderedItems.length} items...`, 'info');

    for (let i = 0; i < renderedItems.length; i++) {
      if (execControl.current.cancelAll) break;
      
      // Handle Pause
      while (execControl.current.paused && !execControl.current.cancelAll) {
         await new Promise(r => setTimeout(r, 500));
      }
      
      if (execControl.current.cancelAll) break;

      const item = renderedItems[i];
      addLog(`Processing [${i+1}/${renderedItems.length}]: ${item.filename}`, 'info');
      execControl.current.skipCurrent = false;
      
      try {
        // 1. Inject prompt into workflow
        const injectRes = await fetch(`${dslServer}/workflow/inject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflow: workflowJson,
            prompt: item.prompt,
            placeholder: placeholder
          }),
        });
        
        if (!injectRes.ok) {
           throw new Error(`Injection failed: ${injectRes.statusText}`);
        }
        const { workflow: injectedWorkflow } = await injectRes.json();
        
        // 2. Submit to ComfyUI
        const comfyRes = await fetch(`${comfyUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: injectedWorkflow
          }),
        });
        
        if (!comfyRes.ok) {
           const text = await comfyRes.text();
           throw new Error(`ComfyUI submission failed: ${text}`);
        }
        
        const comfyData = await comfyRes.json();
        addLog(`Submitted ${item.filename} (Prompt ID: ${comfyData.prompt_id})`, 'success');
        
        // 3. Wait for the generation to complete (or be skipped/cancelled)
        const status = await waitForComfyUI(comfyData.prompt_id);
        if (status === 'cancelled') {
           addLog(`Batch execution stopped at ${item.filename}.`, 'error');
           break;
        } else if (status === 'skipped') {
           addLog(`Skipped ${item.filename}. Moving to next...`, 'warning');
           continue;
        } else {
           addLog(`Finished generating ${item.filename}.`, 'success');
        }
        
      } catch (err: any) {
         addLog(`Error on ${item.filename}: ${err.message}`, 'error');
      }
    }
    
    if (execControl.current.cancelAll) {
       addLog('Batch execution was fully cancelled.', 'info');
    } else {
       addLog('Batch execution completed successfully.', 'info');
    }
    
    setIsExecuting(false);
    setIsPaused(false);
    execControl.current = { paused: false, cancelAll: false, skipCurrent: false };
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1><Cpu size={28} color="var(--primary)" /> Prompt DSL & ComfyUI Batcher</h1>
      </header>
      
      <main className="main-content">
        {/* Left Panel: Inputs */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Settings size={20} /> Settings & Templates</div>
          </div>
          <div className="panel-body">
            
            <div className="flex-row">
               <div className="input-group">
                 <label>DSL Server URL</label>
                 <input type="text" value={dslServer} onChange={e => setDslServer(e.target.value)} />
               </div>
               <div className="input-group">
                 <label>ComfyUI URL</label>
                 <input type="text" value={comfyUrl} onChange={e => setComfyUrl(e.target.value)} />
               </div>
            </div>

            <div className="input-group" style={{ flex: 1 }}>
              <label>Prompt DSL Template</label>
              <textarea 
                value={template} 
                onChange={e => setTemplate(e.target.value)} 
                style={{ flex: 1 }}
                spellCheck={false}
              />
            </div>
            
            <div className="input-group">
              <label>ComfyUI Workflow JSON</label>
              <textarea 
                value={workflowStr} 
                onChange={e => setWorkflowStr(e.target.value)}
                style={{ height: '150px' }}
                spellCheck={false}
              />
            </div>
            
            <div className="input-group">
               <label>Placeholder String</label>
               <input type="text" value={placeholder} onChange={e => setPlaceholder(e.target.value)} />
            </div>

          </div>
        </div>

        {/* Right Panel: Render & Logs */}
        <div className="panel" style={{ flex: 1.2 }}>
          <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div className="panel-title"><FileJson size={20} /> Previews & Logs</div>
               <div style={{ display: 'flex', gap: '0.75rem' }}>
                 <button className="btn btn-primary" onClick={handleRender} disabled={isRendering || isExecuting}>
                    <Play size={18} /> Render DSL
                 </button>
                 {!isExecuting ? (
                   <button className="btn btn-success" onClick={handleExecuteBatch} disabled={renderedItems.length === 0}>
                      <Play size={18} /> Start Batch
                   </button>
                 ) : (
                   <div style={{ display: 'flex', gap: '0.5rem' }}>
                     <button className="btn btn-warning" onClick={togglePause}>
                        {isPaused ? <Play size={18} /> : <Pause size={18} />} {isPaused ? 'Resume' : 'Pause'}
                     </button>
                     <button className="btn btn-secondary" onClick={skipCurrent} title="Interrupt current generation and proceed to next">
                        <SkipForward size={18} /> Skip
                     </button>
                     <button className="btn btn-danger" onClick={cancelAll} title="Interrupt and stop entire batch">
                        <Square size={18} /> Cancel All
                     </button>
                   </div>
                 )}
               </div>
            </div>
          </div>
          
          <div className="panel-body">
             {renderedItems.length > 0 && (
               <div className="list-container" style={{ flex: 1, overflowY: 'auto' }}>
                 {renderedItems.map((item, idx) => (
                   <div key={idx} className="list-item">
                     <div className="item-filename">{item.filename}</div>
                     <div className="item-prompt">{item.prompt}</div>
                   </div>
                 ))}
               </div>
             )}
             
             {renderedItems.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  No items rendered yet.
                </div>
             )}
             
             <div className="logs-container">
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                 <Terminal size={16} /> Execution Logs
               </div>
               {logs.map(log => (
                 <div key={log.id} className={`log-entry log-${log.type}`}>
                   [{new Date().toLocaleTimeString()}] {log.message}
                 </div>
               ))}
               <div ref={logsEndRef} />
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
