import { subscribeToPoll } from "./poll-socket.js"

const CACHE_KEY = "big-teams-poll-results"
const MAX_RANKED_BARS = 8
const COLUMN_MAX_HEIGHT = 220
const COLORS = { navy: "#1B2C8F", ink: "#14182E", gold: "#F2C94C", ruby: "#E0473A", cloud: "#FBFBF8", track: "#0F1A5C" }
const DISPLAY_FONT = "'Press Start 2P', monospace"

function buildDemoSource(pollDefinition) {
  const votes = new Map()
  const weights = new Map()
  let voterCount = 0
  let joinedCount = 0
  return () => {
    joinedCount += 1 + Math.floor(Math.random() * 3)
    voterCount = Math.min(joinedCount, voterCount + Math.floor(Math.random() * 3))
    return {
      joined_count: joinedCount,
      voter_count: voterCount,
      questions: pollDefinition.questions.map((question, questionIndex) => ({
        id: questionIndex + 1,
        prompt: question.prompt,
        allows_multiple: Boolean(question.allows_multiple),
        options: question.options.map((label, optionIndex) => {
          const key = `${questionIndex + 1}:${optionIndex + 1}`
          if (!weights.has(key)) weights.set(key, 0.15 + Math.random() * 0.6)
          if (Math.random() < weights.get(key)) votes.set(key, (votes.get(key) ?? 0) + 1)
          return { id: key, label, position: optionIndex + 1, votes: votes.get(key) ?? 0 }
        }),
      })),
    }
  }
}

// ?polls=http://polls.localhost:3000 points the deck at another Game Stats AI server.
function resolveSocketUrl(configuredUrl, params) {
  const originOverride = params.get("polls")
  if (!originOverride) return configuredUrl
  const override = new URL(originOverride)
  override.protocol = override.protocol === "https:" ? "wss:" : "ws:"
  override.pathname = new URL(configuredUrl).pathname
  return override.toString()
}

function styled(tagName, style, text) {
  const element = document.createElement(tagName)
  element.setAttribute("style", style)
  if (text !== undefined) element.textContent = text
  return element
}

// results.json ranks options by votes and has no position, so take the order from
// deck/poll.json. Column charts and option counts depend on that fixed order.
function withDeckOrder(results, pollDefinition) {
  const questions = results.questions.map((question, questionIndex) => {
    const labels = pollDefinition?.questions[questionIndex]?.options ?? []
    const options = question.options.map((option, index) => {
      const deckIndex = labels.indexOf(option.label)
      const position = option.position ?? (deckIndex >= 0 ? deckIndex + 1 : labels.length + index + 1)
      return { ...option, position }
    })
    return { ...question, options }
  })
  return { ...results, questions }
}

function optionsInPositionOrder(question) {
  return question.options
    .map((option, index) => ({ ...option, position: option.position ?? index + 1 }))
    .sort((first, second) => first.position - second.position)
}

function questionFor(element, questions) {
  const questionNumber = Number(element.dataset.pollQuestion)
  return questionNumber ? questions[questionNumber - 1] : undefined
}

function playersText(count, verb) {
  return `${count} ${count === 1 ? "PLAYER HAS" : "PLAYERS HAVE"} ${verb}`
}

// People who answered this question. Phones answer one question at a time, so the
// poll-wide voter_count is the wrong number for a single question's slide. For single
// choice, people = votes. For multiple choice one person can cast several votes, so it
// needs the server's per-question voter_count; until that exists, show the vote total.
function questionVoterText(question) {
  if (Number.isInteger(question.voter_count)) return playersText(question.voter_count, "ANSWERED")
  const votes = totalVotes(question)
  if (!question.allows_multiple) return playersText(votes, "ANSWERED")
  return `${votes} ${votes === 1 ? "VOTE" : "VOTES"}`
}

function totalVotes(question) {
  return question.options.reduce((sum, option) => sum + option.votes, 0)
}

