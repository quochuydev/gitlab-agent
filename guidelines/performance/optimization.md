# Performance Optimization Guidelines

## Common Performance Issues

### 1. Inefficient Loops
**Good:**
```javascript
const processLargeArray = (items) => {
  const result = new Map();
  
  for (const item of items) {
    if (item.active) {
      result.set(item.id, item.name);
    }
  }
  
  return result;
};
```

**Bad:**
```javascript
const processLargeArray = (items) => {
  const result = {};
  
  items.forEach(item => {
    items.forEach(innerItem => { // Nested O(n²) loop
      if (item.id === innerItem.relatedId) {
        result[item.id] = item.name;
      }
    });
  });
  
  return result;
};
```

### 2. Memory Leaks
**Good:**
```javascript
const createEventHandler = () => {
  const handler = (event) => {
    console.log('Event handled:', event.type);
  };
  
  element.addEventListener('click', handler);
  
  // Cleanup
  return () => {
    element.removeEventListener('click', handler);
  };
};
```

**Bad:**
```javascript
const createEventHandler = () => {
  element.addEventListener('click', (event) => {
    console.log('Event handled:', event.type);
  });
  // No cleanup - memory leak
};
```

### 3. Async Operations
**Good:**
```javascript
const fetchUserData = async (userIds) => {
  const promises = userIds.map(id => fetchUser(id));
  const users = await Promise.all(promises);
  return users.filter(Boolean);
};
```

**Bad:**
```javascript
const fetchUserData = async (userIds) => {
  const users = [];
  for (const id of userIds) {
    const user = await fetchUser(id); // Sequential, slow
    if (user) users.push(user);
  }
  return users;
};
```

### 4. Performance Issues to Flag
- O(n²) or worse algorithmic complexity
- Unnecessary API calls in loops
- Large objects in memory without cleanup
- Synchronous file operations
- Missing pagination for large datasets
- Inefficient database queries
- Large bundle sizes
- Unused dependencies