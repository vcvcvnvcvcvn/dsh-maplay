#!/bin/sh
# dsh-maplay 一键安装脚本（在要使用 maplay 的机器上运行一次）。
#
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/vcvcvnvcvcvn/dsh-maplay/main/install.sh | sh
#   （或 clone 仓库后：sh install.sh）
#
# 完成四件事：
#   1. 安装 dsh（全局）
#   2. 安装 dsh-maplay 插件（dsh plugin add，自动带上 @vcvcvn/maplay）
#   3. 放置 maplay agent preset（~/.dsh/.agent-presets/maplay）
#   4. 挂载插件到 web profile（~/.dsh/profiles/web/cordis.patch.yml）
# 之后直接 `dsh web` 即可使用。
#
# 注意：需要 Node.js 22+ 与 npm；脚本会按需安装 pnpm（dsh plugin 依赖）。

set -eu

log() { printf '\033[32m[dsh-maplay]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[dsh-maplay]\033[0m %s\n' "$*"; }

# ── 0. 定位仓库（clone 模式优先，否则 curl 模式）────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$REPO_DIR/preset/agent.cordis.yml" ] || [ ! -f "$REPO_DIR/install.sh" ]; then
  warn "当前不是仓库目录（curl 管道模式），克隆仓库到临时目录…"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  git clone --depth 1 https://github.com/vcvcvnvcvcvn/dsh-maplay.git "$TMP/dsh-maplay"
  REPO_DIR="$TMP/dsh-maplay"
fi

# ── 1. dsh ───────────────────────────────────────────────────────────────────
if ! command -v dsh >/dev/null 2>&1; then
  log "安装 dsh…"
  npm install -g @deepseek-ai/dsh
else
  log "dsh 已安装：$(dsh --version 2>/dev/null || echo '?')"
fi

# ── 2. pnpm（dsh plugin 依赖）──────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  log "安装 pnpm…"
  npm install -g pnpm
fi

# ── 3. 插件 ─────────────────────────────────────────────────────────────────
log "安装 dsh-maplay 插件（GitHub）到 web profile…"
dsh plugin --profile web add github:vcvcvnvcvcvn/dsh-maplay

# ── 4. preset ───────────────────────────────────────────────────────────────
log "放置 maplay agent preset…"
mkdir -p "$HOME/.dsh/.agent-presets"
cp -r "$REPO_DIR/preset" "$HOME/.dsh/.agent-presets/maplay"
log "preset 已放置：$HOME/.dsh/.agent-presets/maplay"

# ── 5. 挂载到 web profile ───────────────────────────────────────────────────
PATCH_FILE="$HOME/.dsh/profiles/web/cordis.patch.yml"
if [ -f "$PATCH_FILE" ] && grep -q "id: maplay" "$PATCH_FILE" 2>/dev/null; then
  log "cordis.patch.yml 已包含 maplay 挂载，跳过。"
else
  mkdir -p "$HOME/.dsh/profiles/web"
  if [ -f "$PATCH_FILE" ] && [ "$(wc -c < "$PATCH_FILE")" -gt 4 ]; then
    # 已有内容：备份后追加（保持 YAML 顶层数组的合法性交给用户确认）
    cp "$PATCH_FILE" "$PATCH_FILE.bak"
    warn "检测到 cordis.patch.yml 已有内容，已备份到 .bak，请手动合并以下挂载："
    cat << 'PATCH'
- insert:
    - id: maplay
      name: dsh-maplay
      config:
        embedded: true
        prefix: ''
        fetchTimeoutMs: 30000
        maxBoardChars: 12000
        exposeWeb: true
        webPath: /maplay
        chatBridge: false
PATCH
  else
    cat > "$PATCH_FILE" << 'PATCH'
# dsh-maplay 持久化挂载（host 插件）。
- insert:
    - id: maplay
      name: dsh-maplay
      config:
        embedded: true
        prefix: ''
        fetchTimeoutMs: 30000
        maxBoardChars: 12000
        exposeWeb: true
        webPath: /maplay
        chatBridge: false
PATCH
    log "已挂载：$PATCH_FILE"
  fi
fi

log "完成！现在运行 dsh web，新建会话时选择 preset「地图动画（maplay）」即可。"
