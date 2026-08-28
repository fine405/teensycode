# TeensyCode

A from-scratch implementation of Vercel Academy's [Build Your Own AI Coding Agent Harness](https://vercel.com/academy/build-ai-agent-harness) course.

This adaptation uses the direct DeepSeek provider instead of Vercel AI Gateway:

- `deepseek-v4-flash` for the parent agent and explorer
- `deepseek-v4-pro` for the executor
- `DEEPSEEK_API_KEY` from `.env.local`

## Setup

```bash
npm install
cp .env.example .env.local
npm run typecheck
```

Add your own DeepSeek API key to `.env.local`. Never commit that file.

Set `SANDBOX=just-bash` to use the copy-on-write in-memory backend. It reads
from the target project but keeps writes in memory.

Run the CLI with explicit flags when needed:

```bash
bun run index.ts --sandbox=just-bash --model=deepseek-v4-flash . \
  "Read package.json and summarize it"
```

## Learning history

Each `course/NN-*` branch is a runnable cumulative module checkpoint. Each lesson has an atomic commit and a `lesson/NN.N-*` tag, including concise notes for concept-only lessons.

Use module branches for a complete runnable stage and lesson tags for a focused
diff:

```bash
git switch course/06-subagent-delegation
git diff lesson/06.2-explorer-subagent lesson/06.3-executor-subagent
```

| Module branch | Main addition |
| --- | --- |
| `course/01-agent-loop` | Agent loop and first tools |
| `course/02-tool-design` | Tool contracts and approval gates |
| `course/03-system-prompt` | Dynamic instructions and verification |
| `course/04-sandbox-abstraction` | Local and in-memory sandboxes |
| `course/05-context-management` | Pruning, caps, and DeepSeek caching |
| `course/06-subagent-delegation` | Explorer and executor delegation |
| `course/07-sandbox-lifecycle` | Lifecycle and durability concepts |
| `course/08-human-in-the-loop` | Structured questions and approval modes |
| `course/09-planning-verification` | Todos and verification discovery |
| `course/10-surfaces` | CLI streaming and web-surface boundary |
| `course/11-extensibility` | Skills, tool registry, and event bus |

The branches are cumulative: Module 11 contains the complete harness, while an
earlier branch stops exactly after that module. List every lesson checkpoint
with `git tag --list 'lesson/*' --sort=version:refname`.
