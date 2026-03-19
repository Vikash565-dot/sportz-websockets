import { WebSocket, WebSocketServer } from 'ws';
import {wsArcjet} from "../arcjet.js";

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return ;
  socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(JSON.stringify(payload));
  }
}



export function attachWebSocketServer(server) {
    const wss = new WebSocketServer({
        server,
        path: '/ws',
        maxPayload: 1024 * 1024, // 1MB
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
        sendJson(socket, { type: 'welcome' });

        socket.on('error', console.error);
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if(ws.isAlive === false) return ws.terminate();

            ws.isAlive = false;
            ws.ping();

        })
    }, 30000);
    wss.on('close', () => clearinterval(interval));

    function broadcastMatchCreated(match) {
        broadcast(wss, { type: 'match_created', data: match });
    }

    return { broadcastMatchCreated };
}