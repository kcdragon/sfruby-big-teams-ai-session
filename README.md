# Big teams: share your strategies for agentic coding

Session materials for SF Ruby 2026 (Nov 10–12, SFJAZZ). The session runs 1:15–2:45pm as three drop-in levels:

1. **Level 1 (1:15–1:45):** Who's in the room. Line-ups, a live poll and an open mic.
2. **Level 2 (1:45–2:15):** Birds of a feather. Six topic tables with report-outs.
3. **Level 3 (2:15–2:45):** Two wins and a regret.

## Presenting

```sh
bin/dev              # serves the deck and auto-syncs deck/poll.json (see Live poll)
bin/present          # serves the deck at http://localhost:4567/present/ and opens it
```

- Arrow keys, space or a clicker move between slides; click also advances
- **F** toggles fullscreen
- **N** opens a speaker notes window, with a clock and elapsed timer, that stays in sync
- **D** toggles fake poll data for rehearsal (or open `/present/?demo`)
- `/present/?polls=http://polls.localhost:3000` points the poll WebSocket at a local Game Stats AI server

## Slide deck

The slides live in `deck/project/`: `deck.json` sets the order, sections and fonts, and `slides/<id>.html` holds one slide each, with speaker notes in the slide's `<aside>`. This repo is the source of truth. The Claude artifact (https://claude.ai/artifact/VesjQXfDyxrAM5Qx7tKUTH) is an older preview copy and does not show live poll results.

## Live poll

`deck/poll.json` is the single source for the poll: its questions drive both the poll slides and the live poll on Game Stats AI. After editing it, run:

```sh
bin/dev             # serve the deck and run bin/poll --watch together
bin/poll            # rebuild the poll slides, show what would change on the server
bin/poll --apply    # rebuild the poll slides and update the server
bin/poll --watch    # rebuild and update the server now and on every save of poll.json
bin/poll --reset    # rebuild, then delete the poll (and every vote) and create it fresh
bin/poll --slides   # rebuild the poll slides only
```

Each question gets one slide, `deck/project/slides/poll-N.html`, placed right after the GRAB YOUR PHONE slide, whose "Answer N quick questions" count is kept up to date. Those files are generated, so edit `poll.json` rather than the HTML. Besides `prompt`, `options` and `allows_multiple`, a question can set:

- `chart`: `columns` (options in a fixed order, good for ranges), `bars` (ranked by votes, top 8) or `cards`. Without it, single-choice questions with up to 6 options get columns and the rest get bars.
- `notes`: the speaker notes.
- `heading` and `cards`: for `cards`, the slide title and one `{"icon", "title", "text"}` per option, in option order. Icons are the names in `present/icons.js`.

The API token comes from the `POLLS_API_TOKEN` environment variable. `POLLS_API_URL` defaults to `https://polls.gamestats.ai`. The API takes the whole poll in one request: `POST /` creates it, `PATCH /:slug` replaces its title and questions, and `DELETE /:slug` removes it. Resending an unchanged poll does nothing. Once anyone has voted, including test votes, the server refuses question changes; `bin/poll --reset` gets around that by starting over, so use it before the session to clear test votes too. Run the tests with `ruby test/poll_sync_test.rb` and `ruby test/poll_slides_test.rb`.

Phones show one question at a time, following the slides. When a slide changes, the deck asks `bin/present` to set the poll's current question (`PATCH /:slug` with `current_question`), using `POLLS_API_TOKEN` from the environment `bin/present` runs in, so the token never reaches the browser. Each poll slide opens its question; every other slide, GRAB YOUR PHONE included, closes them, so phones show a waiting screen. (A slide can open a question without showing its results by setting `data-poll-live="N"`.) Changes wait 400ms for the slide to settle, so arrowing quickly through the deck doesn't flip phones through every question. Demo mode doesn't switch phones. If a switch fails, the status line says so.

To rehearse with real traffic, open a poll slide in the deck and run `bin/simulate-votes N`. N simulated people answer the question that's open right now, then it stops. They pick up their phones over the first few seconds, tap a few seconds after reading (most within 10), and sometimes skip or change their answer. Answers lean toward a few popular options. Each phone keeps its own cookies and posts the real answer form, so the answers count exactly like real ones. If you move to another slide mid-run, the answers still on their way are refused as too late. `--seed` repeats a run. Clear the answers afterwards with `bin/poll --reset`; until then the server refuses question changes. Tests: `ruby test/vote_simulator_test.rb`.

Demo mode (`?demo` or the D key) generates fake votes for the questions in `deck/poll.json`.

Attendees vote at https://polls.gamestats.ai/sfruby (the QR code is `deck/project/assets/poll-qr.svg`). Game Stats AI only hosts the voting page and a JSON endpoint with the vote counts. The deck renders the results itself. `present/poll.js` opens a WebSocket to the Action Cable endpoint in `present/config.json` (`wss://polls.gamestats.ai/live`) and subscribes to `Polls::ResultsChannel` for the poll's slug. The server sends the full results on subscribe and again on every vote, join or poll update, and the deck redraws the `data-poll` elements in the slides (`present/poll-socket.js` holds the small Action Cable client). `data-poll-question="N"` refers to the Nth question, so the poll's question order must match the slides. If the connection drops, it keeps showing the last results it got and reconnects on its own. The server lists options by vote count, so the deck puts them back in the order from `deck/poll.json` for the column charts and cards.

Each message is the same JSON as `GET /sfruby/results.json` (`joined_count` is how many phones have opened the voting page; `voter_count` is how many have submitted answers):

```json
{
  "joined_count": 57,
  "voter_count": 42,
  "questions": [
    {"id": 1, "prompt": "Which coding agents do you use?",
     "options": [{"id": 3, "label": "Claude Code", "votes": 30}]}
  ]
}
```
