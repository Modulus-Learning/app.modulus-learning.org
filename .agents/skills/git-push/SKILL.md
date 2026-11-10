---
name: git-push
description: Use when asked to push the current branch or its commits to the remote repository. Checks the worktree, upstream, outgoing commits, and existing authorisation before pushing.
---

# Pushing commits

Push commits to the remote repository.

## Steps

1. Run `git status` to check for uncommitted changes. Report them; a push sends
   commits only. Do not stage or commit those changes as part of a push request.
2. Determine the current branch and its upstream tracking branch. If no upstream is set, suggest setting one with `git push -u origin <branch>`.
3. Run `git log @{u}..HEAD --oneline` to show commits that will be pushed. If there are no new commits, inform the user and stop.
4. Show the commit list. Proceed if the user has already authorised pushing
   these commits to this destination. Otherwise ask for confirmation of that
   concrete push. Never proceed past an explicit instruction to hold off.
5. Run `git push` to push the commits.
6. Report success or failure.
