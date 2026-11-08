const CACHE_KEY = "big-teams-poll-results"
const TOP_OPTIONS_PER_QUESTION = 5
const WIDE_OPTIONS_PER_QUESTION = 8
const COLORS = { navy: "#1B2C8F", ink: "#14182E", gold: "#F2C94C", ruby: "#E0473A", cloud: "#FBFBF8", track: "#0F1A5C" }
const DISPLAY_FONT = "'Press Start 2P', monospace"

const DEMO_QUESTIONS = [
  { id: 1, prompt: "Which coding agents do you use?", options: ["Claude Code", "Cursor", "GitHub Copilot", "OpenAI Codex", "Gemini CLI", "Windsurf", "Amp", "Devin"] },
  { id: 2, prompt: "Which one do you use the most?", options: ["Claude Code", "Cursor", "GitHub Copilot", "OpenAI Codex", "Gemini CLI"] },
  { id: 3, prompt: "Where do your agents do their work?", options: ["In my editor", "In my terminal", "In the cloud, in the background", "In code review or CI"] },
]

function buildDemoSource() {
  const votes = new Map()
  let voterCount = 0
  return () => {
    voterCount += 1 + Math.floor(Math.random() * 3)
    return {
      title: "What is the room using?",
      open: true,
      voter_count: voterCount,
      questions: DEMO_QUESTIONS.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: question.options
          .map((label, position) => {
            const key = `${question.id}:${position}`
            const bump = Math.random() < 1 / (position + 1.5) ? 1 + Math.floor(Math.random() * 2) : 0
            votes.set(key, (votes.get(key) ?? 0) + bump)
            return { id: key, label, votes: votes.get(key) }
          })
          .sort((first, second) => second.votes - first.votes),
      })),
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

function buildQuestionPanel() {
  const panel = styled("div", `display:flex;flex-direction:column;gap:20px;background:${COLORS.navy};color:${COLORS.cloud};border:6px solid ${COLORS.gold};box-shadow:8px 8px 0 ${COLORS.ink};padding:28px;min-width:0`)
  const prompt = styled("h3", "font-size:38px;font-weight:700;line-height:1.15")
  const bars = styled("div", "display:flex;flex-direction:column;gap:14px")
  panel.append(prompt, bars)
  return { panel, prompt, bars, optionRows: new Map() }
}

function buildOptionRow() {
  const row = styled("div", "display:flex;flex-direction:column;gap:6px")
  const labelLine = styled("div", "display:flex;justify-content:space-between;align-items:baseline;gap:16px")
  const label = styled("p", "font-size:28px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")
  const count = styled("p", `font-family:${DISPLAY_FONT};font-size:22px;color:${COLORS.gold}`)
  const track = styled("div", `height:22px;background:${COLORS.track};border:3px solid ${COLORS.ink}`)
  const fill = styled("div", `height:100%;width:0%;background:${COLORS.gold};transition:width 700ms steps(14, end)`)
  labelLine.append(label, count)
  track.append(fill)
  row.append(labelLine, track)
  return { row, label, count, fill }
}

