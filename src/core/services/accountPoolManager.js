/**
 * accountPoolManager.js - Quản Lý Nhóm Tài Khoản (Account Pools) & Điều Phối An Toàn Meta
 * Tuân thủ Section 5 & 6 Master Prompt:
 * - Phân nhóm tài khoản theo Pool: Recruitment Pool, Real Estate Pool, Seeding Pool
 * - Chiến dịch (Campaign) chọn Account Pool thay vì tài khoản đơn lẻ
 * - Tự động luân chuyển nick, kiểm soát hạn ngạch ngày & thời gian làm mát (Cooldown)
 * - Tự động Tạm Dừng (AUTO PAUSE) tài khoản khi vượt ngưỡng lỗi liên tiếp và chuyển sang Review Required
 * - Không cố vượt checkpoint hoặc bypass cơ chế bảo vệ của Meta
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const accountManager = require('./accountManager');
const auditLogger = require('./auditLogger');

const POOL_STATUSES = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  MAINTENANCE: 'MAINTENANCE'
};

const DEFAULT_POOLS = [
  {
    id: 'pool_recruitment',
    name: 'Nhóm Nick Tuyển Dụng (Recruitment Pool)',
    industry: 'recruitment',
    description: 'Chuyên đăng bài tuyển dụng, tương tác ứng viên và theo dõi nhóm tìm việc',
    accountIds: ['acc_primary', 'acc_backup_01'],
    dailyPostLimitPerAccount: 15,
    cooldownMinutesBetweenPosts: 20,
    maxConsecutiveErrors: 3,
    status: 'ACTIVE',
    tags: ['Tuyển dụng', 'Hội nhóm', 'Đà Nẵng'],
    assignedCampaigns: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'pool_bds',
    name: 'Nhóm Nick Bất Động Sản (Real Estate Pool)',
    industry: 'bds',
    description: 'Chuyên đăng tin căn hộ, phòng trọ, tương tác người thuê và dò lead BĐS',
    accountIds: ['acc_bds_01', 'acc_bds_02'],
    dailyPostLimitPerAccount: 10,
    cooldownMinutesBetweenPosts: 30,
    maxConsecutiveErrors: 3,
    status: 'ACTIVE',
    tags: ['Bất động sản', 'Căn hộ', 'Cho thuê'],
    assignedCampaigns: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'pool_seeding',
    name: 'Nhóm Nick Tương Tác & Seeding (Seeding Pool)',
    industry: 'general',
    description: 'Chuyên comment mồi, phản hồi thắc mắc, tạo độ tin cậy tự nhiên cho bài đăng',
    accountIds: [],
    dailyPostLimitPerAccount: 25,
    cooldownMinutesBetweenPosts: 10,
    maxConsecutiveErrors: 4,
    status: 'ACTIVE',
    tags: ['Seeding', 'Bình luận', 'Tương tác'],
    assignedCampaigns: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

class AccountPoolManager {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/account_pools.json');
    this.pools = [];
    this.accountUsageTrack = new Map(); // accountId -> { todayCount, lastActionAt, consecutiveErrors, pausedReason }
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.pools = JSON.parse(raw);
        if (!Array.isArray(this.pools) || this.pools.length === 0) {
          this.pools = DEFAULT_POOLS;
          this._save();
        }
      } else {
        this.pools = DEFAULT_POOLS;
        this._save();
      }
    } catch (err) {
      logger.error(`[ACCOUNT_POOL] Lỗi nạp account_pools.json: ${err.message}`);
      this.pools = DEFAULT_POOLS;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.pools, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[ACCOUNT_POOL] Lỗi lưu account_pools.json: ${err.message}`);
    }
  }

  /**
   * Lấy danh sách toàn bộ Account Pools kèm số lượng tài khoản sẵn sàng
   */
  getPools() {
    const allAccounts = accountManager.loadAccounts() || [];
    
    return this.pools.map(pool => {
      const attachedAccounts = allAccounts.filter(a => pool.accountIds.includes(a.id));
      const activeCount = attachedAccounts.filter(a => !['CHECKPOINT', 'EXPIRED', 'PAUSED'].includes(a.status)).length;
      const pausedCount = attachedAccounts.filter(a => a.status === 'PAUSED' || a.status === 'CHECKPOINT').length;

      return {
        ...pool,
        totalAccounts: pool.accountIds.length,
        activeAccountsCount: activeCount,
        pausedAccountsCount: pausedCount,
        accounts: attachedAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          status: acc.status || 'ACTIVE',
          proxy: acc.proxy || 'Trực tiếp',
          usage: this.getAccountUsage(acc.id)
        }))
      };
    });
  }

  getPoolById(poolId) {
    return this.pools.find(p => p.id === poolId) || null;
  }

  /**
   * Tạo Account Pool mới
   */
  createPool({ name, industry = 'general', description = '', accountIds = [], dailyPostLimitPerAccount = 15, cooldownMinutesBetweenPosts = 20, tags = [] }) {
    if (!name || !name.trim()) throw new Error('Tên Pool tài khoản không được để trống.');

    const newPool = {
      id: `pool_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      industry,
      description: description || '',
      accountIds: Array.isArray(accountIds) ? accountIds : [],
      dailyPostLimitPerAccount: Number(dailyPostLimitPerAccount) || 15,
      cooldownMinutesBetweenPosts: Number(cooldownMinutesBetweenPosts) || 20,
      maxConsecutiveErrors: 3,
      status: 'ACTIVE',
      tags: Array.isArray(tags) ? tags : [],
      assignedCampaigns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.pools.push(newPool);
    this._save();

    auditLogger.log({
      actor: 'User',
      action: 'CREATE_ACCOUNT_POOL',
      module: 'ACCOUNT_CENTER',
      target: newPool.name,
      status: 'SUCCESS',
      details: { poolId: newPool.id, accountCount: newPool.accountIds.length }
    });

    return newPool;
  }

  /**
   * Cập nhật thông tin Pool
   */
  updatePool(poolId, data) {
    const idx = this.pools.findIndex(p => p.id === poolId);
    if (idx === -1) throw new Error('Không tìm thấy Account Pool.');

    const current = this.pools[idx];
    this.pools[idx] = {
      ...current,
      name: data.name !== undefined ? data.name.trim() : current.name,
      industry: data.industry !== undefined ? data.industry : current.industry,
      description: data.description !== undefined ? data.description : current.description,
      dailyPostLimitPerAccount: data.dailyPostLimitPerAccount !== undefined ? Number(data.dailyPostLimitPerAccount) : current.dailyPostLimitPerAccount,
      cooldownMinutesBetweenPosts: data.cooldownMinutesBetweenPosts !== undefined ? Number(data.cooldownMinutesBetweenPosts) : current.cooldownMinutesBetweenPosts,
      status: data.status !== undefined ? data.status : current.status,
      tags: Array.isArray(data.tags) ? data.tags : current.tags,
      updatedAt: new Date().toISOString()
    };

    this._save();
    return this.pools[idx];
  }

  /**
   * Gán danh sách tài khoản vào Pool
   */
  assignAccountsToPool(poolId, accountIds) {
    const pool = this.getPoolById(poolId);
    if (!pool) throw new Error('Không tìm thấy Account Pool.');

    const newIds = Array.isArray(accountIds) ? accountIds : [accountIds];
    const set = new Set([...pool.accountIds, ...newIds]);
    pool.accountIds = Array.from(set);
    pool.updatedAt = new Date().toISOString();
    this._save();

    auditLogger.log({
      actor: 'User',
      action: 'ASSIGN_ACCOUNTS_TO_POOL',
      module: 'ACCOUNT_CENTER',
      target: pool.name,
      status: 'SUCCESS',
      details: { poolId, assignedCount: newIds.length, totalNow: pool.accountIds.length }
    });

    return pool;
  }

  /**
   * Xóa tài khoản khỏi Pool
   */
  removeAccountFromPool(poolId, accountId) {
    const pool = this.getPoolById(poolId);
    if (!pool) throw new Error('Không tìm thấy Account Pool.');

    pool.accountIds = pool.accountIds.filter(id => id !== accountId);
    pool.updatedAt = new Date().toISOString();
    this._save();
    return pool;
  }

  /**
   * Lấy tài khoản sẵn sàng nhất trong Pool (Round-Robin có kiểm soát Cooldown & Giới hạn ngày)
   */
  selectNextAvailableAccount(poolId) {
    const pool = this.getPoolById(poolId);
    if (!pool || pool.status !== 'ACTIVE') {
      return { account: null, reason: 'Pool không tồn tại hoặc đang bị tạm dừng' };
    }

    if (pool.accountIds.length === 0) {
      return { account: null, reason: 'Chưa có tài khoản nào được gán vào Pool này' };
    }

    const allAccounts = accountManager.loadAccounts() || [];
    const poolAccounts = allAccounts.filter(a => pool.accountIds.includes(a.id));

    const now = Date.now();
    const cooldownMs = pool.cooldownMinutesBetweenPosts * 60 * 1000;

    const candidates = [];

    for (const acc of poolAccounts) {
      // 1. Kiểm tra trạng thái Checkpoint / Expired / Paused
      if (['CHECKPOINT', 'EXPIRED', 'PAUSED'].includes(acc.status)) {
        continue;
      }

      const usage = this.getAccountUsage(acc.id);

      // 2. Kiểm tra giới hạn bài đăng trong ngày
      if (usage.todayCount >= pool.dailyPostLimitPerAccount) {
        continue;
      }

      // 3. Kiểm tra Cooldown
      const elapsed = now - (usage.lastActionAt ? new Date(usage.lastActionAt).getTime() : 0);
      if (elapsed < cooldownMs) {
        continue;
      }

      candidates.push({
        account: acc,
        usage,
        idleTime: elapsed,
        todayCount: usage.todayCount
      });
    }

    if (candidates.length === 0) {
      return {
        account: null,
        reason: 'Tất cả tài khoản trong Pool đang trong thời gian làm mát (Cooldown) hoặc đã đạt giới hạn bài hôm nay'
      };
    }

    // Ưu tiên nick có số bài đăng hôm nay ít nhất, nếu bằng nhau thì nick có thời gian nghỉ lâu nhất
    candidates.sort((a, b) => {
      if (a.todayCount !== b.todayCount) return a.todayCount - b.todayCount;
      return b.idleTime - a.idleTime;
    });

    return {
      account: candidates[0].account,
      reason: 'OK'
    };
  }

  /**
   * Ghi nhận một hành động thành công của tài khoản trong Pool
   */
  recordActionSuccess(accountId) {
    const usage = this.getAccountUsage(accountId);
    usage.todayCount += 1;
    usage.lastActionAt = new Date().toISOString();
    usage.consecutiveErrors = 0; // Reset lỗi liên tiếp
    this.accountUsageTrack.set(accountId, usage);
  }

  /**
   * Ghi nhận lỗi thực thi của tài khoản
   * Mục 6: Tự động Tạm Dừng (AUTO PAUSE) tài khoản khi vượt ngưỡng lỗi
   */
  recordActionError(accountId, errorMessage) {
    const usage = this.getAccountUsage(accountId);
    usage.consecutiveErrors = (usage.consecutiveErrors || 0) + 1;
    usage.lastErrorAt = new Date().toISOString();
    usage.lastErrorMessage = errorMessage;
    this.accountUsageTrack.set(accountId, usage);

    // Tìm Pool chứa nick này để kiểm tra ngưỡng maxConsecutiveErrors
    let threshold = 3;
    for (const p of this.pools) {
      if (p.accountIds.includes(accountId) && p.maxConsecutiveErrors) {
        threshold = p.maxConsecutiveErrors;
        break;
      }
    }

    if (usage.consecutiveErrors >= threshold) {
      this._autoPauseAccount(accountId, `Vượt quá ${threshold} lỗi liên tiếp: ${errorMessage}`);
    }
  }

  /**
   * Tự động tạm dừng tài khoản an toàn
   */
  _autoPauseAccount(accountId, reason) {
    const accounts = accountManager.loadAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    acc.status = 'PAUSED';
    acc.pausedReason = reason;
    acc.pausedAt = new Date().toISOString();
    acc.reviewRequired = true;
    accountManager.saveAccounts(accounts);

    auditLogger.log({
      actor: 'AccountPoolManager',
      action: 'AUTO_PAUSE_ACCOUNT',
      module: 'ACCOUNT_CENTER',
      target: acc.name || accountId,
      status: 'WARNING',
      details: { accountId, reason, reviewRequired: true },
      error: reason
    });

    logger.warn(`[AUTO_PAUSE] Tài khoản ${acc.name} (${accountId}) đã bị TỰ ĐỘNG TẠM DỪNG: ${reason}`);
  }

  /**
   * Gỡ tạm dừng sau khi người dùng kiểm tra thủ công (Manual Review)
   */
  resumeAccount(accountId) {
    const accounts = accountManager.loadAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) throw new Error('Không tìm thấy tài khoản.');

    acc.status = 'ACTIVE';
    acc.pausedReason = null;
    acc.reviewRequired = false;
    accountManager.saveAccounts(accounts);

    const usage = this.getAccountUsage(accountId);
    usage.consecutiveErrors = 0;
    this.accountUsageTrack.set(accountId, usage);

    auditLogger.log({
      actor: 'User',
      action: 'MANUAL_RESUME_ACCOUNT',
      module: 'ACCOUNT_CENTER',
      target: acc.name,
      status: 'SUCCESS',
      details: { accountId }
    });

    return acc;
  }

  getAccountUsage(accountId) {
    if (!this.accountUsageTrack.has(accountId)) {
      this.accountUsageTrack.set(accountId, {
        todayCount: 0,
        lastActionAt: null,
        consecutiveErrors: 0,
        lastErrorMessage: null
      });
    }
    return this.accountUsageTrack.get(accountId);
  }
}

module.exports = new AccountPoolManager();
