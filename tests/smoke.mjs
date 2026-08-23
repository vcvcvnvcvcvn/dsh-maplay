// Standalone smoke test for dsh-maplay outside the dsh runtime.
// Embedded mode with per-session scenes: two "agents" (session ids) drive
// the same map independently — moves in one scene must not leak to the other.
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import * as plugin from '../lib/index.js'
import { EmbeddedExecutor } from '../lib/executor.js'

const demo = JSON.parse(readFileSync(new URL('../node_modules/@vcvcvn/maplay/demo.json', import.meta.url), 'utf8'))
const executor = new EmbeddedExecutor(demo, undefined)

// Session A moves the tortoise to the carrots.
const a1 = await executor.call('walkTo', { target: 'entity-tortoise', toTarget: 'object-carrot' }, undefined, 'session-A')
console.log('A walkTo:', a1.ok, '|', a1.summary)
// Session B moves the hare to the tree.
const b1 = await executor.call('walkTo', { target: 'entity-hare', toTarget: 'object-tree' }, undefined, 'session-B')
console.log('B walkTo:', b1.ok, '|', b1.summary)

// Verify isolation: A still sees tortoise near carrots + hare untouched;
// B sees hare near tree + tortoise untouched.
const aBoard = await executor.call('get_board_info', {}, undefined, 'session-A')
const bBoard = await executor.call('get_board_info', {}, undefined, 'session-B')
const posA = Object.fromEntries(aBoard.board.entities.map((e) => [e.id, e.position.grid.join(',')]))
const posB = Object.fromEntries(bBoard.board.entities.map((e) => [e.id, e.position.grid.join(',')]))
console.log('A 视角:', JSON.stringify(posA))
console.log('B 视角:', JSON.stringify(posB))
const isolated = posA['entity-tortoise'] === '12,9' && posA['entity-hare'] === '3,9'
  && posB['entity-hare'] === '20,9' && posB['entity-tortoise'] === '3,5'
console.log('会话隔离:', isolated ? '✓ 完全隔离' : '✗ 状态泄漏了')

// Default (web channel) scene stays pristine.
const defBoard = await executor.call('get_board_info', {}, undefined)
console.log('default 场景实体:', defBoard.board.entities.length, '个（未被会话污染）')

// Full plugin apply still works with the per-session executor.
const registered = []
const sections = []
const ctx = new Context()
ctx.reflect.provide('tools', { register(def) { registered.push(def); return () => {} } })
ctx.reflect.provide('systemPrompt', { section(s) { sections.push(s); return () => {} } })
ctx.reflect.provide('agentDefaultModel', { currentSelection() { return { provider: 'test', model: 'test-model' } } })
new WebServer(ctx, { host: '127.0.0.1', port: 0 })
const disposer = await plugin.apply(ctx, { embedded: true, exposeWeb: true, chatBridge: false })
console.log('插件 apply: tools=', registered.length, '| sections=', sections.length)
console.log('disposer type:', typeof disposer)
console.log(isolated ? 'PASS' : 'FAIL')
process.exit(isolated ? 0 : 1)