function renderResultsRegion(region, questions) {
  region.pollPanels ??= new Map()
  if (!region.pollInitialized) {
    region.replaceChildren()
    region.pollInitialized = true
  }

  const seenQuestionIds = new Set()
  for (const question of questions) {
    seenQuestionIds.add(question.id)
    let questionPanel = region.pollPanels.get(question.id)
    if (!questionPanel) {
      questionPanel = buildQuestionPanel()
      region.pollPanels.set(question.id, questionPanel)
    }
    region.append(questionPanel.panel)
    questionPanel.prompt.textContent = question.prompt

    const topOptions = [...question.options].sort((first, second) => second.votes - first.votes).slice(0, TOP_OPTIONS_PER_QUESTION)
    const topVotes = Math.max(1, ...topOptions.map((option) => option.votes))
    const shownOptionIds = new Set()
    topOptions.forEach((option, rank) => {
      shownOptionIds.add(option.id)
      let optionRow = questionPanel.optionRows.get(option.id)
      if (!optionRow) {
        optionRow = buildOptionRow()
        questionPanel.optionRows.set(option.id, optionRow)
      }
      questionPanel.bars.append(optionRow.row)
      optionRow.label.textContent = option.label
      optionRow.count.textContent = option.votes
      optionRow.fill.style.width = `${(option.votes / topVotes) * 100}%`
      optionRow.fill.style.background = rank === 0 && option.votes > 0 ? COLORS.ruby : COLORS.gold
      optionRow.row.style.opacity = option.votes > 0 ? "1" : "0.55"
    })
    for (const [optionId, optionRow] of questionPanel.optionRows) {
      if (!shownOptionIds.has(optionId)) optionRow.row.remove()
    }
  }
  for (const [questionId, questionPanel] of region.pollPanels) {
    if (!seenQuestionIds.has(questionId)) questionPanel.panel.remove()
  }
}

function buildWideOptionRow() {
  const row = styled("div", "display:grid;grid-template-columns:480px 1fr 140px;align-items:center;gap:28px")
  const label = styled("p", "font-size:38px;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")
  const track = styled("div", `height:36px;background:${COLORS.track};border:4px solid ${COLORS.ink}`)
  const fill = styled("div", `height:100%;width:0%;background:${COLORS.gold};transition:width 700ms steps(14, end)`)
  const count = styled("p", `font-family:${DISPLAY_FONT};font-size:30px;color:${COLORS.gold};text-align:right`)
  track.append(fill)
  row.append(label, track, count)
  return { row, label, count, fill }
}

function renderSingleQuestionRegion(region, question) {
  region.pollOptionRows ??= new Map()
  if (!region.pollInitialized) {
    region.replaceChildren()
    region.pollInitialized = true
  }
  if (!question) return

  const topOptions = [...question.options].sort((first, second) => second.votes - first.votes).slice(0, WIDE_OPTIONS_PER_QUESTION)
  const topVotes = Math.max(1, ...topOptions.map((option) => option.votes))
  const shownOptionIds = new Set()
  topOptions.forEach((option, rank) => {
    shownOptionIds.add(option.id)
    let optionRow = region.pollOptionRows.get(option.id)
    if (!optionRow) {
      optionRow = buildWideOptionRow()
      region.pollOptionRows.set(option.id, optionRow)
    }
    region.append(optionRow.row)
    optionRow.label.textContent = option.label
    optionRow.count.textContent = option.votes
    optionRow.fill.style.width = `${(option.votes / topVotes) * 100}%`
    optionRow.fill.style.background = rank === 0 && option.votes > 0 ? COLORS.ruby : COLORS.gold
    optionRow.row.style.opacity = option.votes > 0 ? "1" : "0.55"
  })
  for (const [optionId, optionRow] of region.pollOptionRows) {
    if (!shownOptionIds.has(optionId)) optionRow.row.remove()
  }
}

function questionForElement(element, questions) {
  const questionNumber = Number(element.dataset.pollQuestion)
  return questionNumber ? questions[questionNumber - 1] : undefined
}

function render(stage, results) {
  const voterText = `${results.voter_count} ${results.voter_count === 1 ? "PLAYER HAS" : "PLAYERS HAVE"} VOTED`
  stage.querySelectorAll('[data-poll="voters"]').forEach((element) => { element.textContent = voterText })
  stage.querySelectorAll('[data-poll="prompt"]').forEach((element) => {
    const question = questionForElement(element, results.questions)
    if (question) element.textContent = question.prompt.toUpperCase()
  })
  stage.querySelectorAll('[data-poll="results"]').forEach((region) => {
    if (region.dataset.pollQuestion) renderSingleQuestionRegion(region, questionForElement(region, results.questions))
    else renderResultsRegion(region, results.questions)
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
    if (cached) render(stage, cached)
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
