# AGENT INSTRUCTIONS: Codex App-Server + Electron (TypeScript)

## GOAL
Integrate `codex app-server` into an Electron + TypeScript project using generated types.
Complete all steps in order. Do not skip steps.

---

Important Note : Make Sure you are not creating changes with current ui and folder strucutre , if you want to build folder strucutre for the next task , start doing it inside the src folder where the whole app code . 


On the Current Chat page you need to integrate this codex app server , such user can use it through the chat box provided , you can add models or any other related things required by the codex app server on the chat page no restrictions , try to build considering current ui ux principles


## CONTEXT
- App shell: Electron with electron-vite + TypeScript
- Transport: stdio (one child process per agent)
- Schema: generated from local Codex binary via `generate-ts`
- All child process logic lives in **main process only** — never in renderer

---

## STEP 1 — Scaffold the Electron project { Already Done }

```bash
npm create electron-vite@latest my-editor -- --template vanilla-ts
cd my-editor
npm install
```

---

{ Start From Here }

## STEP 2 — Generate the Codex TypeScript schema

Run from project root:

```bash
codex app-server generate-ts --out ./src/codex-schema
codex app-server generate-json-schema --out ./src/codex-schema
```

Expected output in `src/codex-schema/`:
```
src/codex-schema/
  index.ts
  rpc.ts
  items.ts
  thread.ts
  notifications.ts
  schema.json
```

If the command fails: check `codex --version` is installed globally (`npm install -g @openai/codex`).

---

## STEP 3 — Add path alias

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "paths": {
      "@codex/*": ["./src/codex-schema/*"]
    }
  }
}
```

### `electron.vite.config.ts`
```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    resolve: {
      alias: { '@codex': resolve('src/codex-schema') }
    }
  },
  preload: {
    resolve: {
      alias: { '@codex': resolve('src/codex-schema') }
    }
  },
  renderer: {}
})
```

---

## STEP 4 — Create the file structure

```bash
mkdir -p src/main/codex
touch src/main/codex/CodexProcess.ts
touch src/main/codex/CodexRpc.ts
touch src/main/codex/CodexAgent.ts
touch src/main/codex/AgentManager.ts
```

Final structure:
```
src/
  codex-schema/         ← generated, commit this
  main/
    codex/
      CodexProcess.ts   ← spawns binary, owns stdio pipe
      CodexRpc.ts       ← JSON-RPC engine (pending map, routing)
      CodexAgent.ts     ← one agent session (thread + turns)
      AgentManager.ts   ← multi-agent orchestration
    index.ts
  preload/
    index.ts            ← contextBridge IPC surface
  renderer/
    ...
```

---

## STEP 5 — Write `CodexProcess.ts`

```ts
// src/main/codex/CodexProcess.ts
import { ChildProcess, spawn } from 'child_process'
import { createInterface } from 'readline'
import { EventEmitter } from 'events'

export class CodexProcess extends EventEmitter {
  private proc: ChildProcess

  constructor(codexBin = 'codex') {
    super()
    this.proc = spawn(codexBin, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: this.proc.stdout! })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        this.emit('message', JSON.parse(trimmed))
      } catch {
        console.error('[CodexProcess] bad JSON:', trimmed)
      }
    })

    this.proc.stderr!.on('data', (d) =>
      console.error('[CodexProcess stderr]', d.toString())
    )

    this.proc.on('exit', (code) => {
      this.emit('exit', code)
    })
  }

  send(msg: unknown) {
    this.proc.stdin!.write(JSON.stringify(msg) + '\n')
  }

  kill() {
    this.proc.kill()
  }
}
```

---

## STEP 6 — Write `CodexRpc.ts`

```ts
// src/main/codex/CodexRpc.ts
import { CodexProcess } from './CodexProcess'

import type {
  InitializeRequest,
  InitializeResponse,
  InitializedNotification,
  ClientRequest,
  ServerMessage,
  ServerNotification,
} from '@codex/rpc'

type Pending = {
  resolve: (v: ServerMessage) => void
  reject: (e: Error) => void
}

export class CodexRpc {
  private process: CodexProcess
  private pending = new Map<number, Pending>()
  private msgId = 1

  onNotification?: (msg: ServerNotification) => void
  onServerRequest?: (msg: ServerMessage) => void

  constructor(codexBin = 'codex') {
    this.process = new CodexProcess(codexBin)
    this.process.on('message', (msg: ServerMessage) => this.route(msg))
  }

