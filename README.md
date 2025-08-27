```sh
(cd ./apps/review && GIT_DIFF="$(git diff origin/main...HEAD)" yarn review)
```

### ✅ Correct way for AI Agent

1. Go to **Project → Settings → Access Tokens**.
2. Create a token with:

   - Name: `AI_REVIEW_AGENT`
   - Role: `Maintainer`
   - Scopes: ✅ `api`

3. Add it as a **CI/CD variable**:

   - Key: `GITLAB_TOKEN`
   - Value: `<the token>`
   - Masked & Protected (if only used in protected branches).

Then in your pipeline YAML you just export/use:

```yaml
variables:
  GITLAB_TOKEN: $GITLAB_TOKEN
```
