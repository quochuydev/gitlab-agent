# JavaScript Best Practices

## Code Quality Guidelines

### 1. Use Modern JavaScript Features

**Good:**

```javascript
const fetchUserData = async (userId) => {
  try {
    const response = await fetch(`/api/users/${userId}`);
    const user = await response.json();
    return user;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw error;
  }
};
```

### 2. Error Handling

**Good:**

```javascript
const processData = (data) => {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid data provided");
  }

  return (
    data.items?.map((item) => ({
      id: item.id,
      name: item.name?.trim() || "Unknown",
    })) || []
  );
};
```

### 3. Function Design

- Keep functions small and focused
- Use descriptive names
- Avoid deep nesting
- Return early when possible

### 4. Common Issues to Flag

- Missing error handling
- Unused variables
- Console.log statements in production
- Hardcoded values
- Deep nesting (> 3 levels)
- Functions longer than 50 lines
