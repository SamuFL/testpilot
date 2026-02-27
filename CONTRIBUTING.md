# Contributing

Thank you for your interest in contributing to **testpilot**!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/testpilot.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/my-feature`
5. Make your changes
6. Run type checking: `npx tsc --noEmit`
7. Commit and push
8. Open a Pull Request

## Development

```bash
# Type-check
npx tsc --noEmit

# Run the demo test (requires API key in .env)
npx tsx src/runner.ts

# Run a specific test
npx tsx src/runner.ts --test tests/TC001-todomvc-add-and-complete.yaml
```

## Adding a New LLM Provider

1. Create `src/providers/your-provider.ts` implementing the `LLMAdapter` interface
2. Add the provider name to the `LLMProvider` type in `src/llm-shared.ts`
3. Register it in the factory function in `src/llm-adapter.ts`
4. Add configuration to `.env.example`
5. Update the README

## Adding a New Test Case

1. Create `tests/TCNNN-descriptive-name.yaml`
2. Follow the schema in `src/types.ts` (`TestCase` interface)
3. Write steps in natural language — no CSS selectors needed
4. Add `site_context` hints if the target site has specific UI patterns
5. Test it with `npx tsx src/runner.ts --test tests/your-test.yaml`

## Code Style

- TypeScript strict mode
- ESM modules (`import`/`export`, `.js` extensions in imports)
- Prefer `const` over `let`
- Keep functions small and focused

## Reporting Issues

Use GitHub Issues. Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Node.js version and OS
