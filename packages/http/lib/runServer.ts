import { AnyServer } from './runServer';
import * as http from 'http';
import * as https from 'https';
import * as http2 from 'http2';
import { Socket } from 'net';

export type AnyServer =
  | http.Server
  | https.Server
  | http2.Http2Server
  | http2.Http2SecureServer;

export interface CustomSocket extends Socket {
  id: number;
  requesting: number;
}

export type AnyRequest = (http.IncomingMessage | http2.Http2ServerRequest) & {
  socket: CustomSocket;
};
export type AnyResponse = http.ServerResponse | http2.Http2ServerResponse;

export type ServerHandler = (req: AnyRequest, res: AnyResponse) => void;

type ServerGenerator = (callback: ServerHandler) => AnyServer;

const ServerGenerator = {
  http: http.createServer as ServerGenerator,
  http2nossl: http2.createServer as ServerGenerator,
};

const ServerUrlProtocol = {
  http: 'http://',
  https: 'https://',
  http2nossl: 'http://',
  http2: 'https://',
};

export type ServerMode = keyof typeof ServerGenerator;

export interface ServerExecOption {
  mode?: ServerMode;
  host?: string;
  port?: number;
  gracefulExit?: boolean;
}

export default async function runServer(
  callback: ServerHandler,
  { mode = 'http', host, port, gracefulExit }: ServerExecOption,
) {
  if (!port) {
    console.warn(
      'Warning: port was not specficed, developer may define a default port for better usage.',
    );
  }
  const server = ServerGenerator[mode](callback);
  let isShuttingdown = false;

  const connections: CustomSocket[] = [];

  // Record every active socket.
  server.on('connection', (socket: CustomSocket) => {
    socket.id = connections.length;
    connections.push(socket);

    socket.on('close', function() {
      if (socket.id === connections.length - 1) {
        connections.pop();
      } else {
        const tmp = connections.pop() as CustomSocket;
        tmp.id = socket.id;
        connections[socket.id] = tmp;
      }
    });
  });

  if (gracefulExit) {
    // Record request count for connection;
    server.on('connection', (socket: CustomSocket) => {
      socket.requesting = 0;
    });

    server.on('request', (req: AnyRequest, res: AnyResponse) => {
      req.socket.requesting++;
      res.on('finish', function() {
        req.socket.requesting--;
        // No pending request and system is shutting down.
        if (req.socket.requesting <= 0 && isShuttingdown) {
          req.socket.destroy();
        }
      });
    });
  }

  // Shutdown and destroy sockets if possible.
  function shutdown() {
    server.close();
    if (gracefulExit) {
      isShuttingdown = true;
      for (const connection of connections.slice(0)) {
        if (connection.requesting <= 0) {
          connection.destroy();
        }
      }
    } else {
      for (const connection of connections.slice(0)) {
        connection.destroy();
      }
    }
  }

  function waitForStop() {
    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.on('close', resolve);
    });
  }

  server.listen(port, host);
  let address = server.address();
  if (address && typeof address !== 'string') {
    address = `${address.address}:${address.port}`;
  }
  if (!address && port && host) {
    address = `${host}:${port}`;
  }
  address = address || 'Unknown address';
  console.log(`Server listening at ${ServerUrlProtocol[mode]}${address}/`);

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
  await waitForStop();

  process.removeListener('SIGINT', shutdown);
  process.removeListener('SIGTERM', shutdown);
  process.removeListener('SIGHUP', shutdown);
  console.log('Bye.');
}
