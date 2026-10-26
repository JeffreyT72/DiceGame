export function connectMultiplayer({ onMessage, onOpen, onClose, onError }) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws/multiplayer`);
  socket.addEventListener('open', onOpen);
  socket.addEventListener('close', onClose);
  socket.addEventListener('error', onError);
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      onError(error);
      return;
    }
    onMessage(message);
  });
  return {
    isReady() {
      return socket.readyState === WebSocket.OPEN;
    },
    send(message) {
      if (!this.isReady()) {
        throw new Error('Multiplayer connection is not ready.');
      }
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    },
  };
}
