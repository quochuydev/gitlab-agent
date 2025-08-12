# Python Best Practices

## Code Quality Guidelines

### 1. Pythonic Code
**Good:**
```python
def process_users(users: list[dict]) -> list[str]:
    return [
        user['name'].title() 
        for user in users 
        if user.get('active', False)
    ]
```

**Bad:**
```python
def process_users(users):
    result = []
    for i in range(len(users)):
        if users[i]['active'] == True:
            result.append(users[i]['name'].title())
    return result
```

### 2. Exception Handling
**Good:**
```python
import logging
from typing import Optional

def fetch_user_data(user_id: str) -> Optional[dict]:
    try:
        response = requests.get(f"/api/users/{user_id}")
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logging.error(f"Failed to fetch user {user_id}: {e}")
        return None
```

**Bad:**
```python
def fetch_user_data(user_id):
    try:
        response = requests.get(f"/api/users/{user_id}")
        return response.json()
    except:
        pass
```

### 3. Type Hints
**Good:**
```python
from typing import List, Dict, Optional
from dataclasses import dataclass

@dataclass
class User:
    id: str
    name: str
    email: str
    active: bool = True

def get_active_users(users: List[User]) -> List[User]:
    return [user for user in users if user.active]
```

### 4. Common Python Issues
- Missing type hints
- Bare except clauses
- Mutable default arguments
- Not using context managers for files
- Global variables
- Long functions (>50 lines)
- Deep nesting
- Not following PEP 8