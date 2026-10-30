/**
 * proxyUtils.js - Tiện ích Xử lý, Phân tích & Kiểm tra Proxy cho LeadX
 * Hỗ trợ các định dạng:
 * - host:port
 * - host:port:username:password
 * - username:password@host:port
 * - http://... | https://... | socks5://...
 */
const axios = require('axios');

/**
 * Phân tích chuỗi proxy đầu vào thành object chuẩn
 */
function parseProxy(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str || str.toLowerCase() === 'none' || str.toLowerCase() === 'direct') return null;

  let protocol = 'http';
  let cleanStr = str;

  if (cleanStr.startsWith('http://')) {
    protocol = 'http';
    cleanStr = cleanStr.slice(7);
  } else if (cleanStr.startsWith('https://')) {
    protocol = 'https';
    cleanStr = cleanStr.slice(8);
  } else if (cleanStr.startsWith('socks5://')) {
    protocol = 'socks5';
    cleanStr = cleanStr.slice(9);
  } else if (cleanStr.startsWith('socks4://')) {
    protocol = 'socks4';
    cleanStr = cleanStr.slice(9);
  }

  // Loại bỏ slash cuối nếu có
  if (cleanStr.endsWith('/')) {
    cleanStr = cleanStr.slice(0, -1);
  }

  // Định dạng: user:pass@host:port
  if (cleanStr.includes('@')) {
    const atIndex = cleanStr.lastIndexOf('@');
    const authPart = cleanStr.substring(0, atIndex);
    const hostPart = cleanStr.substring(atIndex + 1);

    const firstColonAuth = authPart.indexOf(':');
    const username = firstColonAuth !== -1 ? authPart.substring(0, firstColonAuth) : authPart;
    const password = firstColonAuth !== -1 ? authPart.substring(firstColonAuth + 1) : '';

    const firstColonHost = hostPart.indexOf(':');
    const host = firstColonHost !== -1 ? hostPart.substring(0, firstColonHost) : hostPart;
    const port = firstColonHost !== -1 ? parseInt(hostPart.substring(firstColonHost + 1), 10) : 80;

    return { protocol, host, port, username, password, raw: str };
  }

  // Định dạng: host:port:user:pass (4 phần)
  const parts = cleanStr.split(':');
  if (parts.length === 4) {
    return {
      protocol,
      host: parts[0].trim(),
      port: parseInt(parts[1].trim(), 10),
      username: parts[2].trim(),
      password: parts[3].trim(),
      raw: str
    };
  }

  // Định dạng: host:port (2 phần)
  if (parts.length === 2) {
    return {
      protocol,
      host: parts[0].trim(),
      port: parseInt(parts[1].trim(), 10),
      username: '',
      password: '',
      raw: str
    };
  }

  return null;
}

/**
 * Kiểm tra kết nối thực tế của Proxy qua HTTP API
 * Trả về: { success: boolean, ip?: string, latency?: number, message: string }
 */
async function testProxy(rawProxy) {
  const parsed = parseProxy(rawProxy);
  if (!parsed) {
    return {
      success: false,
      message: 'Định dạng Proxy không hợp lệ. Vui lòng nhập dạng IP:Port hoặc IP:Port:User:Pass.'
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

    if (parsed.protocol.startsWith('http')) {
      axiosConfig.proxy = {
        protocol: parsed.protocol,
        host: parsed.host,
        port: parsed.port
      };
      if (parsed.username && parsed.password) {
        axiosConfig.proxy.auth = {
          username: parsed.username,
          password: parsed.password
        };
      }
    }

    // Thử truy vấn lấy IP ngoại mạng thực tế
    const res = await axios.get('https://api.ipify.org?format=json', axiosConfig);
    const latency = Date.now() - startTime;
    const exitIp = res.data && res.data.ip ? res.data.ip : parsed.host;

    return {
      success: true,
      ip: exitIp,
      latency,
      parsed,
      message: `Kết nối Proxy thành công! IP Ngoại mạng: ${exitIp} (${latency}ms)`
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    let errMsg = err.message || 'Lỗi không xác định';
    if (err.code === 'ECONNABORTED' || errMsg.includes('timeout')) {
      errMsg = 'Hết thời gian chờ (Timeout sau 12 giây). Proxy có thể bị chậm hoặc đang chết.';
    } else if (err.code === 'ECONNREFUSED') {
      errMsg = 'Máy chủ Proxy từ chối kết nối (Connection Refused). Kiểm tra lại IP và Port.';
    } else if (err.response && err.response.status === 407) {
      errMsg = 'Sai tên đăng nhập hoặc mật khẩu Proxy (Proxy Authentication Required 407).';
    }

    return {
      success: false,
      latency,
      parsed,
      message: `Không thể kết nối Proxy: ${errMsg}`
    };
  }
}

/**
 * Định dạng chuỗi hiển thị an toàn (Ẩn mật khẩu)
 */
function formatProxyDisplay(rawProxy) {
  const parsed = parseProxy(rawProxy);
  if (!parsed) return 'IP Mạng Trực Tiếp (Không Proxy)';
  if (parsed.username) {
    return `${parsed.host}:${parsed.port} (User: ${parsed.username})`;
  }
  return `${parsed.host}:${parsed.port}`;
}

module.exports = {
  parseProxy,
  testProxy,
  formatProxyDisplay
};
