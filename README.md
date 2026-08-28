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

## Learning history

Each `course/NN-*` branch is a runnable cumulative module checkpoint. Each lesson has an atomic commit and a `lesson/NN.N-*` tag, including concise notes for concept-only lessons.
