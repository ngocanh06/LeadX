/**
 * ruleEngineService.js - Động Cơ Thực Thi Bộ Luật Tự Động Hóa (Automation Rule Engine)
 * Tuân thủ Section 15 Master Prompt:
 * Cấu trúc: IF (Condition) THEN (Action)
 * Cho phép cấu hình, bật/tắt động trong Database (data/automation_rules.json).
 * Hỗ trợ các quy tắc quan trọng:
 * 1. Tự động tạm dừng nick khi vượt ngưỡng lỗi
 * 2. Tự động phát hiện trùng lặp nội dung
 * 3. Tự động chuyển Lead tiềm năng cao vào CRM Pipeline
 * 4. Tự động ngừng chiến dịch khi đạt mục tiêu hoặc hết hạn
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');

const DEFAULT_RULES = [
  {
    id: 'rule_account_error_pause',
    name: 'Tự Động Tạm Dừng Tài Khoản Khi Lỗi Liên Tiếp',
    description: 'Ngắt tài khoản khỏi Hàng đợi khi gặp lỗi đăng bài liên tiếp để bảo vệ nick khỏi Checkpoint',
    enabled: true,
    trigger: 'ACCOUNT_CONSECUTIVE_ERRORS',
    condition: {
      field: 'consecutiveErrors',
      operator: '>=',
      value: 3
    },
    action: {
      type: 'PAUSE_ACCOUNT',
      params: { notifyUser: true, markReviewRequired: true }
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule_duplicate_content_skip',
    name: 'Chống Trùng Lặp Nội Dung Đăng Bài',
    description: 'Bỏ qua hoặc cảnh báo nếu nội dung bài đăng trùng lặp trên 85% với bài vừa đăng gần nhất',
    enabled: true,
    trigger: 'BEFORE_POST_ENQUEUE',
    condition: {
      field: 'similarityRatio',
      operator: '>=',
      value: 0.85
    },
    action: {
      type: 'SKIP_OR_SPIN_CONTENT',
      params: { autoSpin: true }
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule_auto_crm_gold_lead',
    name: 'Tự Động Đẩy Lead Vàng Vào CRM Pipeline',
    description: 'Tự động tạo bản ghi CRM và kích hoạt cảnh báo khi phát hiện bài tuyển gấp hoặc có điểm chất lượng >= 80',
    enabled: true,
    trigger: 'LEAD_SCORE_EVALUATED',
    condition: {
      field: 'score',
      operator: '>=',
      value: 80
    },
    action: {
      type: 'CREATE_CRM_LEAD',
      params: { initialStage: 'QUALIFIED', sendNotification: true }
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule_post_retry_on_failure',
    name: 'Tự Động Thử Lại Bài Lỗi Tạm Thời',
    description: 'Nếu bài đăng thất bại do mạng hoặc timeout, tự động thử lại tối đa 3 lần với thời gian chờ dãn cách',
    enabled: true,
    trigger: 'POST_FAILED',
    condition: {
      field: 'retryCount',
      operator: '<',
      value: 3
    },
    action: {
      type: 'RETRY_JOB_WITH_BACKOFF',
      params: { backoffMinutes: 5 }
    },
    createdAt: new Date().toISOString()
  }
];

class RuleEngineService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/automation_rules.json');
    this.rules = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.rules = JSON.parse(raw);
        if (!Array.isArray(this.rules) || this.rules.length === 0) {
          this.rules = DEFAULT_RULES;
          this._save();
        }
      } else {
        this.rules = DEFAULT_RULES;
        this._save();
      }
    } catch (err) {
      logger.error(`[RULE_ENGINE] Lỗi nạp automation_rules.json: ${err.message}`);
      this.rules = DEFAULT_RULES;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.rules, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[RULE_ENGINE] Lỗi lưu automation_rules.json: ${err.message}`);
    }
  }

  getRules() {
    return this.rules;
  }

  getRuleById(id) {
    return this.rules.find(r => r.id === id) || null;
  }

  toggleRule(id, enabledState = null) {
    const rule = this.getRuleById(id);
    if (!rule) throw new Error('Không tìm thấy luật tự động.');

    rule.enabled = enabledState !== null ? Boolean(enabledState) : !rule.enabled;
    rule.updatedAt = new Date().toISOString();
    this._save();

    auditLogger.log({
      actor: 'User',
      action: 'TOGGLE_RULE',
      module: 'RULE_ENGINE',
      target: rule.name,
      status: 'SUCCESS',
      details: { ruleId: rule.id, enabled: rule.enabled }
    });

    return rule;
  }

  updateRule(id, data) {
    const idx = this.rules.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Không tìm thấy luật tự động.');

    this.rules[idx] = {
      ...this.rules[idx],
      ...data,
      updatedAt: new Date().toISOString()
    };

    this._save();
    return this.rules[idx];
  }

  /**
   * Đánh giá một sự kiện xem có thỏa mãn các luật đang kích hoạt không
   */
  evaluateTrigger(triggerType, contextData = {}) {
    const matchedRules = this.rules.filter(r => r.enabled && r.trigger === triggerType);
    const triggeredActions = [];

    for (const rule of matchedRules) {
      const isMatch = this._checkCondition(rule.condition, contextData);
      if (isMatch) {
        triggeredActions.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          context: contextData
        });

        logger.info(`[RULE_ENGINE] Kích hoạt luật: "${rule.name}" (${rule.id})`);
      }
    }

    return triggeredActions;
  }

  _checkCondition(cond, data) {
    if (!cond || !cond.field) return true;

    const actualVal = data[cond.field];
    const targetVal = cond.value;

    switch (cond.operator) {
      case '==':
      case '===':
      case 'equals':
        return actualVal === targetVal;
      case '!=':
      case '!==':
      case 'not_equals':
        return actualVal !== targetVal;
      case '>=':
        return actualVal >= targetVal;
      case '<=':
        return actualVal <= targetVal;
      case '>':
        return actualVal > targetVal;
      case '<':
        return actualVal < targetVal;
      case 'contains':
        return typeof actualVal === 'string' && actualVal.includes(targetVal);
      default:
        return false;
    }
  }
}

module.exports = new RuleEngineService();
