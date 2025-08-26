# TypeScript Patterns and Guidelines

## Common Issues

- Not using `any`
- Get the error with ESlint
- Missing null/undefined checks

## Specific requirements

- Variable naming: use camelCase

**Bad:**

```typescript
const update_date = new Date();
```

**Good:**

```typescript
const updateDate = new Date();
```

- Use ISOString format for request body

**Bad:**

```typescript
await fetch('/api/update', {
  method: 'POST',
  body: JSON.stringify({ updateDate: Date.now() }),
});
```

**Good:**

```typescript
await fetch('/api/update', {
  method: 'POST',
  body: JSON.stringify({ updateDate: new Date().toISOString() }),
});
```
