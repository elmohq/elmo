---
"@workspace/lib": patch
---

IMPORTANT BUGFIX: Fixed OpenAI response retrieval that broke in v0.2.15, which caused repeated (but billable) failures. If you are collecting data from the direct OpenAI API using Elmo, please update immediately.
