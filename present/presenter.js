import { renderIcons } from "./icons.js"
import { startPoll } from "./poll.js"

const SLIDE_WIDTH = 1920
const SLIDE_HEIGHT = 1080
const params = new URLSearchParams(location.search)
const isNotesWindow = params.get("view") === "notes"
const channel = new BroadcastChannel("big-teams-deck")

const stage = document.getElementById("stage")
let slides = []
let currentIndex = 0
let poll

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return response.text()
}

async function loadDeck() {
  const deck = JSON.parse(await fetchText("../deck/project/deck.json"))
  document.title = deck.title

  for (const face of Object.values(deck.faces ?? {})) {
    if (!face.href) continue
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = face.href
    document.head.append(link)
  }

  const slideMarkup = await Promise.all(deck.order.map((slideId) => fetchText(`../deck/project/slides/${slideId}.html`)))
  stage.innerHTML = slideMarkup.join("\n")
  renderIcons(stage)
  slides = [...stage.querySelectorAll(":scope > section")]
  slides.forEach(layerLikeTheSlideFormat)
  stage.append(buildPollBadge())
}

// A small QR in the corner of the poll result slides, so people who walk in late can still join.
// Only slides marked data-show-poll-badge show it.
function buildPollBadge() {
  const badge = document.createElement("div")
  badge.id = "poll-badge"
  badge.innerHTML = `<span>JOIN THE POLL<br><b>POLLS.GAMESTATS.AI/SFRUBY</b></span><img src="../deck/project/assets/poll-qr.svg" alt="QR code for polls.gamestats.ai/sfruby">`
  return badge
}

function layerLikeTheSlideFormat(slide) {
  let passedFirstFlowChild = false
  for (const child of slide.children) {
    if (child.tagName === "ASIDE") continue
    if (child.style.position === "absolute") {
      child.style.zIndex = passedFirstFlowChild ? "2" : "0"
    } else {
      passedFirstFlowChild = true
      child.style.position ||= "relative"
      child.style.zIndex = "1"
    }
  }
}

function slideIndexFromHash() {
  const match = location.hash.match(/slide-(\d+)/)
  return match ? Number(match[1]) - 1 : 0
}

function goTo(index, { broadcast = true } = {}) {
  currentIndex = Math.max(0, Math.min(slides.length - 1, index))
  slides.forEach((slide, slideIndex) => slide.classList.toggle("is-current", slideIndex === currentIndex))
  document.getElementById("poll-badge")?.toggleAttribute("hidden", !slides[currentIndex]?.hasAttribute("data-show-poll-badge"))
  history.replaceState(null, "", `${location.search}#slide-${currentIndex + 1}`)
  if (broadcast) channel.postMessage({ type: "go", index: currentIndex })
  if (isNotesWindow) renderNotes()
  else poll?.setLiveQuestion(liveQuestionFor(slides[currentIndex]))
}

// The question phones should show while this slide is up: data-poll-live on the slide,
// else the question its results show, else none.
function liveQuestionFor(slide) {
  const value = slide?.dataset.pollLive ?? slide?.querySelector("[data-poll-question]")?.dataset.pollQuestion
  return value ? Number(value) : null
}

function fitStage() {
  const scale = Math.min(window.innerWidth / SLIDE_WIDTH, window.innerHeight / SLIDE_HEIGHT)
  stage.style.transform = `scale(${scale})`
}

function slideTitle(slide) {
  return slide?.querySelector("h1, h2")?.textContent.trim() ?? ""
}

function renderNotes() {
  const slide = slides[currentIndex]
  document.getElementById("notes-position").textContent = `Slide ${currentIndex + 1} of ${slides.length}: ${slideTitle(slide)}`
  document.getElementById("notes-current").textContent = slide?.querySelector("aside")?.textContent.trim() || "No notes for this slide."
  const nextSlide = slides[currentIndex + 1]
  document.getElementById("notes-next").textContent = nextSlide ? `Next: ${slideTitle(nextSlide)}` : "Last slide."
}

function startNotesClock() {
  let startedAt = Date.now()
  const pad = (number) => String(number).padStart(2, "0")
  const tick = () => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
    document.getElementById("notes-clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    document.getElementById("notes-timer").textContent = `Elapsed ${Math.floor(elapsedSeconds / 60)}:${pad(elapsedSeconds % 60)}`
  }
  tick()
  setInterval(tick, 1000)
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r") { startedAt = Date.now(); tick() }
  })
}

function handleKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(key)) goTo(currentIndex + 1)
  else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(key)) goTo(currentIndex - 1)
  else if (key === "Home") goTo(0)
  else if (key === "End") goTo(slides.length - 1)
  else if (key.toLowerCase() === "f" && !isNotesWindow) document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
  else if (key.toLowerCase() === "n" && !isNotesWindow) window.open(`?view=notes${location.hash}`, "big-teams-notes", "width=1000,height=760")
  else if (key.toLowerCase() === "d") { channel.postMessage({ type: "toggle-demo" }); poll?.toggleDemo() }
  else return
  event.preventDefault()
}

channel.onmessage = ({ data }) => {
  if (data.type === "go") goTo(data.index, { broadcast: false })
  if (data.type === "hello" && !isNotesWindow) channel.postMessage({ type: "go", index: currentIndex })
  if (data.type === "toggle-demo") poll?.toggleDemo()
}

async function start() {
  await loadDeck()
  document.addEventListener("keydown", handleKey)

  if (isNotesWindow) {
    document.body.classList.add("notes-mode")
    document.getElementById("notes-view").hidden = false
    startNotesClock()
    goTo(slideIndexFromHash(), { broadcast: false })
    channel.postMessage({ type: "hello" })
    return
  }

  fitStage()
  window.addEventListener("resize", fitStage)
  stage.addEventListener("click", () => goTo(currentIndex + 1))
  goTo(slideIndexFromHash(), { broadcast: false })
  poll = await startPoll({ stage, statusElement: document.getElementById("poll-status"), params })
  poll?.setLiveQuestion(liveQuestionFor(slides[currentIndex]))
}

start().catch((error) => {
  document.body.innerHTML = `<pre style="color:#fbfbf8;padding:24px;font:16px monospace">Could not load the deck: ${error.message}\nRun bin/present from the repo root.</pre>`
})