  async request<TReq extends ClientRequest, TRes extends ServerMessage>(
    method: TReq['method'],
    params?: TReq extends { params: infer P } ? P : never
  ): Promise<TRes> {
    const id = this.msgId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as any, reject })
      this.process.send({ id, method, params })
    })
  }

  notify(method: string, params?: unknown) {
    this.process.send({ method, params })
  }

  async initialize(clientName: string, version: string) {
    const res = await this.request<InitializeRequest, InitializeResponse>(
      'initialize',
      { clientInfo: { name: clientName, version } }
    )
    this.notify('initialized')
    return res
  }

  private route(msg: ServerMessage) {
    if ('id' in msg && msg.id !== undefined) {
      const pending = this.pending.get(msg.id as number)
      if (pending) {
        this.pending.delete(msg.id as number)
        pending.resolve(msg)
      } else {
        // Server-initiated request (e.g. approval prompt)
        this.onServerRequest?.(msg)
      }
    } else {
      this.onNotification?.(msg as ServerNotification)
    }
  }

  kill() {
    this.process.kill()
  }
}
```

---

## STEP 7 — Write `CodexAgent.ts`

```ts
// src/main/codex/CodexAgent.ts
import { EventEmitter } from 'events'
import { CodexRpc } from './CodexRpc'

import type {
  ThreadCreateRequest,
  ThreadCreateResponse,
  TurnStartRequest,
  TurnStartResponse,
  ServerNotification,
} from '@codex/rpc'

export type ApprovalDecision = 'allow' | 'allowSession' | 'deny'

export class CodexAgent extends EventEmitter {
  readonly id: string
  private rpc: CodexRpc
  private threadId?: string

  onApproval?: (msg: ServerNotification) => Promise<ApprovalDecision>

  constructor(id: string, codexBin = 'codex') {
    super()
    this.id = id
    this.rpc = new CodexRpc(codexBin)

    this.rpc.onNotification = (msg) => {
      // Forward all streaming events to listeners
      this.emit('event', msg)

      // Handle specific events
      switch (msg.method) {
        case 'item/agentMessage/delta':
          this.emit('delta', (msg as any).params?.delta?.text ?? '')
          break
        case 'turn/completed':
          this.emit('done', (msg as any).params?.tokenUsage)
          break
      }
    }

    this.rpc.onServerRequest = async (msg) => {
      const decision = this.onApproval
        ? await this.onApproval(msg as any)
        : 'deny'
      this.rpc.notify('serverRequest/respond', {
        requestId: (msg as any).id,
        decision,
      })
    }
  }

  async start(cwd: string) {
    await this.rpc.initialize('my-editor', '0.1.0')

    const res = await this.rpc.request<ThreadCreateRequest, ThreadCreateResponse>(
      'thread/create',
      { cwd }
    )
    this.threadId = (res as any).result.threadId
    return this.threadId
  }

  async send(text: string) {
    if (!this.threadId) throw new Error('Agent not started — call start(cwd) first')

    await this.rpc.request<TurnStartRequest, TurnStartResponse>(
      'turn/start',
      {
        threadId: this.threadId,
        input: [{ type: 'text', text }],
      }
    )
  }

  destroy() {
    this.rpc.kill()
  }
}
```

---

## STEP 8 — Write `AgentManager.ts`

```ts
// src/main/codex/AgentManager.ts
import { execSync } from 'child_process'
import path from 'path'
import { CodexAgent, ApprovalDecision } from './CodexAgent'
import type { ServerNotification } from '@codex/rpc'

export type AgentEventCallback = (agentId: string, event: ServerNotification) => void
export type ApprovalCallback = (agentId: string, msg: ServerNotification) => Promise<ApprovalDecision>

export class AgentManager {
  private agents = new Map<string, CodexAgent>()
  private repoRoot: string

