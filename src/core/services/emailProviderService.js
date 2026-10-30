/**
 * emailProviderService.js - Quản Lý Nhà Cung Cấp Dịch Vụ Email & Kết Nối SMTP
 * Tuân thủ Section 5 Master Prompt Auto Email:
 * - Hỗ trợ Gmail App Password, Custom SMTP và API Providers.
 * - Mật khẩu SMTP được mã hóa AES-256-GCM qua cryptoUtil.
 * - Kiểm tra kết nối thực tế bằng transporter.verify() không giả lập.
 * - Kiểm soát hạn mức gửi bài hàng ngày (Daily Quota) và làm mát an toàn.
 */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');
const cryptoUtil = require('../utils/cryptoUtil');

const DEFAULT_PROVIDERS = [
  {
    id: 'prov_gmail_leadx_demo',
    name: 'Gmail Công Ty LeadX (Demo Tuyển Dụng)',
    type: 'GMAIL_APP_PASS',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: 'tuyendung.leadx@gmail.com',
    passEncrypted: cryptoUtil.encrypt('demo_app_password_2026'),
    fromName: 'LeadX Tuyển Dụng & Đào Tạo',
    fromEmail: 'tuyendung.leadx@gmail.com',
    dailyLimit: 300,
    dailySent: 0,
    lastSentAt: null,
    lastResetDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE', // 'ACTIVE' | 'PAUSED' | 'ERROR'
    lastTestedAt: null,
    lastTestResult: null,
    createdAt: new Date().toISOString()
  }
];

