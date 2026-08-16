# dsh-maplay

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 agent 直接驱动 [maplay](https://github.com/vcvcvnvcvcvn/maplay) 地图动画——用 dsh 的「一切皆插件」方式，把 maplay 变成一个 Cordis 插件。

`dsh-maplay` 是一个 Cordis 插件，挂在 dsh 旁边而不是改 dsh 内核。**默认完全自包含**：maplay 的工具执行器以 npm 包（`@vcvcvn/maplay`）的形式打包进插件进程，前端构建产物由插件直接 serve——用户只需要 `npm install dsh-maplay`，不需要 clone maplay、不需要 vite、不需要额外进程。

能力：

- **工具**：把 maplay 的 29 个动画工具（`get_board_info`、`moveTo`、`walkTo`、`emote`、`shoot`、`flyTo`、`jump`、`stateChange`……）注册进 dsh 的 `ctx.tools`，**进程内执行**（无 HTTP 往返）；
- **maplay chat 前端**：`dsh web` 打开后直接落在 maplay 的 `/chat` 页面（左边地图、右边聊天），聊天请求由插件的 `/api/chat` 桥接，模型走 dsh 的 `ctx.llm`——provider、model、凭据全部来自 dsh 自己的配置，前端零改动、无需填 API Key，AI 配置区自动隐藏；
- **playground 模式**：`/maplay/playground` 全屏场景，动画通过 SSE 从进程内 session 广播；
- **headless**：`dsh --profile headless` 直接在进程内驱动地图，无需任何服务；
- **提示词**：注册一段 system prompt 段落，教会模型「先 `get_board_info` 再动，只使用真实存在的 ID」。

一切注册都是 effect 作用域：插件卸载时工具、路由自动回收。

## 架构

```text
┌────────────────────────────── dsh（一个进程）──────────────────────┐
│  maplay /chat 页面（浏览器，由插件 serve 的构建产物）              │
│    │ 同源 POST /api/chat {text, toolCalls}                         │
│    ▼                                                              │
│  dsh-maplay chat bridge → ctx.llm（模型凭据用 dsh 的配置）          │
│    │                                                              │
│  ctx.tools（29 个 maplay 工具，进程内执行）                         │
│    │ 执行器 = @vcvcvn/maplay（打包进插件）                          │
│    │ 进程内 session（map + actionQueue）→ SSE → playground 页面     │
└──────────────────────────────────────────────────────────────────┘
```

## 快速开始

前置：Node.js 22+ 和 dsh（`npm i -g @deepseek-ai/dsh`）。**不需要 maplay checkout。**

### Web 模式（推荐，打开即 maplay chat）

```bash
dsh web --patch /path/to/dsh-maplay/cordis.yml
```

- 打开 `http://127.0.0.1:3080` → 直接进入 maplay 的 chat 页面（左边地图、右边聊天）：
  - **AI 配置区已隐藏**（dsh 模式下自动生效），右上角只显示 `⚙ dsh · deepseek-v4-pro` 只读徽标；
  - provider、model、凭据全部来自 dsh 的配置，无需填任何 API Key；
  - System Prompt 也由 dsh 侧提供（插件 `chatSystemPrompt` 配置，默认地图动画助手提示词）；
- 想全屏看动画：`http://127.0.0.1:3080/maplay/playground`（SSE 实时播放）；
- 在会话里输入比如：

  > 让 Leo 宣布比赛开始，Toby 慢走到胡萝卜，Harry 跳到树下睡一觉

### Headless 模式（一次性任务，进程内驱动地图）

```bash
dsh --profile headless --patch /path/to/dsh-maplay/cordis.headless.yml \
  "让乌龟慢走到胡萝卜，兔子跳到树旁"
```

### 换地图

配置 `mapFile` 指向自己的地图 JSON：

```yaml
mapFile: /绝对/路径/到/你的地图.json
```

缺省使用 `@vcvcvn/maplay` 包内自带的 demo.json（龟兔赛跑）。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAPPLAY_DIR` | `/Users/vcvcvn/workspace/maplay` | maplay checkout 路径（cordis.yml 内写死的默认值可按需改） |
| `MAPPLAY_MAP` | `<MAPPLAY_DIR>/demo.json` | 启动时加载进会话的地图 JSON |

> 注意：cordis.yml 里插件 `name` 必须是**绝对路径**（相对路径相对 `~/.dsh/profiles/<name>/` 解析，而不是 patch 文件）。`!!js` 表达式在 dsh 的 loader 里求值，可用 `process.env`。

## 配置项

cordis.yml 中 `config` 支持：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `embedded` | `true` | 自包含模式（进程内执行器 + serve 前端）；`false` 切换外部桥接 |
| `mapFile` | 包内 demo.json | 启动时加载的地图 JSON |
| `baseUrl` | `http://127.0.0.1:8992` | 外部模式：maplay 服务地址 |
| `spawn` | `true` | 外部模式：无人监听时自动拉起 maplay dev server |
| `maplayDir` | — | 外部模式：maplay checkout 绝对路径（spawn 时需要） |
| `host` / `port` | `127.0.0.1` / `8992` | 拉起 vite 时的绑定参数 |
| `startupTimeoutMs` | `60000` | 等待服务健康的超时 |
| `mapFile` | — | 启动时加载的地图 JSON |
| `prefix` | `''` | 工具名前缀（如 `maplay_`，避免重名） |
| `tools` | 全部 | 只注册这些工具（空数组 = 全部） |
| `fetchTimeoutMs` | `30000` | 单次工具调用超时 |
| `maxBoardChars` | `12000` | 工具结果里 board 文本上限 |
| `exposeWeb` | `true` | 注册 `/maplay` 嵌入视图（headless 下自动跳过） |
| `webPath` | `/maplay` | 嵌入视图路径前缀 |
| `chatBridge` | `true` | 用 dsh 的 `ctx.llm` 接管 `/api/chat`，并把 `/` 重定向到 chat 页面（maplay chat 成为 dsh 前端） |
| `chatSystemPrompt` | 内置默认 | chat 桥使用的 System Prompt（dsh 模式下面板隐藏、前端填的会被忽略） |

## 工具清单

注册进 dsh 的 29 个工具（名称与 maplay 一致，模型提示词、会话记录可与 MCP/HTTP 客户端互通）：

`get_board_info` `rollD20` `focus` `resetCamera` `moveTo` `walkTo` `emote` `breathe` `stateChange` `shoot` `flyTo` `knockback` `shove` `grab` `equip` `clearEquipment` `swingEquipment` `removeElement` `changeAppearance` `addEntity` `earthquake` `transition` `addDoor` `removeDoor` `openDoor` `closeDoor` `jump` `setNote` `explodeEntity`

## 发布 / 给别人用

`dsh-maplay` 依赖 npm 包 `@vcvcvn/maplay`（工具执行器 + 前端构建产物 + demo.json），所以**使用者不需要 clone maplay**——`npm install dsh-maplay` 就全有了。发布前两个包都要发：

### 1. 发布 maplay 运行时包

```bash
cd maplay
npm run build        # 前端 dist（--base=/maplay/）+ 执行器 lib/embed.js + d.ts
npm publish          # 发布 @vcvcvn/maplay
```

### 2. 发布插件

```bash
cd dsh-maplay
npm run build
npm publish          # 发布 dsh-maplay（发布前把 package.json 里的
                     # @vcvcvn/maplay 依赖从 file:../maplay 改成 ^0.2.0）
```

发布后在 GitHub 仓库加上 `dsh-plugin` topic，便于 dsh 社区发现。

### 3. 使用者安装（两步）

前置：Node 22+、pnpm（`dsh plugin` 命令依赖 pnpm）、dsh 本体。

```bash
dsh plugin add dsh-maplay      # 自动带上 @vcvcvn/maplay
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml`（或每次 `--patch`）挂载：

```yaml
- insert:
    - id: maplay
      name: dsh-maplay          # 已安装时用包名，不需要绝对路径
      config:
        embedded: true
```

`dsh web` 后打开 `http://127.0.0.1:3080` 即进入 maplay chat 页面，动画、工具、headless 全部可用。

### 版本兼容说明

- dsh 目前是 developer preview（rc 版本，破坏性变更频繁）。插件与 dsh rc 系列一起演进；**升级 dsh 后如果插件报错，先 `npm i -g @deepseek-ai/dsh` 再重装 `dsh-maplay` 最新版**。
- 插件自带 `@deepseek-ai/dsh-tools` 等运行时依赖副本（与 dsh 内部版本并存，`defineTool` 产物是纯数据对象，跨副本已验证兼容）。

## 外部 maplay 兼容模式（可选）

默认 `embedded: true` 完全自包含。如果希望继续用独立运行的 maplay（dev server 或你自己的部署），设置 `embedded: false`，并配置 `baseUrl` / `spawn` / `maplayDir`：

```yaml
config:
  embedded: false
  baseUrl: http://127.0.0.1:8992
  spawn: false            # true 时插件会自动拉起 maplay dev server
  # maplayDir: /路径/到/maplay
```

此时工具走 HTTP 桥接到外部 maplay，`/maplay` 为反向代理。

## 与 maplay MCP 方案的对比

maplay 自带 MCP server（stdio 代理到 HTTP API），dsh 的 `@deepseek-ai/dsh-mcp-client` 也能接。两种方式并存：

| | dsh-maplay 插件 | MCP 桥接 |
| --- | --- | --- |
| 工具 schema | dsh 原生 `defineTool`，进 `ctx.tools` 注册表 | MCP 发现，工具名带 `mcp__<server>__` 前缀 |
| 生命周期 | 插件自动 spawn / 回收 maplay | 需要外部启动 maplay + MCP 进程 |
| 嵌入视图 | `/maplay` 代理进 dsh Web UI | 无 |
| 配置 | 一个 cordis.yml | 一个 cordis.yml（`dsh-mcp-client`） |
| 结果格式 | 结构化 board + summary | MCP content 文本 |

## 开发

```bash
npm install
npm run build      # tsc → lib/
node tests/smoke.mjs   # 独立冒烟测试（需要 maplay 已在 8992 运行）
```

插件以 npm 发布包方式分发；本地验证时用 cordis.yml 的绝对路径引用 `lib/index.js`。

## 已知限制

- `/maplay` 嵌入视图依赖插件自带 vite 启动（`--base` 与代理匹配）。外部手动启动的 maplay 没有 base，嵌入视图资源路径会错位——请直接打开 `http://127.0.0.1:8992/playground` 观看。
- Vite HMR websocket 不做代理，页面热更新不可用（不影响播放）。
- 插件与 dsh 各自携带一份 `@deepseek-ai/dsh-tools` 等依赖；`defineTool` 产物是纯数据对象，跨副本兼容，但升级 dsh 时建议同步升级插件依赖。

## License

MIT
