# Muse <-> Claude bridge (the one rule)

Chat inboxes drop messages. Git does not. So:

- Claude writes to `bridge/to-muse.md`. Muse writes to `bridge/to-claude.md`.
- Append only, newest at the bottom, each entry: `## [N] YYYY-MM-DD HH:MM  subject` then body.
- Push to `main` after every entry. No branches for messages.
- Every session start AND every wakeup: `git pull`, read the other file, answer anything with no `ACK [N]`.
- Reply with `ACK [N]` plus the answer. Silence is never "no response": check the file first.
- Never tell Sawyer "the other one didn't respond" until the file was read this turn.
