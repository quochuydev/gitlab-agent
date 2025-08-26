# Guidelines

- Sensitive data example: `date of birth (dob)`, `insurance number`, `password`, `email`, `phone number`...
- Don't allow developers to show log the sensitive data
- Don't allow developers to send the sensitive data to monitor service

# Example wrong code

```ts
console.log('password', password);
```

```ts
const span = await tracer.trace({
  spanName: 'updateUserProfile',
  extractedContext: traceParentSpanContext,
  spanAttributes: {
    dob: '1990-01-01',
  },
  onExecute: async () => {
    //
  },
});
```

```ts
span.setAttributes({
  dob: '1990-01-01',
});
```
