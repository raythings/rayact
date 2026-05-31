# Contributing to Rayact

Thank you for your interest in contributing to Rayact! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

- Be respectful and inclusive
- Focus on what is best for the community
- Show empathy towards other community members
- Accept constructive criticism
- Be open to new ideas and suggestions

## Getting Started

### 1. Fork the Repository

Click the "Fork" button on the GitHub repository page to create your own fork.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR_USERNAME/rayact.git
cd rayact
```

### 3. Set Up Development Environment

Follow the [DEVELOPMENT.md](DEVELOPMENT.md) guide to set up your development environment:

```bash
# Install dependencies
npm install

# Build packages
npm run build

# Build desktop example
cmake -B build -S . -DENABLE_DESKTOP=ON
cmake --build build
```

### 4. Create a Development Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

## Development Workflow

### Running the Application

```bash
# Run desktop application
./build/bin/rayact_desktop [app.js]

# Watch TypeScript files
npm run dev
```

### Adding a New Feature

1. Make changes in the appropriate package directory
2. Test your changes locally
3. Build and run the application
4. Commit your changes
5. Push to your fork
6. Create a pull request

### Code Style

Follow these style guidelines:

**TypeScript/JavaScript**
- Use TypeScript for new code
- Use ESLint with the recommended rules
- Use Prettier for code formatting
- Follow Airbnb JavaScript style guide

**C++**
- Follow Google C++ Style Guide
- Use const references for non-modifiable parameters
- Use meaningful variable names
- Add comments for complex logic

## Branching Strategy

We use Git Flow branching model:

- `main`: Production-ready code
- `develop`: Development branch
- `feature/*`: New features
- `fix/*`: Bug fixes
- `docs/*`: Documentation updates
- `test/*`: Test infrastructure
- `refactor/*`: Code refactoring

### Branch Naming

- Features: `feature/add-text-component`
- Fixes: `fix/window-focus-bug`
- Documentation: `docs/update-api`
- Refactoring: `refactor/quickjs-bridge`

## Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions/changes
- `chore`: Build process or auxiliary tool changes

### Examples

```
feat(renderer): add polygon shape support

Implement polygon rendering with support for multiple vertices
and custom colors. Includes tests and documentation.

Closes #123
```

```
fix(quickjs): resolve memory leak in context cleanup

Properly free all JavaScript values when context is destroyed
to prevent memory leaks in long-running applications.

Fixes #456
```

## Pull Request Process

### 1. Create a Pull Request

- Push your branch to your fork
- Go to the original repository
- Click "New Pull Request"
- Select your branch

### 2. Provide Information

Your PR should include:

- **Description**: What does this PR do?
- **Type**: Feature, bug fix, documentation, etc.
- **Testing**: How did you test your changes?
- **Related Issues**: Links to any related issues
- **Screenshots**: Visual changes (if applicable)

### 3. Wait for Review

- Maintainers will review your PR
- Address any feedback
- Update your branch if needed
- Respond to review comments

### 4. Getting Approved

- Once approved, your PR will be merged
- Maintainers will run tests
- Code will be built and deployed
- Thank you for your contribution!

## Coding Standards

### TypeScript/JavaScript

```typescript
// Good: Use explicit types
function renderShape(x: number, y: number, color: string): void {
    const ctx = getContext();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 10, 10);
}

// Bad: Implicit types
function renderShape(x, y, color) {
    const ctx = getContext();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 10, 10);
}
```

**Rules:**
- Always use TypeScript for new code
- Use arrow functions (`=>`)
- Avoid using `var`, use `let` or `const`
- Prefer functional programming patterns
- Write reusable, modular code

### C++

```cpp
// Good: Modern C++
class Shape {
public:
    explicit Shape(int id) : id_(id) {}

    void render(Canvas& ctx) const {
        ctx.draw(id_, getBounds());
    }

private:
    const int id_;
    Bounds bounds_;
};

// Bad: Old C++
class Shape {
    int id;
public:
    Shape(int i) {
        id = i;
    }
};
```

**Rules:**
- Use C++17 features
- Use RAII for resource management
- Use `const` and `constexpr` appropriately
- Use smart pointers (`unique_ptr`, `shared_ptr`)
- Write clean, readable code

## Testing

### Writing Tests

```bash
# Run existing tests
npm test

# Run specific test file
npm test -- Shape.test.ts

# Run with coverage
npm run test:coverage
```

### Test Structure

- Use descriptive test names
- Test both happy paths and edge cases
- Isolate test dependencies
- Use `describe` and `it` for organization

```typescript
describe('Shape', () => {
    describe('render', () => {
        it('should render rectangle', () => {
            const shape = new Rect({ x: 0, y: 0, width: 10, height: 10 });
            const ctx = createMockContext();
            shape.render(ctx);
            expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, 10);
        });

        it('should handle invalid dimensions', () => {
            expect(() => {
                new Rect({ width: -10, height: 10 });
            }).toThrow('Width cannot be negative');
        });
    });
});
```

### Testing Native Code

```bash
# Build tests
cmake -B build -S . -DENABLE_TESTS=ON
cmake --build build

# Run tests
./build/bin/rayact_test
```

**C++ Testing Rules:**
- Use Google Test for C++ tests
- Test function signatures and error handling
- Test performance-critical paths
- Keep tests fast and focused

## Documentation

### Documentation Requirements

Every feature must include:

- **API Documentation**: JSDoc for TypeScript functions
- **Usage Examples**: Code examples showing how to use the feature
- **Code Comments**: Comments explaining complex logic
- **README Updates**: Updates to main documentation

### Example Documentation

```typescript
/**
 * Renders a rectangle on the canvas
 * @param x - X coordinate of rectangle top-left corner
 * @param y - Y coordinate of rectangle top-left corner
 * @param width - Width of rectangle
 * @param height - Height of rectangle
 * @param color - Rectangle color as hex value (e.g., 0xFFFF0000)
 * @example
 * renderRect(100, 100, 200, 150, 0xFF0000FF);
 */
