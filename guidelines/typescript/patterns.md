# TypeScript Patterns and Guidelines

## Type Safety Best Practices

### 1. Interface Design

**Good:**

```typescript
interface User {
  readonly id: string;
  name: string;
  email: string;
  preferences?: UserPreferences;
  createdAt: Date;
}

interface UserPreferences {
  theme: "light" | "dark";
  notifications: boolean;
  language: string;
}
```

**Bad:**

```typescript
interface User {
  id: any;
  name: any;
  email: any;
  preferences: any;
}
```

### 2. Generic Types

**Good:**

```typescript
interface ApiResponse<T> {
  data: T;
  status: "success" | "error";
  message?: string;
}

const fetchUser = async (id: string): Promise<ApiResponse<User>> => {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
};
```

### 3. Union Types and Guards

**Good:**

```typescript
type Status = "loading" | "success" | "error";

const isErrorStatus = (status: Status): status is "error" => {
  return status === "error";
};
```

### 4. Common TypeScript Issues

- Using `any` instead of proper types
- Missing return type annotations
- Not using strict mode
- Ignoring TypeScript errors with `@ts-ignore`
- Missing null/undefined checks
- Not using readonly for immutable data
