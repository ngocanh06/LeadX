/**
 * Proxy parsing and connectivity checks for LeadX.
 * Supported formats: host:port, host:port:user:pass, user:pass@host:port,
 * and http(s)/socks4/socks5 proxy URLs.
 */
const axios = require('axios');

const SUPPORTED_PROTOCOLS = new Set(['http', 'https', 'socks4', 'socks5']);

function parsePort(value) {
  if (!/^\d+$/.test(String(value || ''))) return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function decodeCredential(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return null;
  }
}

function normalizeHost(host) {
  if (!host) return '';
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function isValidHost(host) {
  return Boolean(host) && !/[\s/@?#]/.test(host);
}

function parseProxy(raw) {
  if (typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str || ['none', 'direct'].includes(str.toLowerCase())) return null;

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(str);
  if (hasScheme || str.includes('@')) {
    let url;
    try {
      url = new URL(hasScheme ? str : `http://${str}`);
    } catch (_) {
      return null;
    }

    const protocol = url.protocol.slice(0, -1).toLowerCase();
    const host = normalizeHost(url.hostname);
    if (!SUPPORTED_PROTOCOLS.has(protocol) || !isValidHost(host)) return null;
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash) return null;

    const defaultPort = protocol === 'https' ? 443 : (protocol.startsWith('socks') ? 1080 : 80);
    const port = parsePort(url.port || defaultPort);
    const username = decodeCredential(url.username);
    const password = decodeCredential(url.password);
    if (port === null || username === null || password === null) return null;

    return { protocol, host, port, username, password, raw: str };
  }

  // Bracketed IPv6: [2001:db8::1]:1080[:username:password]
  const ipv6 = str.match(/^\[([^\]]+)\]:(\d+)(?::([^:]*):(.*))?$/s);
  if (ipv6) {
    const port = parsePort(ipv6[2]);
    const host = ipv6[1];
    if (port === null || !isValidHost(host)) return null;
    return {
      protocol: 'http',
      host,
      port,
      username: ipv6[3] || '',
      password: ipv6[4] || '',
      raw: str
    };
  }

  // host:port[:username:password], allowing colons inside the password.
  const basic = str.match(/^([^:]+):(\d+)(?::([^:]*):(.*))?$/s);
  if (!basic) return null;

  const port = parsePort(basic[2]);
  const host = basic[1].trim();
  if (port === null || !isValidHost(host)) return null;

  return {
    protocol: 'http',
    host,
    port,
    username: (basic[3] || '').trim(),
    password: basic[4] || '',
    raw: str
  };
}

function formatProxyDisplay(rawProxy) {
  const parsed = parseProxy(rawProxy);
  if (!parsed) return 'IP Mạng Trực Tiếp (Không Proxy)';
  const authLabel = parsed.username ? ` (User: ${parsed.username})` : '';
  return `${parsed.host}:${parsed.port}${authLabel}`;
}

function safeProxyDetails(parsed) {
  return {
    protocol: parsed.protocol,
    host: parsed.host,
    port: parsed.port,
    ...(parsed.username ? { username: parsed.username } : {})
  };
}

function formatProxyHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function createSocksProxyAgent(parsed) {
  const { SocksProxyAgent } = require('socks-proxy-agent');
  const credentials = parsed.username || parsed.password
    ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
    : '';
  const proxyUrl = `${parsed.protocol}://${credentials}${formatProxyHost(parsed.host)}:${parsed.port}`;
  return new SocksProxyAgent(proxyUrl);
}

/**
 * Verify the proxy by requesting an external IP endpoint through that proxy.
 * Returns { success, ip?, latency?, parsed?, message }.
 */
async function testProxy(rawProxy) {
  const parsed = parseProxy(rawProxy);
  if (!parsed) {
    return {
      success: false,
      message: 'Định dạng Proxy không hợp lệ. Vui lòng nhập IP:Port, IP:Port:User:Pass hoặc URL Proxy hợp lệ.'
    };
  }

  const startTime = Date.now();
  try {
    const axiosConfig = {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    if (parsed.protocol.startsWith('socks')) {
      const agent = createSocksProxyAgent(parsed);
      axiosConfig.proxy = false;
      axiosConfig.httpAgent = agent;
      axiosConfig.httpsAgent = agent;
    } else {
      axiosConfig.proxy = {
        protocol: `${parsed.protocol}:`,
        host: parsed.host,
        port: parsed.port
      };
      if (parsed.username || parsed.password) {
        axiosConfig.proxy.auth = {
          username: parsed.username,
          password: parsed.password
        };
      }
    }

    const res = await axios.get('https://api.ipify.org?format=json', axiosConfig);
    const latency = Date.now() - startTime;
    const exitIp = res.data && res.data.ip;
    if (!exitIp) throw new Error('API kiểm tra không trả về địa chỉ IP.');

    return {
      success: true,
      ip: exitIp,
      latency,
      parsed: safeProxyDetails(parsed),
      message: `Kết nối Proxy thành công! IP Ngoại mạng: ${exitIp} (${latency}ms)`
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    let errMsg = err.message || 'Lỗi không xác định';
    if (err.code === 'ECONNABORTED' || /timeout/i.test(errMsg)) {
      errMsg = 'Hết thời gian chờ (Timeout sau 12 giây). Proxy có thể bị chậm hoặc không hoạt động.';
    } else if (err.code === 'ECONNREFUSED') {
      errMsg = 'Máy chủ Proxy từ chối kết nối (Connection Refused). Kiểm tra lại IP và Port.';
    } else if (err.response && err.response.status === 407) {
      errMsg = 'Sai tên đăng nhập hoặc mật khẩu Proxy (Proxy Authentication Required 407).';
    }

    return {
      success: false,
      latency,
      parsed: safeProxyDetails(parsed),
      message: `Không thể kết nối Proxy: ${errMsg}`
    };
  }
}

module.exports = {
  parseProxy,
  testProxy,
  formatProxyDisplay
};
