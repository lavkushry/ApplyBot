import type { WebSocketServer, WebSocket } from 'ws';

interface Client {
  ws: WebSocket;
  jobId?: string;
  userId?: string;
}

const clients: Map<string, Client> = new Map();

export function websocketHandler(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`WebSocket client connected: ${clientId}`);
    
    const client: Client = { ws };
    clients.set(clientId, client);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Connected to ApplyPilot real-time updates',
    }));

    // Handle messages from client
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'subscribe':
            // Subscribe to job updates
            if (data.jobId) {
              client.jobId = data.jobId;
              ws.send(JSON.stringify({
                type: 'subscribed',
                jobId: data.jobId,
              }));
            }
            break;
            
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
            
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`WebSocket client disconnected: ${clientId}`);
      clients.delete(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
    });
  });
}

/**
 * Broadcast progress update to clients subscribed to a job
 */
export function broadcastProgress(jobId: string, data: {
  step: string;
  message: string;
  data?: Record<string, unknown>;
}): void {
  const message = JSON.stringify({
    type: 'progress',
    jobId,
    ...data,
    timestamp: new Date().toISOString(),
  });

  for (const [clientId, client] of clients) {
    if (client.jobId === jobId && client.ws.readyState === 1) { // 1 = OPEN
      client.ws.send(message);
    }
  }
}

/**
 * Broadcast notification to all connected clients
 */
export function broadcastNotification(notification: {
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
}): void {
  const message = JSON.stringify({
    ...notification,
    timestamp: new Date().toISOString(),
  });

  for (const [clientId, client] of clients) {
    if (client.ws.readyState === 1) { // 1 = OPEN
      client.ws.send(message);
    }
  }
}

/**
 * Send message to specific client
 */
export function sendToClient(clientId: string, data: unknown): void {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === 1) {
    client.ws.send(JSON.stringify(data));
  }
}

/**
 * Get connected client count
 */
export function getConnectedClientCount(): number {
  return clients.size;
}
