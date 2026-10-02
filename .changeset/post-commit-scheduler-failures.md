---
"@workspace/web": patch
"@workspace/lib": patch
---

Creating prompts or a brand no longer answers an error when the write itself succeeded and only the job scheduling behind it failed — retrying that error created a second copy of a prompt batch or came back with a conflict on the brand just created.
