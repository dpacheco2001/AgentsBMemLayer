let socket = null;
let messageHandler = null;

export const connectWebSocket = (url, onMessage, onConnect, onDisconnect) => {
  if (socket) {
    socket.close();
  }

  socket = new WebSocket(url);
  messageHandler = onMessage;

  socket.onopen = () => {
    console.log('WebSocket connection established');
    if (onConnect) onConnect();
  };

  socket.onmessage = (event) => {
    console.log('WebSocket message received:', event.data);
    if (messageHandler) {
      messageHandler(event.data);
    }
  };

  socket.onclose = () => {
    console.log('WebSocket connection closed');
    if (onDisconnect) onDisconnect();
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
};

export const disconnectWebSocket = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
};

export const sendMessage = (message) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(message);
    return true;
  } else {
    console.error('WebSocket is not connected');
    return false;
  }
};