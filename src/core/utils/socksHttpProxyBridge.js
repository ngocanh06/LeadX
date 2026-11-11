const crypto = require('crypto');
const http = require('http');
const { SocksClient } = require('socks');
const { SocksProxyAgent } = require('socks-proxy-agent');

function parseConnectTarget(authority) {
  const ipv6 = String(authority || '').match(/^\[([^\]]+)\]:(\d+)$/);
  const standard = String(authority || '').match(/^([^:]+):(\d+)$/);
  const match = ipv6 || standard;
  if (!match) return null;

  const host = match[1];
  const port = Number(match[2]);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function matchesBasicAuth(header, auth) {
  if (typeof header !== 'string') return false;
  const basicAuth = header.match(/^Basic\s+(.+)$/i);
  if (!basicAuth) return false;

  let supplied;
  try {
    supplied = Buffer.from(basicAuth[1].trim(), 'base64');
  } catch (_) {
    return false;
  }

  const expected = Buffer.from(`${auth.username}:${auth.password}`);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function createSocksHttpProxyBridge(proxy, onProxyError = () => {}) {
  if (!proxy || !String(proxy.protocol).startsWith('socks')) {
    throw new Error('The SOCKS bridge requires a SOCKS proxy configuration.');
  }
  if (proxy.protocol === 'socks4' && proxy.password) {
    throw new Error('SOCKS4 does not support password authentication. Use SOCKS5 or an HTTP/HTTPS proxy.');
  }

  const auth = {
    username: crypto.randomBytes(18).toString('hex'),
    password: crypto.randomBytes(24).toString('hex')
  };
  const credentials = proxy.username || proxy.password
    ? `${encodeURIComponent(proxy.username || '')}:${encodeURIComponent(proxy.password || '')}@`
    : '';
  const proxyHost = proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host;
  const socksAgent = new SocksProxyAgent(
    `${proxy.protocol}://${credentials}${proxyHost}:${proxy.port}`
  );
  const proxyOptions = {
    host: proxy.host,
    port: proxy.port,
    type: proxy.protocol === 'socks4' ? 4 : 5,
    ...(proxy.username || proxy.password
      ? { userId: proxy.username || '', password: proxy.password || '' }
      : {})
  };
  const sockets = new Set();
  let reportedProxyError = false;
  let closed = false;

  const reportProxyError = error => {
    if (reportedProxyError) return;
    reportedProxyError = true;
    onProxyError(error);
  };

  const server = http.createServer((request, response) => {
    if (!matchesBasicAuth(request.headers['proxy-authorization'], auth)) {
      response.writeHead(407, {
        'Proxy-Authenticate': 'Basic realm="LeadX SOCKS bridge"',
        'Connection': 'close'
      });
      response.end('Proxy authentication required');
      return;
    }

    let target;
    try {
      target = new URL(request.url, `http://${request.headers.host || ''}`);
    } catch (_) {
      response.writeHead(400);
      response.end('Invalid proxy request');
      return;
    }
    if (target.protocol !== 'http:' || !target.hostname) {
      response.writeHead(400);
      response.end('Only HTTP requests and HTTPS CONNECT tunnels are supported');
      return;
    }

    const headers = { ...request.headers, host: target.host };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    delete headers.connection;

    const upstreamRequest = http.request({
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: Number(target.port) || 80,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers,
      agent: socksAgent
    }, upstreamResponse => {
      if (upstreamResponse.statusMessage) {
        response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.statusMessage, upstreamResponse.headers);
      } else {
        response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      }
      upstreamResponse.pipe(response);
    });

    upstreamRequest.on('error', error => {
      reportProxyError(error);
      if (!response.headersSent) {
        response.writeHead(502, { 'Connection': 'close' });
        response.end('Upstream SOCKS proxy connection failed');
      } else {
        response.destroy(error);
      }
    });
    request.pipe(upstreamRequest);
  });

  server.on('connect', async (request, clientSocket, head) => {
    clientSocket.on('error', () => {});
    if (!matchesBasicAuth(request.headers['proxy-authorization'], auth)) {
      clientSocket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\n' +
        'Proxy-Authenticate: Basic realm="LeadX SOCKS bridge"\r\n' +
        'Connection: close\r\n\r\n'
      );
      return;
    }

    const target = parseConnectTarget(request.url);
    if (!target) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }

    try {
      const { socket: upstreamSocket } = await SocksClient.createConnection({
        proxy: proxyOptions,
        destination: target,
        command: 'connect',
        timeout: 15000
      });
      upstreamSocket.on('error', error => {
        reportProxyError(error);
        clientSocket.destroy();
      });
      clientSocket.on('close', () => upstreamSocket.destroy());
      if (closed || clientSocket.destroyed) {
        upstreamSocket.destroy();
        return;
      }

      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstreamSocket.write(head);
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
    } catch (error) {
      reportProxyError(error);
      if (!clientSocket.destroyed) {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      }
    }
  });

  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('error', reportProxyError);

  const ready = new Promise((resolve, reject) => {
    const onError = error => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  return ready.then(() => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the local SOCKS bridge address.');
    }

    let closePromise = null;
    return {
      proxyUrl: `http://127.0.0.1:${address.port}`,
      auth,
      close() {
        if (closePromise) return closePromise;
        closed = true;
        socksAgent.destroy();
        for (const socket of sockets) socket.destroy();
        closePromise = new Promise(resolve => {
          if (!server.listening) return resolve();
          server.close(() => resolve());
        });
        return closePromise;
      }
    };
  }).catch(error => {
    socksAgent.destroy();
    for (const socket of sockets) socket.destroy();
    if (server.listening) server.close();
    throw error;
  });
}

module.exports = { createSocksHttpProxyBridge };
