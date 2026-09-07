---
"@modulus-learning/agent": minor
---

Reported cumulative contribution targets the server refused. A `set-progress` response may now carry an additive `rejected_targets` member naming each target and why it was refused; the submission itself still completes, and the targets are logged through the agent's logger for authors who opted into one.
