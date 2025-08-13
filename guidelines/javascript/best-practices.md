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

**Bad:**

```javascript
function fetchUserData(userId, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/users/" + userId);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        callback(null, JSON.parse(xhr.responseText));
      } else {
        callback(new Error("Request failed"));
      }
    }
  };
  xhr.send();
}
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

**Bad:**

```javascript
const processData = (data) => {
  return data.items.map((item) => ({
    id: item.id,
    name: item.name.trim(),
  }));
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
