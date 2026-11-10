// A game-style TIME countdown to when the current level ends, by the wall clock.
//
//   <div data-level-timer="13:45"></div>   counts down to 1:45pm today
//
// Shows whole minutes left. The last two minutes turn red; at zero it flashes TIME UP!
// For rehearsals, ?clock=13:40 starts the deck's clock at 1:40pm and lets it run.

const HURRY_UP_SECONDS = 120

function minutesOf(text) {
  const [hours, minutes] = text.split(":").map(Number)
  return hours * 60 + minutes
}

function makeClock(params) {
  const start = params.get("clock")
  if (!start || !/^\d{1,2}:\d{2}$/.test(start)) return () => new Date()
  const fakeStart = new Date()
  fakeStart.setHours(0, minutesOf(start), 0, 0)
  const offset = fakeStart - Date.now()
  return () => new Date(Date.now() + offset)
}

function build(timer) {
  timer.innerHTML = '<span class="level-timer-label">TIME</span><span class="level-timer-digits"></span>'
  return timer.querySelector(".level-timer-digits")
}

export function setUpLevelTimers({ stage, params }) {
  const timers = [...stage.querySelectorAll("[data-level-timer]")].map((element) => ({ element, digits: build(element) }))
  if (timers.length === 0) return
  const now = makeClock(params)

  const tick = () => {
    const current = now()
    for (const { element, digits } of timers) {
      const end = new Date(current)
      end.setHours(0, minutesOf(element.dataset.levelTimer), 0, 0)
      const secondsLeft = Math.ceil((end - current) / 1000)
      const timeUp = secondsLeft <= 0
      element.classList.toggle("is-hurry", !timeUp && secondsLeft <= HURRY_UP_SECONDS)
      element.classList.toggle("is-up", timeUp)
      if (timeUp) {
        digits.textContent = "TIME UP!"
      } else {
        // Whole minutes only, rounded up (4:01 left reads 5 MIN), so it changes once a minute.
        const minutes = Math.ceil(secondsLeft / 60)
        digits.textContent = minutes > 99 ? "-- MIN" : `${minutes} MIN`
      }
    }
  }
  tick()
  setInterval(tick, 250)
}