function resetPlaceholder(region) {
  if (region.pollInitialized) return
  region.replaceChildren()
  region.pollInitialized = true
  region.pollRows = new Map()
}

function buildBarRow() {
  const row = styled("div", "display:grid;grid-template-columns:480px 1fr 140px;align-items:center;gap:28px")
  const label = styled("p", "font-size:38px;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")
  const track = styled("div", `height:36px;background:${COLORS.track};border:4px solid ${COLORS.ink}`)
  const fill = styled("div", `height:100%;width:0%;background:${COLORS.gold};transition:width 700ms steps(14, end)`)
  const count = styled("p", `font-family:${DISPLAY_FONT};font-size:30px;color:${COLORS.gold};text-align:right`)
  track.append(fill)
  row.append(label, track, count)
  return { row, label, count, fill }
}

function renderRankedBars(region, question) {
  const rankedOptions = [...question.options].sort((first, second) => second.votes - first.votes).slice(0, MAX_RANKED_BARS)
  const topVotes = Math.max(1, ...rankedOptions.map((option) => option.votes))
  const shownOptionIds = new Set()

  rankedOptions.forEach((option, rank) => {
    shownOptionIds.add(option.id)
    let barRow = region.pollRows.get(option.id)
    if (!barRow) {
      barRow = buildBarRow()
      region.pollRows.set(option.id, barRow)
    }
    region.append(barRow.row)
    barRow.label.textContent = option.label
    barRow.count.textContent = option.votes
    barRow.fill.style.width = `${(option.votes / topVotes) * 100}%`
    barRow.fill.style.background = rank === 0 && option.votes > 0 ? COLORS.ruby : COLORS.gold
    barRow.row.style.opacity = option.votes > 0 ? "1" : "0.55"
  })
  for (const [optionId, barRow] of region.pollRows) {
    if (!shownOptionIds.has(optionId)) barRow.row.remove()
  }
}

function buildColumn() {
  const column = styled("div", "flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:12px")
  const count = styled("p", `font-family:${DISPLAY_FONT};font-size:30px;color:${COLORS.gold}`)
  const bar = styled("div", `width:70%;height:0px;background:${COLORS.gold};border:4px solid ${COLORS.ink};transition:height 700ms steps(14, end)`)
  const label = styled("p", "font-size:34px;font-weight:700;line-height:1.15;text-align:center;min-height:80px")
  column.append(count, bar, label)
  return { column, count, bar, label }
}

function renderColumns(region, question) {
  const options = optionsInPositionOrder(question)
  const topVotes = Math.max(1, ...options.map((option) => option.votes))
  const leaderVotes = Math.max(...options.map((option) => option.votes))
  const shownOptionIds = new Set()

  for (const option of options) {
    shownOptionIds.add(option.id)
    let column = region.pollRows.get(option.id)
    if (!column) {
      column = buildColumn()
      region.pollRows.set(option.id, column)
    }
    region.append(column.column)
    column.label.textContent = option.label
    column.count.textContent = option.votes
    column.bar.style.height = `${Math.max(4, (option.votes / topVotes) * COLUMN_MAX_HEIGHT)}px`
    column.bar.style.background = option.votes > 0 && option.votes === leaderVotes ? COLORS.ruby : COLORS.gold
  }
  for (const [optionId, column] of region.pollRows) {
    if (!shownOptionIds.has(optionId)) column.column.remove()
  }
}

function renderOptionCount(element, question) {
  const option = optionsInPositionOrder(question)[Number(element.dataset.pollOption) - 1]
  if (!option) return
  const total = totalVotes(question)
  const percent = total ? Math.round((option.votes / total) * 100) : 0
  element.textContent = `${option.votes} · ${percent}%`
}

