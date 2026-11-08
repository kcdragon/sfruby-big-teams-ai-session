# Big teams: share your strategies for agentic coding

Session materials for SF Ruby 2026 (Nov 10–12, SFJAZZ). The session runs 1:15–2:45pm as three drop-in levels:

1. **Level 1 (1:15–1:45):** Who's in the room. Line-ups, a live poll and an open mic.
2. **Level 2 (1:45–2:15):** Birds of a feather. Six topic tables with report-outs.
3. **Level 3 (2:15–2:45):** Two wins and a regret.

## Presenting

```sh
bin/present          # serves the deck at http://localhost:4567/present/ and opens it
```

- Arrow keys, space or a clicker move between slides; click also advances
- **F** toggles fullscreen
- **N** opens a speaker notes window, with a clock and elapsed timer, that stays in sync
- **D** toggles fake poll data for rehearsal (or open `/present/?demo`)
- `/present/?polls=http://polls.localhost:3000` points the poll at a local Game Stats AI server

## Slide deck

The slides live in `deck/project/`: `deck.json` sets the order, sections and fonts, and `slides/<id>.html` holds one slide each, with speaker notes in the slide's `<aside>`. This repo is the source of truth. The Claude artifact (https://claude.ai/artifact/VesjQXfDyxrAM5Qx7tKUTH) is an older preview copy and does not show live poll results.

## Live poll

Attendees vote at https://polls.gamestats.ai/sfruby (the QR code is `deck/project/assets/poll-qr.svg`). Game Stats AI only hosts the voting page and a JSON endpoint with the vote counts. The deck renders the results itself: `present/poll.js` polls the URL in `present/config.json` every 2 seconds and fills the `data-poll` elements in the slides. `data-poll-question="N"` refers to the Nth question, so the poll's question order must match the slides. If the server can't be reached, it keeps showing the last results it got.

The JSON it expects:

```json
{
  "voter_count": 42,
  "questions": [
    {"id": 1, "prompt": "Which coding agents do you use?",
     "options": [{"id": 3, "label": "Claude Code", "position": 1, "votes": 30}]}
  ]
}
```
