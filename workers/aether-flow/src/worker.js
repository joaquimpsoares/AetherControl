const HEARTBEAT_INTERVAL_MS = 5000;

function logHeartbeat() {
  console.log(
    JSON.stringify({
      service: "aether-flow",
      status: "heartbeat",
      timestamp: new Date().toISOString()
    })
  );
}

logHeartbeat();
setInterval(logHeartbeat, HEARTBEAT_INTERVAL_MS);

