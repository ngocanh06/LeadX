/**
 * automationScheduler.js - Bộ Lập Lịch & Lịch Đăng Bài Thông Minh (Automation Scheduler)
 * Tuân thủ Section 9 Master Prompt:
 * - Hỗ trợ các kiểu lịch: ONE_TIME, DAILY, WEEKLY, CUSTOM, CAMPAIGN_SCHEDULE.
 * - Múi giờ mặc định: Asia/Ho_Chi_Minh.
 * - Cung cấp dữ liệu phục vụ Calendar View (Xem theo Ngày / Tuần / Tháng).
 * - Tự động đẩy bài vào Posting Queue đúng thời điểm.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const postingQueueService = require('./postingQueueService');
const auditLogger = require('./auditLogger');

const SCHEDULE_TYPES = {
  ONE_TIME: 'ONE_TIME',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  CUSTOM: 'CUSTOM'
};

class AutomationScheduler {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/automation_schedules.json');
    this.schedules = [];
    this.timer = null;
    this._load();
    this.startSchedulerLoop();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.schedules = JSON.parse(raw);
        if (!Array.isArray(this.schedules)) this.schedules = [];
      } else {
        this.schedules = [];
        this._save();
      }
    } catch (err) {
      logger.error(`[SCHEDULER] Lỗi nạp automation_schedules.json: ${err.message}`);
      this.schedules = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.schedules, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[SCHEDULER] Lỗi lưu automation_schedules.json: ${err.message}`);
    }
  }

  /**
   * Tạo lịch tự động mới
   */
  createSchedule({
    name,
    type = SCHEDULE_TYPES.ONE_TIME,
    timeSlots = ['08:30'], // Giờ phát bài trong ngày (HH:mm)
    daysOfWeek = [1, 2, 3, 4, 5, 6, 7], // 1=T2, 7=CN
    startDate = null,
    endDate = null,
    targetType = 'GROUP',
    targets = [], // Array of { id, name, url }
    accountPoolId = null,
    campaignId = null,
    contentTemplate = '',
    images = [],
    timezone = 'Asia/Ho_Chi_Minh',
    industry = 'recruitment'
  }) {
    if (!name || !name.trim()) throw new Error('Tên lịch trình không được để trống.');

    const schedule = {
      id: `sch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      type,
      timeSlots: Array.isArray(timeSlots) ? timeSlots : [timeSlots],
      daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : [1, 2, 3, 4, 5, 6, 7],
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: endDate || null,
      targetType,
      targets: Array.isArray(targets) ? targets : [],
      accountPoolId,
      campaignId,
      contentTemplate,
      images: Array.isArray(images) ? images : [],
      timezone,
      industry,
      status: 'ACTIVE',
      lastTriggeredAt: null,
      createdAt: new Date().toISOString()
    };

    this.schedules.push(schedule);
    this._save();

    auditLogger.log({
      actor: 'User',
      action: 'CREATE_SCHEDULE',
      module: 'SCHEDULER',
      target: schedule.name,
      status: 'SUCCESS',
      details: { scheduleId: schedule.id, type: schedule.type, targetsCount: schedule.targets.length }
    });

    return schedule;
  }

  /**
   * Vòng lặp kiểm tra lịch trình (Chạy mỗi 60 giây)
   */
  startSchedulerLoop() {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this._checkAndTriggerSchedules();
    }, 60000); // 1 phút / lần
  }

  _checkAndTriggerSchedules() {
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    const todayStr = now.toISOString().split('T')[0];
    const currentDayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1=T2, 7=CN

    for (const sch of this.schedules) {
      if (sch.status !== 'ACTIVE') continue;

      // Kiểm tra ngày bắt đầu / kết thúc
      if (sch.startDate && todayStr < sch.startDate) continue;
      if (sch.endDate && todayStr > sch.endDate) {
        sch.status = 'COMPLETED';
        continue;
      }

      // Kiểm tra ngày trong tuần
      if (!sch.daysOfWeek.includes(currentDayOfWeek)) continue;

      // Kiểm tra khung giờ phát bài
      if (sch.timeSlots.includes(currentTimeStr)) {
        // Tránh kích hoạt lặp lại trong cùng 1 phút
        if (sch.lastTriggeredAt && sch.lastTriggeredAt.startsWith(`${todayStr}T${currentTimeStr}`)) {
          continue;
        }

        this._dispatchSchedulePosts(sch);
        sch.lastTriggeredAt = now.toISOString();
      }
    }

    this._save();
  }

  /**
   * Đẩy bài của lịch trình vào Posting Queue
   */
  _dispatchSchedulePosts(schedule) {
    logger.info(`[SCHEDULER] Kích hoạt lịch: "${schedule.name}" (${schedule.targets.length} mục tiêu)`);

    const jobs = schedule.targets.map(target => ({
      content: schedule.contentTemplate,
      targetType: schedule.targetType,
      targetId: target.id,
      targetName: target.name,
      targetUrl: target.url,
      accountPoolId: schedule.accountPoolId,
      campaignId: schedule.campaignId,
      industry: schedule.industry,
      images: schedule.images,
      priority: 2 // Lịch trình được gán priority cao hơn post thủ công
    }));

    postingQueueService.addBatchJobs(jobs);

    auditLogger.log({
      actor: 'Scheduler',
      action: 'TRIGGER_SCHEDULE_POSTS',
      module: 'SCHEDULER',
      target: schedule.name,
      status: 'SUCCESS',
      details: { scheduleId: schedule.id, jobsCount: jobs.length }
    });
  }

  /**
   * Cung cấp dữ liệu phục vụ Calendar View (Day / Week / Month)
   */
  getCalendarData({ startDate, endDate }) {
    const queueJobs = postingQueueService.jobs || [];

    // Tổng hợp sự kiện theo ngày
    const eventsByDate = {};

    queueJobs.forEach(j => {
      const dateKey = (j.scheduledAt || j.createdAt).split('T')[0];
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = {
          date: dateKey,
          total: 0,
          success: 0,
          failed: 0,
          scheduled: 0,
          queued: 0,
          items: []
        };
      }

      eventsByDate[dateKey].total += 1;
      if (j.status === 'SUCCESS') eventsByDate[dateKey].success += 1;
      else if (j.status === 'FAILED') eventsByDate[dateKey].failed += 1;
      else if (j.status === 'SCHEDULED') eventsByDate[dateKey].scheduled += 1;
      else if (j.status === 'QUEUED' || j.status === 'PROCESSING') eventsByDate[dateKey].queued += 1;

      if (eventsByDate[dateKey].items.length < 20) {
        eventsByDate[dateKey].items.push({
          id: j.id,
          targetName: j.targetName,
          status: j.status,
          time: (j.scheduledAt || j.createdAt).split('T')[1].substring(0, 5)
        });
      }
    });

    return {
      activeSchedulesCount: this.schedules.filter(s => s.status === 'ACTIVE').length,
      schedules: this.schedules,
      calendarDays: Object.values(eventsByDate).sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  getSchedules() {
    return this.schedules;
  }

  deleteSchedule(scheduleId) {
    this.schedules = this.schedules.filter(s => s.id !== scheduleId);
    this._save();
    return true;
  }
}

module.exports = new AutomationScheduler();
