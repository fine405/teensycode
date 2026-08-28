---
name: deepseek-provider
description: Configure TeensyCode to call DeepSeek directly with a user-owned API key
---
# DeepSeek Provider

- Use `@ai-sdk/deepseek`; do not route model calls through Vercel AI Gateway.
- Read the API key from `DEEPSEEK_API_KEY` in the local environment.
- Never place a real key in source code, examples, logs, or commits.
- Use `DEEPSEEK_MODEL` to override the parent model when needed.
