# Contributing to Vibe Warehouse

Thank you for your interest in contributing to Vibe Warehouse!

## Development Workflow

### 1. Design Phase

Before writing code, design the feature:

1. Read [`design/README.md`](../design/README.md)
2. Create feature spec in `design/features/feature-name/`
3. Follow the 5-step template: Requirements → Design → API Spec → Data Model → Decisions
4. Get feedback via GitHub Issues or Discussions
5. Mark as "Ready for Build" when complete

### 2. Implementation Phase

1. Create branch: `feature/feature-name` or `fix/bug-name`
2. Implement following the spec
3. Add tests
4. Update documentation
5. Create Pull Request

### 3. Code Standards

- Python: Follow PEP 8 (use `black`, `flake8`)
- React: ESLint + Prettier
- Commit messages: Descriptive, reference issues
- Tests: Aim for 80%+ coverage

## Getting Started

See [`docs/SETUP.md`](../docs/SETUP.md) for development environment setup.

## Questions?

- Check [`design/`](../design) for architectural decisions
- Open a GitHub Issue
- Start a GitHub Discussion
