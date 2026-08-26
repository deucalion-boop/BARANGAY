// utils/realtime.js
// Simple Server-Sent Events (SSE) broadcaster for resident status updates

const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload });
  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      // On error, drop client
      clients.delete(res);
    }
  }
}

module.exports = {
  addClient,
  removeClient,
  broadcast
};
