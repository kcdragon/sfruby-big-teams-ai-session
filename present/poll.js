const CACHE_KEY = "big-teams-poll-results"
const MAX_RANKED_BARS = 8
const COLUMN_MAX_HEIGHT = 220
const COLORS = { navy: "#1B2C8F", ink: "#14182E", gold: "#F2C94C", ruby: "#E0473A", cloud: "#FBFBF8", track: "#0F1A5C" }
const DISPLAY_FONT = "'Press Start 2P', monospace"

const DEMO_QUESTIONS = [
  { prompt: "How many engineers work at your company?", options: ["1–10", "11–100", "101–1,000", "1,001–10,000", "10,000+"], weights: [2, 4, 5, 3, 1] },
  { prompt: "How much of your merged code did an agent write?", options: ["Under 10%", "10–25%", "25–50%", "50–75%", "Over 75%"], weights: [2, 3, 4, 3, 2] },
  { prompt: "How locked down are AI tools at your company?", options: ["Anything goes", "Approved tools only", "Mostly blocked"], weights: [3, 5, 1] },
  { prompt: "What’s your role?", options: ["Engineer", "Founder or leader", "Builder without the engineer title"], weights: [6, 3, 2] },
  { prompt: "Which coding agents do you use?", options: ["Claude Code", "Cursor", "GitHub Copilot", "OpenAI Codex", "Gemini CLI", "Windsurf", "Amp", "Devin", "Something else", "None yet"], weights: [9, 7, 6, 4, 2, 2, 1, 1, 1, 1] },
  { prompt: "Which one do you use the most?", options: ["Claude Code", "Cursor", "GitHub Copilot", "OpenAI Codex", "Gemini CLI", "Windsurf", "Amp", "Devin", "Something else"], weights: [8, 6, 4, 3, 1, 1, 1, 1, 1] },
  { prompt: "Where do your agents do their work?", options: ["In my editor", "In my terminal", "In the cloud, in the background", "In code review or CI", "Not using agents yet"], weights: [6, 5, 3, 2, 1] },
]

function buildDemoSource() {
  const votes = new Map()
  let voterCount = 0
  return () => {
    voterCount += 1 + Math.floor(Math.random() * 3)
    return {
      voter_count: voterCount,
      questions: DEMO_QUESTIONS.map((question, questionIndex) => {
        const totalWeight = question.weights.reduce((sum, weight) => sum + weight, 0)
        return {
          id: questionIndex + 1,
          prompt: question.prompt,
          options: question.options.map((label, optionIndex) => {
            const key = `${questionIndex + 1}:${optionIndex + 1}`
            const bump = Math.random() < (question.weights[optionIndex] / totalWeight) * 1.6 ? 1 : 0
            votes.set(key, (votes.get(key) ?? 0) + bump)
            return { id: key, label, position: optionIndex + 1, votes: votes.get(key) }
          }),
        }
      }),
    }
  }
}

function resolveResultsUrl(configuredUrl, params) {
  const originOverride = params.get("polls")
  if (!originOverride) return configuredUrl
  const configured = new URL(configuredUrl)
  return new URL(configured.pathname, originOverride).toString()
}

function styled(tagName, style, text) {
  const element = document.createElement(tagName)
  element.setAttribute("style", style)
  if (text !== undefined) element.textContent = text
  return element
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

function render(stage, results) {
  const voterText = `${results.voter_count} ${results.voter_count === 1 ? "PLAYER HAS" : "PLAYERS HAVE"} VOTED`
  stage.querySelectorAll('[data-poll="voters"]').forEach((element) => { element.textContent = voterText })

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
  const resultsUrl = resolveResultsUrl(config.pollResultsUrl, params)
  const demoSource = buildDemoSource()
  let demoMode = params.has("demo")

  const showStatus = (message) => {
    statusElement.hidden = !message
    statusElement.textContent = message ?? ""
  }

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null")
    if (cached && !demoMode) render(stage, cached)
  } catch {}

  async function refresh() {
    if (demoMode) {
      render(stage, demoSource())
      showStatus("Demo poll data (press D to switch to live)")
      return
    }
    try {
      const response = await fetch(resultsUrl, { cache: "no-store" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const results = await response.json()
      render(stage, results)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(results)) } catch {}
      showStatus(null)
    } catch (error) {
      showStatus(`Poll offline (${error.message}), showing the last results`)
    }
  }

  await refresh()
  setInterval(refresh, (config.pollRefreshSeconds ?? 2) * 1000)

  return {
    toggleDemo() {
      demoMode = !demoMode
      refresh()
    },
  }
}