class EmailProviderService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/email_providers.json');
    this.providers = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.providers = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || [];
        if (!Array.isArray(this.providers) || this.providers.length === 0) {
          this.providers = DEFAULT_PROVIDERS;
          this._save();
        }
      } else {
        this.providers = DEFAULT_PROVIDERS;
        this._save();
      }
    } catch (err) {
      logger.error(`[EMAIL_PROVIDER] Lỗi nạp email_providers.json: ${err.message}`);
      this.providers = DEFAULT_PROVIDERS;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.providers, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[EMAIL_PROVIDER] Lỗi ghi email_providers.json: ${err.message}`);
    }
  }

  /**
   * Lấy danh sách Provider an toàn (ẩn pass)
   */
  getProviders() {
    this._checkAndResetDailyQuotas();
    return this.providers.map(p => {
      const { passEncrypted, ...safeData } = p;
      return {
        ...safeData,
        hasPassword: Boolean(passEncrypted)
      };
    });
  }

  getProviderById(id) {
    this._checkAndResetDailyQuotas();
    const p = this.providers.find(item => item.id === id);
    if (!p) return null;
    const { passEncrypted, ...safeData } = p;
    return {
      ...safeData,
      hasPassword: Boolean(passEncrypted)
    };
  }

  /**
   * Lấy cấu hình đầy đủ kèm mật khẩu đã giải mã cho Worker
   */
  getDecryptedTransporterConfig(id) {
    const p = this.providers.find(item => item.id === id);
    if (!p) throw new Error(`Không tìm thấy Email Provider ID ${id}`);

    const plainPassword = cryptoUtil.decrypt(p.passEncrypted);

    let transportOptions;
    if (p.type === 'GMAIL_APP_PASS') {
      transportOptions = {
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: Number(p.port) || 465,
        secure: p.secure !== false,
        auth: {
          user: p.user,
          pass: plainPassword
        }
      };
    } else {
      transportOptions = {
        host: p.host,
        port: Number(p.port) || 587,
        secure: Boolean(p.secure),
        auth: {
          user: p.user,
          pass: plainPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      };
    }

    return {
      provider: p,
      transportOptions,
      from: `"${p.fromName || 'LeadX'}" <${p.fromEmail || p.user}>`
    };
  }

  /**
   * Tạo tài khoản SMTP / Provider mới
   */
  createProvider({
    name,
    type = 'GMAIL_APP_PASS',
    host,
    port,
    secure = true,
    user,
    pass,
    fromName,
    fromEmail,
    dailyLimit = 500
  }) {
    if (!name || !name.trim()) throw new Error('Tên hộp thư không được để trống.');
    if (!user || !user.trim()) throw new Error('Email tài khoản không được để trống.');
    if (!pass || !pass.trim()) throw new Error('Mật khẩu ứng dụng / SMTP không được để trống.');

    const cleanUser = user.trim().toLowerCase();
    const cleanFromName = fromName ? fromName.trim() : 'LeadX Automation';
    const cleanFromEmail = fromEmail ? fromEmail.trim().toLowerCase() : cleanUser;

    let finalHost = host;
    let finalPort = Number(port) || 465;
    let finalSecure = secure;

    if (type === 'GMAIL_APP_PASS') {
      finalHost = 'smtp.gmail.com';
      finalPort = 465;
      finalSecure = true;
    }

    const newProvider = {
      id: `prov_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      type,
      host: finalHost,
      port: finalPort,
      secure: finalSecure,
      user: cleanUser,
      passEncrypted: cryptoUtil.encrypt(pass.trim()),
      fromName: cleanFromName,
      fromEmail: cleanFromEmail,
      dailyLimit: Number(dailyLimit) || 500,
      dailySent: 0,
      lastSentAt: null,
      lastResetDate: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
      lastTestedAt: null,
      lastTestResult: null,
      createdAt: new Date().toISOString()
    };

    this.providers.unshift(newProvider);
    this._save();

    auditLogger.log({
      actor: 'EmailProviderService',
      action: 'CREATE_EMAIL_PROVIDER',
      module: 'EMAIL_ENGINE',
      target: newProvider.name,
      status: 'SUCCESS',
      details: { providerId: newProvider.id, type, user: newProvider.user }
    });

    return this.getProviderById(newProvider.id);
  }

  /**
   * Cập nhật Provider
   */
  updateProvider(id, updateData = {}) {
    const idx = this.providers.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Không tìm thấy Email Provider ID ${id}`);

    const existing = this.providers[idx];

    let passEncrypted = existing.passEncrypted;
    if (updateData.pass && updateData.pass.trim()) {
      passEncrypted = cryptoUtil.encrypt(updateData.pass.trim());
    }

    const updated = {
      ...existing,
      ...updateData,
      passEncrypted,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };

    this.providers[idx] = updated;
    this._save();

    auditLogger.log({
      actor: 'EmailProviderService',
      action: 'UPDATE_EMAIL_PROVIDER',
      module: 'EMAIL_ENGINE',
      target: updated.name,
      status: 'SUCCESS',
      details: { providerId: id }
    });

    return this.getProviderById(id);
  }

  /**
   * Xóa Provider
   */
  deleteProvider(id) {
    const idx = this.providers.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Không tìm thấy Email Provider ID ${id}`);

    const p = this.providers[idx];
    this.providers.splice(idx, 1);
    this._save();

    auditLogger.log({
      actor: 'EmailProviderService',
      action: 'DELETE_EMAIL_PROVIDER',
      module: 'EMAIL_ENGINE',
      target: p.name,
      status: 'WARNING',
      details: { providerId: id }
    });

    return { success: true, message: `Đã xóa cấu hình hộp thư ${p.name}` };
  }

  /**
   * Kiểm tra kết nối SMTP thực tế (Verify Connection)
   */
  async testConnection(id) {
    const configData = this.getDecryptedTransporterConfig(id);
    const transporter = nodemailer.createTransport(configData.transportOptions);

    try {
      await transporter.verify();
      const now = new Date().toISOString();

      const p = this.providers.find(item => item.id === id);
      if (p) {
        p.lastTestedAt = now;
        p.lastTestResult = { success: true, message: 'Kết nối SMTP thành công 100%' };
        p.status = 'ACTIVE';
        this._save();
      }

      auditLogger.log({
        actor: 'EmailProviderService',
        action: 'TEST_EMAIL_CONNECTION',
        module: 'EMAIL_ENGINE',
        target: configData.provider.name,
        status: 'SUCCESS',
        details: { providerId: id, host: configData.provider.host }
      });

      return {
        success: true,
        message: `Xác thực SMTP thành công! Máy chủ ${configData.provider.host}:${configData.provider.port} sẵn sàng gửi email.`
      };
    } catch (err) {
      const now = new Date().toISOString();
      const p = this.providers.find(item => item.id === id);
      if (p) {
        p.lastTestedAt = now;
        p.lastTestResult = { success: false, error: err.message };
        p.status = 'ERROR';
        this._save();
      }

      auditLogger.log({
        actor: 'EmailProviderService',
        action: 'TEST_EMAIL_CONNECTION',
        module: 'EMAIL_ENGINE',
        target: configData.provider.name,
        status: 'ERROR',
        details: { providerId: id, error: err.message }
      });

      return {
        success: false,
        error: `Xác thực SMTP thất bại: ${err.message}`
      };
    }
  }

  /**
   * Tăng số lượng đã gửi trong ngày
   */
  recordEmailSent(id) {
    const p = this.providers.find(item => item.id === id);
    if (!p) return;
    this._checkAndResetDailyQuotas();
    p.dailySent = (p.dailySent || 0) + 1;
    p.lastSentAt = new Date().toISOString();
    this._save();
  }

  _checkAndResetDailyQuotas() {
    const today = new Date().toISOString().split('T')[0];
    let changed = false;
    for (const p of this.providers) {
      if (p.lastResetDate !== today) {
        p.dailySent = 0;
        p.lastResetDate = today;
        changed = true;
      }
    }
    if (changed) this._save();
  }
}

module.exports = new EmailProviderService();
