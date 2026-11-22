import { WebSocket, WebSocketServer } from 'ws';
import {wsArcjet} from "../arcjet.js";
import { connectRedisPubSub, publishWsEvent } from "../redis.js";

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return ;
  socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(JSON.stringify(payload));
  }
}

export function createMatchSubscriptionRegistry() {
  const matchSubscribers = new Map();

  return {
    subscribe(matchId, socket) {
      if (!matchSubscribers.has(matchId)) matchSubscribers.set(matchId, new Set());
      matchSubscribers.get(matchId).add(socket);
    },
    unsubscribe(matchId, socket) {
      const subscribers = matchSubscribers.get(matchId);
      if (!subscribers) return;
      subscribers.delete(socket);
      if (subscribers.size === 0) matchSubscribers.delete(matchId);
    },
    cleanup(socket) {
      for (const matchId of socket.subscriptions) this.unsubscribe(matchId, socket);
    },
    broadcast(matchId, payload) {
      const subscribers = matchSubscribers.get(matchId);
      if (!subscribers || subscribers.size === 0) return;
      const message = JSON.stringify(payload);
      for (const client of subscribers) {
        if (client.readyState === WebSocket.OPEN) client.send(message);
      }
    },
  };
}

function handleMessage(registry, socket, data){
    let message;

    try{
        message = JSON.parse(data.toString())
    } catch {
        sendJson(socket, { type: 'error', message: 'Invalid JSON' });
            return;
    }
    if(message?.type === "subscribe" && Number.isInteger(message.matchId)){
      registry.subscribe(message.matchId, socket);
        socket.subscriptions.add(message.matchId);
        sendJson(socket, { type: 'subscribed', matchId: message.matchId });
        return ;
    }

    if(message?.type === "unsubscribe" && Number.isInteger(message.matchId)){
        registry.unsubscribe(message.matchId, socket);
        socket.subscriptions.delete(message.matchId);
        sendJson(socket, { type: 'unsubscribed', matchId: message.matchId });
    }
}

export function attachWebSocketServer(server) {
    const subscriptions = createMatchSubscriptionRegistry();
    const wss = new WebSocketServer({
        server,
        path: '/ws',
        maxPayload: 1024 * 1024, // 1MB
    });

        void connectRedisPubSub((rawEvent) => {
            try {
                const event = JSON.parse(rawEvent);

                if (event?.type === "match_created") {
                    broadcastToAll(wss, event);
                    return;
                }

                if (event?.type === "commentary" && Number.isInteger(event.matchId)) {
                    subscriptions.broadcast(event.matchId, event);
                    return;
                }

                if (event?.type === "match_updated" && Number.isInteger(event?.data?.id)) {
                    subscriptions.broadcast(event.data.id, event);
                }
            } catch (error) {
                console.error("Failed to process websocket pub/sub event:", error.message);
            }
        });

    wss.on('connection',async (socket, req) => {

        if(wsArcjet){
            try{
                const decison = await wsArcjet.protect(req);

                if(decison.isDenied()){
                    if (decison.reason.isRateLimit()) {
                        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
                    }
                    else {
                        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    }
                    socket.destroy();
                    return ;
                }

            } catch(e){
                console.error('ws connection error', e);
                socket.close(1011 , 'Server security error');
                return ;
            }
        }

        socket.isAlive= true;
        socket.on('pong', ()=> {socket.isAlive = true});

        socket.subscriptions = new Set();

        sendJson(socket, { type: 'welcome' });

        socket.on('message', (data) => handleMessage(subscriptions, socket, data));

        socket.on('error', ()=> {
            socket.terminate();
        })

        socket.on('close', () => {
            subscriptions.cleanup(socket);
        })

        socket.on('error', console.error);
    });

    wss.on('error', (error) => {
        console.error('WebSocket server error:', error.message);
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if(ws.isAlive === false) return ws.terminate();

            ws.isAlive = false;
            ws.ping();

        })
    }, 30000);
    wss.on('close', () => clearInterval(interval));

    async function broadcastMatchCreated(match) {
        const payload = { type: 'match_created', data: match };

        if (!(await publishWsEvent(payload))) {
            broadcastToAll(wss, payload);
        }
    }

    async function broadcastMatchUpdated(match) {
        const payload = { type: 'match_updated', data: match };

        if (!(await publishWsEvent(payload))) {
            subscriptions.broadcast(match.id, payload);
        }
    }

    async function broadcastCommentary(matchId, commentary) {
        const payload = { type: 'commentary', matchId, data: commentary };

        if (!(await publishWsEvent(payload))) {
            subscriptions.broadcast(matchId, payload);
        }
    }

    return {
      broadcastMatchCreated,
      broadcastMatchUpdated,
      broadcastCommentary,
      closeWebSocketServer: () => new Promise((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(resolve);
      }),
    };
}