function render(stage, unorderedResults, pollDefinition) {
  const results = withDeckOrder(unorderedResults, pollDefinition)
  stage.querySelectorAll('[data-poll="voters"]').forEach((element) => {
    const question = questionFor(element, results.questions)
    element.textContent = question ? questionVoterText(question) : playersText(results.voter_count, "VOTED")
  })
  if (Number.isInteger(results.joined_count)) {
    const joinedText = `${results.joined_count} ${results.joined_count === 1 ? "PLAYER HAS" : "PLAYERS HAVE"} JOINED`
    stage.querySelectorAll('[data-poll="joined"]').forEach((element) => { element.textContent = joinedText })
  }

  stage.querySelectorAll('[data-poll="prompt"]').forEach((element) => {
    const question = questionFor(element, results.questions)
    if (question) element.textContent = question.prompt.toUpperCase()
  })

  stage.querySelectorAll('[data-poll="results"]').forEach((region) => {
    const question = questionFor(region, results.questions)
    if (!question) return
    resetPlaceholder(region)
    if (region.dataset.pollChart === "columns") renderColumns(region, question)
    else renderRankedBars(region, question)
  })

  stage.querySelectorAll('[data-poll="count"]').forEach((element) => {
    const question = questionFor(element, results.questions)
    if (question) renderOptionCount(element, question)
  })
}

export async function startPoll({ stage, statusElement, params }) {
  if (!stage.querySelector("[data-poll]")) return null

  const config = await fetch("config.json", { cache: "no-store" }).then((response) => response.json())
  const socketUrl = resolveSocketUrl(config.pollSocketUrl, params)
  const pollDefinition = await fetch("../deck/poll.json", { cache: "no-store" }).then((response) => response.json())
  const demoSource = buildDemoSource(pollDefinition)
  let demoMode = params.has("demo")
  let demoTimer = null
  let liveStatus = "Connecting to the poll…"
  let latestResults = null

  const showStatus = (message) => {
    statusElement.hidden = !message
    statusElement.textContent = message ?? ""
  }

  try {
    latestResults = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null")
    if (latestResults && !demoMode) render(stage, latestResults, pollDefinition)
  } catch {}

  // Results are pushed over the WebSocket whenever a vote comes in or someone joins.
  subscribeToPoll({
    url: socketUrl,
    identifier: { channel: config.pollChannel, slug: pollDefinition.slug },
    onResults(results) {
      latestResults = results
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(results)) } catch {}
      if (!demoMode) render(stage, results, pollDefinition)
    },
    onStatus({ state, reason }) {
      liveStatus = {
        connecting: latestResults ? "Poll reconnecting, showing the last results" : "Connecting to the poll…",
        live: null,
        offline: `Poll offline (${reason}), showing the last results`,
        rejected: `The server has no "${pollDefinition.slug}" poll. Run bin/poll --apply`,
      }[state]
      if (!demoMode) showStatus(liveStatus)
    },
  })

  function applyMode() {
    clearInterval(demoTimer)
    if (demoMode) {
      const tick = () => render(stage, demoSource(), pollDefinition)
      tick()
      demoTimer = setInterval(tick, 2000)
      showStatus("Demo poll data (press D to switch to live)")
    } else {
      if (latestResults) render(stage, latestResults, pollDefinition)
      showStatus(liveStatus)
    }
  }

  applyMode()

  // Switches every phone to the question on screen. Waits until the slide settles so
  // arrowing quickly through the deck doesn't flip phones through every question.
  let sentQuestion
  let switchTimer = null
  function setLiveQuestion(question) {
    clearTimeout(switchTimer)
    if (demoMode || question === sentQuestion) return
    switchTimer = setTimeout(async () => {
      try {
        const response = await fetch("/api/current-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
        sentQuestion = question
        showStatus(liveStatus)
      } catch (error) {
        showStatus(`Phones did not switch to ${question ? `question ${question}` : "waiting"}: ${error.message}`)
      }
    }, 400)
  }

  return {
    setLiveQuestion,
    toggleDemo() {
      demoMode = !demoMode
      applyMode()
    },
  }
}
