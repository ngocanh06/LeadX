/**
 * cryptoUtil.js - Tiện Ích Mã Hóa Mật Khẩu SMTP & Khóa Bảo Mật Chuẩn AES-256-GCM
 * Tuân thủ Section 5 Master Prompt Auto Email:
 * - Bảo mật mật khẩu ứng dụng Gmail (App Password) và SMTP credentials.
 * - Tuyệt đối không lưu plaintext mật khẩu vào file JSON.
 * - Hỗ trợ Key derivation, IV ngẫu nhiên 12-byte và Auth Tag 16-byte cho mỗi lần mã hóa.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

class CryptoUtil {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.secretKey = this._resolveMasterKey();
  }

  _resolveMasterKey() {
    if (process.env.LEADX_ENCRYPTION_KEY && process.env.LEADX_ENCRYPTION_KEY.length >= 32) {
      return crypto.createHash('sha256').update(process.env.LEADX_ENCRYPTION_KEY).digest();
    }

    const secretFile = path.resolve(this.rootDir, 'data/.crypto_secret');
    try {
      if (fs.existsSync(secretFile)) {
        const raw = fs.readFileSync(secretFile, 'utf8').trim();
        if (raw.length >= 32) {
          return crypto.createHash('sha256').update(raw).digest();
        }
      }
      // Sinh khóa ngẫu nhiên lần đầu tiên
      const randomSecret = crypto.randomBytes(32).toString('hex');
      const dir = path.dirname(secretFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(secretFile, randomSecret, 'utf8');
      return crypto.createHash('sha256').update(randomSecret).digest();
    } catch (err) {
      logger.error(`[CRYPTO] Lỗi khởi tạo master key: ${err.message}`);
      return crypto.createHash('sha256').update('LeadX_Default_Secure_Master_Key_2026!').digest();
    }
  }

  /**
   * Mã hóa văn bản với AES-256-GCM
   * @param {string} text - Mật khẩu hoặc token cần mã hóa
   * @returns {string} - Chuỗi định dạng iv:authTag:encrypted (base64)
   */
  encrypt(text) {
    if (!text || typeof text !== 'string') return '';
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.secretKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (err) {
      logger.error(`[CRYPTO] Lỗi mã hóa: ${err.message}`);
      throw new Error('Lỗi mã hóa dữ liệu bảo mật');
    }
  }

  /**
   * Giải mã văn bản mã hóa với AES-256-GCM
   * @param {string} encryptedPayload - Chuỗi iv:authTag:encrypted
   * @returns {string} - Văn bản gốc đã giải mã
   */
  decrypt(encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') return '';
    if (!encryptedPayload.includes(':')) {
      // Trường hợp dữ liệu cũ chưa mã hóa
      return encryptedPayload;
    }

    try {
      const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
      if (!ivHex || !authTagHex || !encryptedHex) return encryptedPayload;

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, this.secretKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      logger.error(`[CRYPTO] Lỗi giải mã: ${err.message}`);
      return '';
    }
  }
}

module.exports = new CryptoUtil();