  onEvent?: AgentEventCallback
  onApproval?: ApprovalCallback

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot
  }

  async spawn(agentId: string, codexBin = 'codex'): Promise<string> {
    if (this.agents.has(agentId)) throw new Error(`Agent ${agentId} already exists`)

    // Isolate each agent in its own git worktree
    const worktreePath = path.join(this.repoRoot, '.worktrees', agentId)
    const branchName = `agent/${agentId}`

    try {
      execSync(
        `git worktree add -b ${branchName} ${worktreePath}`,
        { cwd: this.repoRoot, stdio: 'pipe' }
      )
    } catch {
      // Worktree may already exist — use it as-is
    }

    const agent = new CodexAgent(agentId, codexBin)

    agent.on('event', (event) => this.onEvent?.(agentId, event))

    agent.onApproval = (msg) =>
      this.onApproval
        ? this.onApproval(agentId, msg)
        : Promise.resolve('deny')

    await agent.start(worktreePath)
    this.agents.set(agentId, agent)
    return worktreePath
  }

  async send(agentId: string, text: string) {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`No agent with id: ${agentId}`)
    await agent.send(text)
  }

  kill(agentId: string) {
    const agent = this.agents.get(agentId)
    if (!agent) return
    agent.destroy()
    this.agents.delete(agentId)

    // Clean up worktree
    try {
      const worktreePath = path.join(this.repoRoot, '.worktrees', agentId)
      execSync(`git worktree remove --force ${worktreePath}`, {
        cwd: this.repoRoot, stdio: 'pipe'
      })
    } catch { /* ignore */ }
  }

  killAll() {
    for (const id of this.agents.keys()) this.kill(id)
  }

  list(): string[] {
    return [...this.agents.keys()]
  }
}
```

---

## STEP 9 — Wire IPC in `main/index.ts`

```ts
// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { AgentManager } from './codex/AgentManager'

let win: BrowserWindow
const manager = new AgentManager(process.cwd())

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  // Forward all agent events to renderer
  manager.onEvent = (agentId, event) => {
    win.webContents.send('agent:event', agentId, event)
  }

  // Show approval prompt in renderer, wait for decision
  manager.onApproval = (agentId, msg) => {
    return new Promise((resolve) => {
      win.webContents.send('agent:approval', agentId, msg)
      ipcMain.once(`agent:approval:response:${agentId}`, (_, decision) => {
        resolve(decision)
      })
    })
  }
})

// IPC handlers
ipcMain.handle('agent:spawn', async (_, agentId: string) => {
  return manager.spawn(agentId)
})

ipcMain.handle('agent:send', async (_, agentId: string, text: string) => {
  return manager.send(agentId, text)
})

ipcMain.handle('agent:kill', async (_, agentId: string) => {
  manager.kill(agentId)
})

ipcMain.handle('agent:list', async () => {
  return manager.list()
})
```

---

## STEP 10 — Wire `preload/index.ts`

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('codex', {
  // Agent control
  spawn:   (agentId: string)               => ipcRenderer.invoke('agent:spawn', agentId),
  send:    (agentId: string, text: string) => ipcRenderer.invoke('agent:send', agentId, text),
  kill:    (agentId: string)               => ipcRenderer.invoke('agent:kill', agentId),
  list:    ()                              => ipcRenderer.invoke('agent:list'),

  // Streaming events — subscribe per agentId
  onEvent: (cb: (agentId: string, event: unknown) => void) =>
    ipcRenderer.on('agent:event', (_, agentId, event) => cb(agentId, event)),

  // Approval — renderer responds to prompts
  onApproval: (cb: (agentId: string, msg: unknown) => void) =>
    ipcRenderer.on('agent:approval', (_, agentId, msg) => cb(agentId, msg)),

  respondApproval: (agentId: string, decision: 'allow' | 'allowSession' | 'deny') =>
    ipcRenderer.send(`agent:approval:response:${agentId}`, decision),
})
```

---

## STEP 11 — Update `package.json` scripts

```json
{
  "scripts": {
    "dev":          "electron-vite dev",
    "build":        "electron-vite build",
    "codex:types":  "codex app-server generate-ts --out ./src/codex-schema",
    "postinstall":  "npm run codex:types"
  }
}
```

---

## STEP 12 — Verify everything compiles

```bash
npx tsc --noEmit
npm run dev
```

No TypeScript errors = integration is complete.

---

## RULES FOR THE AGENT

- Do NOT import anything from `@codex/*` in renderer code — main process only
- Do NOT use WebSocket mode for the App Server — stdio only
- Do NOT expose the `ChildProcess` object through contextBridge — use IPC handlers
- Always call `agent.start(cwd)` before `agent.send(text)`
- Always call `manager.killAll()` on `app.before-quit`
- Regenerate `src/codex-schema/` after every Codex version bump
- Commit `src/codex-schema/` — other devs and CI should not need Codex installed to compile

---

## KNOWN ISSUES

| Symptom | Fix |
|---|---|
| `Cannot find module '@codex/rpc'` | Add `paths` alias to both `tsconfig.json` and `electron.vite.config.ts` |
| `codex: command not found` | `npm install -g @openai/codex` and check PATH |
| Agent stalls silently | You are not responding to `serverRequest/respond` — implement approval handler |
| Types out of date after update | Re-run `npm run codex:types` and commit |
| `generate-ts` writes empty files | Codex version too old — update the CLI |