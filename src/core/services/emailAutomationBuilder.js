/**
 * emailAutomationBuilder.js - Trình Xây Dựng Kịch Bản Chuỗi Email Tự Động (Drip Automation Builder)
 * Tuân thủ Section 10 Master Prompt Auto Email:
 * - Chuỗi kịch bản: Trigger -> Conditions -> Action -> Wait -> Auto Stop khi có phản hồi.
 * - Cơ chế Auto Stop: Tự động dừng chuỗi nếu ứng viên/khách hàng đã phản hồi hoặc đã chốt đơn.
 * - Lưu trữ kịch bản tại data/email_automations.json.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');
const emailQueueService = require('./emailQueueService');
const emailTemplateService = require('./emailTemplateService');

const DEFAULT_AUTOMATIONS = [
  {
    id: 'auto_seq_candidate_onboarding',
    name: 'Quy Trình Chăm Sóc & Mời Phỏng Vấn Ứng Viên Tự Động',
    trigger: 'NEW_CANDIDATE_INGESTED',
    enabled: true,
    category: 'candidate',
    autoStopConditions: ['INTERVIEW_SCHEDULED', 'HIRED', 'REPLIED', 'LOST'],
    steps: [
      {
        stepNumber: 1,
        type: 'SEND_EMAIL',
        templateId: 'tmpl_candidate_ack',
        delayMinutes: 0 // Gửi ngay lập tức
      },
      {
        stepNumber: 2,
        type: 'WAIT',
        delayMinutes: 1440 // Đợi 24 giờ
      },
      {
        stepNumber: 3,
        type: 'SEND_EMAIL',
        templateId: 'tmpl_interview_invite',
        delayMinutes: 0
      }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'auto_seq_employer_nurture',
    name: 'Quy Trình Tiếp Cận & Báo Giá Doanh Nghiệp (B2B Nurture)',
    trigger: 'NEW_B2B_LEAD_FOUND',
    enabled: true,
    category: 'employer',
    autoStopConditions: ['CONTACTED', 'CONVERTED', 'REPLIED', 'NOT_INTERESTED'],
    steps: [
      {
        stepNumber: 1,
        type: 'SEND_EMAIL',
        templateId: 'tmpl_employer_outreach',
        delayMinutes: 0
      },
      {
        stepNumber: 2,
        type: 'WAIT',
        delayMinutes: 2880 // Đợi 48 giờ
      },
      {
        stepNumber: 3,
        type: 'SEND_EMAIL',
        templateId: 'tmpl_employer_quotation',
        delayMinutes: 0
      }
    ],
    createdAt: new Date().toISOString()
  }
];

class EmailAutomationBuilder {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/email_automations.json');
    this.instancesFile = path.resolve(this.rootDir, 'data/email_automation_instances.json');
    this.automations = [];
    this.instances = [];

    this._load();
    this._startInstanceEvaluator();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.automations = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || [];
        if (!Array.isArray(this.automations) || this.automations.length === 0) {
          this.automations = DEFAULT_AUTOMATIONS;
          this._save();
        }
      } else {
        this.automations = DEFAULT_AUTOMATIONS;
        this._save();
      }

      if (fs.existsSync(this.instancesFile)) {
        this.instances = JSON.parse(fs.readFileSync(this.instancesFile, 'utf8')) || [];
      } else {
        this.instances = [];
      }
    } catch (err) {
      logger.error(`[EMAIL_AUTOMATION] Lỗi nạp dữ liệu automations: ${err.message}`);
      this.automations = DEFAULT_AUTOMATIONS;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.automations, null, 2), 'utf8');
      fs.writeFileSync(this.instancesFile, JSON.stringify(this.instances, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[EMAIL_AUTOMATION] Lỗi ghi file automations: ${err.message}`);
    }
  }

  getAutomations({ category } = {}) {
    let list = [...this.automations];
    if (category && category !== 'ALL') {
      list = list.filter(a => a.category === category);
    }
    return list;
  }

  getAutomationById(id) {
    return this.automations.find(a => a.id === id) || null;
  }

  createAutomation({ name, trigger, category = 'candidate', autoStopConditions = [], steps = [] }) {
    if (!name || !name.trim()) throw new Error('Tên kịch bản không được để trống.');
    if (!trigger) throw new Error('Sự kiện kích hoạt (Trigger) không được để trống.');

    const newAuto = {
      id: `auto_${Date.now().toString(36)}`,
      name: name.trim(),
      trigger,
      enabled: true,
      category,
      autoStopConditions: Array.isArray(autoStopConditions) ? autoStopConditions : [],
      steps: Array.isArray(steps) ? steps : [],
      createdAt: new Date().toISOString()
    };

    this.automations.unshift(newAuto);
    this._save();

    auditLogger.log({
      actor: 'EmailAutomationBuilder',
      action: 'CREATE_EMAIL_AUTOMATION',
      module: 'EMAIL_AUTOMATION',
      target: newAuto.name,
      status: 'SUCCESS',
      details: { automationId: newAuto.id, trigger }
    });

    return newAuto;
  }

  toggleAutomation(id, enabled) {
    const a = this.automations.find(item => item.id === id);
    if (!a) throw new Error(`Không tìm thấy kịch bản ID ${id}`);

    a.enabled = Boolean(enabled);
    this._save();

    auditLogger.log({
      actor: 'EmailAutomationBuilder',
      action: a.enabled ? 'ENABLE_AUTOMATION' : 'DISABLE_AUTOMATION',
      module: 'EMAIL_AUTOMATION',
      target: a.name,
      status: 'INFO',
      details: { automationId: id }
    });

    return a;
  }

  deleteAutomation(id) {
    const idx = this.automations.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Không tìm thấy kịch bản ID ${id}`);

    const a = this.automations[idx];
    this.automations.splice(idx, 1);
    this._save();

    return { success: true, message: `Đã xóa kịch bản ${a.name}` };
  }

  /**
   * Kích hoạt một kịch bản khi có sự kiện (Trigger Event)
   */
  triggerEvent(triggerName, payload = {}) {
    const matched = this.automations.filter(a => a.enabled && a.trigger === triggerName);
    const triggeredInstances = [];

    for (const auto of matched) {
      const recipientEmail = payload.recipientEmail || payload.email || payload.to;
      if (!recipientEmail || !recipientEmail.includes('@')) continue;

      const instance = {
        instanceId: `inst_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        automationId: auto.id,
        automationName: auto.name,
        recipientEmail: recipientEmail.toLowerCase().trim(),
        recipientName: payload.recipientName || payload.name || recipientEmail,
        leadId: payload.leadId || null,
        currentStepIndex: 0,
        status: 'RUNNING', // 'RUNNING' | 'COMPLETED' | 'STOPPED_CONDITION_MET'
        variables: payload.variables || payload,
        nextExecutionAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.instances.unshift(instance);
      triggeredInstances.push(instance);
    }

    if (triggeredInstances.length > 0) {
      this._save();
      // Chạy ngay bước đầu tiên
      this.evaluateRunningInstances();
    }

    return triggeredInstances;
  }

  /**
   * Dừng kịch bản ngay lập tức khi ứng viên/khách hàng đổi trạng thái hoặc phản hồi (Auto Stop)
   */
  handleRecipientStateChange(recipientEmail, newStatus) {
    if (!recipientEmail) return;
    const cleanEmail = recipientEmail.toLowerCase().trim();

    let stoppedCount = 0;
    for (const inst of this.instances) {
      if (inst.recipientEmail === cleanEmail && inst.status === 'RUNNING') {
        const auto = this.getAutomationById(inst.automationId);
        if (auto && auto.autoStopConditions && auto.autoStopConditions.includes(newStatus)) {
          inst.status = 'STOPPED_CONDITION_MET';
          inst.stopReason = `Trạng thái thay đổi thành: ${newStatus}`;
          inst.updatedAt = new Date().toISOString();
          stoppedCount++;
        }
      }
    }

    if (stoppedCount > 0) {
      this._save();
      auditLogger.log({
        actor: 'EmailAutomationBuilder',
        action: 'AUTO_STOP_SEQUENCE',
        module: 'EMAIL_AUTOMATION',
        target: recipientEmail,
        status: 'INFO',
        details: { stoppedCount, newStatus }
      });
    }
    return stoppedCount;
  }

  _startInstanceEvaluator() {
    if (this.evaluatorInterval) return;
    this.evaluatorInterval = setInterval(() => {
      this.evaluateRunningInstances();
    }, 10000); // Mỗi 10s kiểm tra tiến độ các instance
  }

  /**
   * Đánh giá và thực thi các bước tiếp theo trong chuỗi
   */
  evaluateRunningInstances() {
    const now = Date.now();
    const running = this.instances.filter(inst => 
      inst.status === 'RUNNING' && 
      new Date(inst.nextExecutionAt).getTime() <= now
    );

    for (const inst of running) {
      const auto = this.getAutomationById(inst.automationId);
      if (!auto || !auto.enabled) {
        inst.status = 'COMPLETED';
        continue;
      }

      const steps = auto.steps || [];
      if (inst.currentStepIndex >= steps.length) {
        inst.status = 'COMPLETED';
        inst.updatedAt = new Date().toISOString();
        continue;
      }

      const step = steps[inst.currentStepIndex];

      if (step.type === 'SEND_EMAIL') {
        // Gửi email
        try {
          const rendered = emailTemplateService.renderTemplate(step.templateId, inst.variables);
          emailQueueService.addEmailJob({
            to: inst.recipientEmail,
            toName: inst.recipientName,
            subject: rendered.subject,
            bodyHtml: rendered.bodyHtml,
            bodyText: rendered.bodyText,
            category: auto.category,
            leadId: inst.leadId,
            idempotencyKey: `auto_${inst.instanceId}_step${inst.currentStepIndex}`
          });
        } catch (err) {
          logger.error(`[EMAIL_AUTOMATION] Lỗi gửi email step ${inst.currentStepIndex}: ${err.message}`);
        }

        // Chuyển sang step tiếp theo
        inst.currentStepIndex += 1;
        inst.nextExecutionAt = new Date(Date.now() + 1000).toISOString();
      } else if (step.type === 'WAIT') {
        // Chờ đợi thời gian
        const waitMs = (step.delayMinutes || 60) * 60 * 1000;
        inst.currentStepIndex += 1;
        inst.nextExecutionAt = new Date(Date.now() + waitMs).toISOString();
      }

      inst.updatedAt = new Date().toISOString();
    }

    if (running.length > 0) {
      this._save();
    }
  }
}

module.exports = new EmailAutomationBuilder();
