---
"@workspace/worker": patch
---

A prompt whose providers keep failing now backs off all the way to its normal cadence instead of restarting on the shortest retry delays.