export function renderRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number
): void {
    // Implementation
}
```

### Updating Documentation

When making significant changes:

1. Update package README
2. Update API documentation
3. Update development guide if needed
4. Add examples to examples directory
5. Create migration guide if breaking changes

## Code Review Process

### What to Expect

- Reviewers will provide constructive feedback
- Discuss proposed changes before coding
- Merge quickly when code is ready
- Keep PRs focused and small

### During Review

- Respond to comments promptly
- Ask clarifying questions
- Suggest improvements
- Take feedback gracefully

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests are passing
- [ ] Documentation is complete
- [ ] No obvious bugs or security issues
- [ ] Performance is acceptable
- [ ] User experience is improved

## Getting Help

### Community Resources

- **GitHub Discussions**: For questions and discussions
- **GitHub Issues**: For bug reports and feature requests
- **Discord Community**: For real-time chat (coming soon)

### Asking Questions

When asking for help:

- Search existing issues first
- Provide clear, detailed information
- Include code examples
- Specify platform and version
- Explain what you expected vs. what happened

## Recognition

Contributors will be recognized in:

- Project README
- Commit messages
- GitHub contributors list
- Monthly feature highlight (optional)

### Contributor Levels

- **New Contributor**: First PR merged
- **Regular Contributor**: 5+ PRs merged
- **Maintainer**: Added to project team
- **Core Contributor**: Major architectural changes

## Release Process

### Versioning

- Follow Semantic Versioning (MAJOR.MINOR.PATCH)
- New features → MINOR version
- Bug fixes → PATCH version
- Breaking changes → MAJOR version

### Release Checklist

- [ ] All PRs merged to main
- [ ] Version numbers updated
- [ ] Changelog created
- [ ] Documentation updated
- [ ] Tests passing on all platforms
- [ ] Examples built and tested
- [ ] Ready for release

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Rayact! 🎉

---

**Remember**: Be respectful, be helpful, and focus on building something great together!
