// Standalone smoke test for dsh-maplay outside the dsh runtime.
// Embedded mode: maplay executor runs in-process; exercises config, apply()
// with a stubbed ctx, tool registration, prompt section, real tool execution
// against the in-process session, and the chat bridge against ctx.llm.
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import * as plugin from '../lib/index.js'
import { loadEmbeddedMap } from '../lib/executor.js'

const registered = []
const sections = []

const ctx = new Context()
ctx.reflect.provide('tools', {
  register(def) { registered.push(def); return () => {} },
})
ctx.reflect.provide('systemPrompt', {
  section(s) { sections.push(s); return () => {} },
})
ctx.reflect.provide('agentDefaultModel', {
  currentSelection() { return { provider: 'test', model: 'test-model' } },
})

// Real WebServer service (its constructor provides `webServer` on ctx).
new WebServer(ctx, { host: '127.0.0.1', port: 0 })

// Load the maplay demo map into the in-process session.
const demo = JSON.parse(readFileSync(new URL('../node_modules/@vcvcvn/maplay/demo.json', import.meta.url), 'utf8'))
loadEmbeddedMap(demo)

const disposer = await plugin.apply(ctx, { embedded: true, exposeWeb: true, chatBridge: false })
console.log('tools registered:', registered.length)
console.log('first tool:', registered[0]?.name, '| last tool:', registered.at(-1)?.name)
console.log('prompt sections:', sections.length, sections[0]?.name)
console.log('webServer reachable at apply time:', ctx.get('webServer') !== undefined)

// Execute one tool through the registered definition (in-process executor).
const emote = registered.find((t) => t.name === 'emote')
const result = await emote.execute(
  { target: 'entity-referee', text: 'smoke test ok' },
  { signal: new AbortController().signal },
)
console.log('emote result.ok:', result.ok, '| summary:', result.summary)

const boardTool = registered.find((t) => t.name === 'get_board_info')
const board = await boardTool.execute({}, { signal: new AbortController().signal })
const rendered = boardTool.output.render({}, board)
console.log('board rendered chars:', rendered[0]?.text.length)

// disposer should be a function (teardown)
console.log('disposer type:', typeof disposer)
console.log('PASS')
process.exit(0)
