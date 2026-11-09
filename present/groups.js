// The group map slide: six tables, each with a topic the presenter types in during
// the session. Topics are saved in this browser and synced to other open deck windows.

const STORAGE_KEY = "big-teams-group-topics"
const CHAIRS_PER_TABLE = 8

function loadTopics() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") } catch { return {} }
}

function saveTopics(topics) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(topics)) } catch {}
}

const CHAIR_RING = { x: 236, y: 160 } // half-widths of the oval the chairs sit on
const LARGEST_TOPIC = 44
const SMALLEST_TOPIC = 24

// Small pixel chairs around each table, so the ovals read as groups of chairs.
function addChairs(table) {
  for (let index = 0; index < CHAIRS_PER_TABLE; index++) {
    const angle = (2 * Math.PI * index) / CHAIRS_PER_TABLE + Math.PI / CHAIRS_PER_TABLE
    const chair = document.createElement("span")
    chair.className = "group-chair"
    chair.style.transform = `translate(${Math.cos(angle) * CHAIR_RING.x}px, ${Math.sin(angle) * CHAIR_RING.y}px)`
    table.prepend(chair)
  }
}

// Shrinks a long topic until it fits the table without breaking words.
function fit(field) {
  let size = LARGEST_TOPIC
  field.style.fontSize = `${size}px`
  while (size > SMALLEST_TOPIC && (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1)) {
    size -= 2
    field.style.fontSize = `${size}px`
  }
}

export function setUpGroupTopics({ stage, channel }) {
  const fields = [...stage.querySelectorAll("[data-group-topic]")]
  if (fields.length === 0) return

  stage.querySelectorAll("[data-group-table]").forEach(addChairs)

  const topics = loadTopics()
  const show = () => {
    for (const field of fields) {
      if (document.activeElement !== field) field.textContent = topics[field.dataset.groupTopic] ?? ""
      fit(field)
    }
  }
  show()
  // Hidden slides measure as zero, so fit again once the slide shows and the font loads.
  const refit = () => fields.forEach(fit)
  new ResizeObserver(refit).observe(stage.querySelector("[data-group-map]"))
  document.fonts?.ready.then(refit)
  document.fonts?.addEventListener("loadingdone", refit)

  for (const field of fields) {
    field.contentEditable = "plaintext-only"
    field.spellcheck = false
    // Clicking the slide normally advances it; clicking a topic should only edit it.
    field.addEventListener("click", (event) => event.stopPropagation())
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault()
        field.blur()
      }
    })
    field.addEventListener("input", () => {
      fit(field)
      topics[field.dataset.groupTopic] = field.textContent.trim()
      saveTopics(topics)
      channel.postMessage({ type: "group-topics", topics })
    })
    field.addEventListener("blur", () => {
      field.textContent = field.textContent.trim()
      window.getSelection()?.removeAllRanges()
    })
  }

  channel.addEventListener("message", ({ data }) => {
    if (data.type !== "group-topics") return
    Object.assign(topics, data.topics)
    saveTopics(topics)
    show()
  })
}
