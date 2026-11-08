// A minimal Action Cable client: one WebSocket, one channel subscription.
// Speaks the actioncable-v1-json protocol, so no @rails/actioncable bundle is needed.

const PROTOCOLS = ["actioncable-v1-json", "actioncable-unsupported"]
const STALE_AFTER_MS = 10_000 // the server pings every 3 seconds
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000]

export function subscribeToPoll({ url, identifier, onResults, onStatus }) {
  const identifierJson = JSON.stringify(identifier)
  let socket = null
  let retries = 0
  let lastMessageAt = 0
  let stopped = false
  let retryTimer = null

  function connect() {
    if (stopped) return
    onStatus({ state: "connecting" })
    socket = new WebSocket(url, PROTOCOLS)
    lastMessageAt = Date.now()

    socket.addEventListener("message", (event) => {
      lastMessageAt = Date.now()
      const message = JSON.parse(event.data)
      if (message.type === "welcome") {
        socket.send(JSON.stringify({ command: "subscribe", identifier: identifierJson }))
      } else if (message.type === "confirm_subscription") {
        retries = 0
        onStatus({ state: "live" })
      } else if (message.type === "reject_subscription") {
        onStatus({ state: "rejected" })
        stop()
      } else if (message.type === "disconnect") {
        onStatus({ state: "offline", reason: message.reason ?? "server closed the connection" })
      } else if (message.message !== undefined && message.identifier === identifierJson) {
        onResults(message.message)
      }
    })

    socket.addEventListener("close", () => {
      if (stopped) return
      onStatus({ state: "offline", reason: "connection lost" })
      scheduleReconnect()
    })
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer)
    const delay = RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)]
    retries += 1
    retryTimer = setTimeout(connect, delay)
  }

  // A socket can die without a close event (sleeping laptop, Wi-Fi swap). Missing pings give it away.
  const staleCheck = setInterval(() => {
    if (!stopped && socket?.readyState === WebSocket.OPEN && Date.now() - lastMessageAt > STALE_AFTER_MS) socket.close()
  }, 2000)

  function stop() {
    stopped = true
    clearTimeout(retryTimer)
    clearInterval(staleCheck)
    socket?.close()
  }

  connect()
  return { stop }
}
