# Security Guidelines

## Common Security Vulnerabilities to Check

### 1. SQL Injection Prevention
**Good:**
```javascript
const getUserById = async (id) => {
  const query = 'SELECT * FROM users WHERE id = ?';
  return db.query(query, [id]);
};
```

**Bad:**
```javascript
const getUserById = async (id) => {
  const query = `SELECT * FROM users WHERE id = ${id}`;
  return db.query(query);
};
```

### 2. XSS Prevention
**Good:**
```javascript
import { escape } from 'html-escaper';

const renderUserContent = (content) => {
  return escape(content);
};
```

**Bad:**
```javascript
const renderUserContent = (content) => {
  return `<div>${content}</div>`;
};
```

### 3. Authentication & Authorization
**Good:**
```javascript
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};
```

### 4. Secrets Management
**Never hardcode:**
- API keys
- Database passwords
- JWT secrets
- Third-party tokens

**Use environment variables:**
```javascript
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}
```

### 5. Security Issues to Flag
- Hardcoded credentials
- Unvalidated user input
- Missing authentication
- Insecure randomness
- Path traversal vulnerabilities
- Missing HTTPS enforcement
- Exposed sensitive data in logs