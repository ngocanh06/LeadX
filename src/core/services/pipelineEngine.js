/**
 * pipelineEngine.js - Động Cơ Pipeline Kép Chuyên Nghiệp (Dual CRM Pipelines & Appointments)
 * Tuân thủ Section 15 Master Prompt:
 * 1. Recruitment Pipeline: NEW -> VERIFIED -> CONTACTED -> INTERVIEW_SCHEDULED -> INTERVIEWED -> OFFERED -> HIRED -> LOST
 * 2. Real Estate (BĐS) Pipeline: NEW -> INQUIRY -> VIEWING_SCHEDULED -> VIEWED -> NEGOTIATING -> DEPOSIT_PLACED -> CONTRACT_SIGNED -> LOST
 * - Quản lý lịch hẹn phỏng vấn / xem căn hộ thực tế
 * - Cảnh báo trễ hạn (Overdue SLA) khi Lead nằm quá lâu tại 1 stage
 * - Cung cấp dữ liệu dạng Kanban Board
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');

const PIPELINE_DEFINITIONS = {
  recruitment: [
    { code: 'NEW', label: 'Mới thu thập', color: '#3B82F6', maxHoursInStage: 24 },
    { code: 'VERIFIED', label: 'Đã xác minh', color: '#0284C7', maxHoursInStage: 24 },
    { code: 'CONTACTED', label: 'Đã liên hệ', color: '#6366F1', maxHoursInStage: 48 },
    { code: 'INTERVIEW_SCHEDULED', label: 'Hẹn phỏng vấn', color: '#F59E0B', maxHoursInStage: 72 },
    { code: 'INTERVIEWED', label: 'Đã phỏng vấn', color: '#8B5CF6', maxHoursInStage: 48 },
    { code: 'OFFERED', label: 'Gửi Offer', color: '#EC4899', maxHoursInStage: 48 },
    { code: 'HIRED', label: 'Tuyển dụng thành công', color: '#10B981', isWon: true },
    { code: 'LOST', label: 'Thất bại / Hủy', color: '#64748B', isLost: true }
  ],
  bds: [
    { code: 'NEW', label: 'Khách mới', color: '#3B82F6', maxHoursInStage: 12 },
    { code: 'INQUIRY', label: 'Tìm hiểu nhu cầu', color: '#0284C7', maxHoursInStage: 24 },
    { code: 'VIEWING_SCHEDULED', label: 'Hẹn xem căn hộ', color: '#F59E0B', maxHoursInStage: 48 },
    { code: 'VIEWED', label: 'Đã xem căn hộ', color: '#8B5CF6', maxHoursInStage: 48 },
    { code: 'NEGOTIATING', label: 'Đàm phán cọc/giá', color: '#EC4899', maxHoursInStage: 48 },
    { code: 'DEPOSIT_PLACED', label: 'Đã đặt cọc', color: '#06B6D4', maxHoursInStage: 72 },
    { code: 'CONTRACT_SIGNED', label: 'Ký hợp đồng thuê', color: '#10B981', isWon: true },
    { code: 'LOST', label: 'Hủy / Không thuê', color: '#64748B', isLost: true }
  ]
};

class PipelineEngine {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.leadsFile = path.resolve(this.rootDir, 'data/leads_crm.json');
    this.appointmentsFile = path.resolve(this.rootDir, 'data/crm_appointments.json');
    this.appointments = [];
    this._loadAppointments();
  }

  _loadAppointments() {
    try {
      if (fs.existsSync(this.appointmentsFile)) {
        this.appointments = JSON.parse(fs.readFileSync(this.appointmentsFile, 'utf8')) || [];
      } else {
        this.appointments = [];
        this._saveAppointments();
      }
    } catch (err) {
      logger.error(`[PIPELINE_ENGINE] Lỗi nạp appointments: ${err.message}`);
      this.appointments = [];
    }
  }

  _saveAppointments() {
    try {
      const dir = path.dirname(this.appointmentsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.appointmentsFile, JSON.stringify(this.appointments, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[PIPELINE_ENGINE] Lỗi lưu appointments: ${err.message}`);
    }
  }

  _getLeads() {
    try {
      if (fs.existsSync(this.leadsFile)) {
        return JSON.parse(fs.readFileSync(this.leadsFile, 'utf8')) || [];
      }
      return [];
    } catch (err) {
      logger.error(`[PIPELINE_ENGINE] Lỗi đọc leads: ${err.message}`);
      return [];
    }
  }

  _saveLeads(leads) {
    try {
      fs.writeFileSync(this.leadsFile, JSON.stringify(leads, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[PIPELINE_ENGINE] Lỗi ghi leads: ${err.message}`);
    }
  }

  /**
   * Lấy cấu hình các stage của pipeline theo ngành
   */
  getPipelineStages(industry = 'recruitment') {
    const key = industry === 'bds' ? 'bds' : 'recruitment';
    return PIPELINE_DEFINITIONS[key];
  }

  /**
   * Trả về dữ liệu Kanban Board phân nhóm theo các Stage
   */
  getKanbanBoard(industry = 'recruitment') {
    const stages = this.getPipelineStages(industry);
    const leads = this._getLeads().filter(l => (industry === 'bds' ? l.industry === 'bds' : l.industry !== 'bds'));
    const now = Date.now();

    // Map stages to Kanban columns
    const columns = stages.map(stage => {
      const stageLeads = leads
        .filter(l => (l.pipelineStage || l.status) === stage.code)
        .map(l => {
          // Kiểm tra quá hạn SLA (Overdue)
          const stageEnteredAt = l.stageEnteredAt ? new Date(l.stageEnteredAt).getTime() : new Date(l.createdAt || now).getTime();
          const hoursInStage = Math.round((now - stageEnteredAt) / (1000 * 60 * 60));
          const isOverdue = stage.maxHoursInStage ? hoursInStage > stage.maxHoursInStage : false;

          return {
            ...l,
            hoursInStage,
            isOverdue
          };
        });

      return {
        stageCode: stage.code,
        label: stage.label,
        color: stage.color,
        count: stageLeads.length,
        leads: stageLeads
      };
    });

    const overdueCount = columns.reduce((acc, col) => acc + col.leads.filter(l => l.isOverdue).length, 0);

    return {
      industry,
      totalLeads: leads.length,
      overdueCount,
      columns
    };
  }

  /**
   * Di chuyển Lead sang Stage tiếp theo trong Pipeline
   */
  moveStage({ leadId, targetStage, note, staffName }) {
    const leads = this._getLeads();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) throw new Error(`Không tìm thấy lead ID ${leadId}`);

    const industry = lead.industry === 'bds' ? 'bds' : 'recruitment';
    const stages = this.getPipelineStages(industry);
    const validStage = stages.find(s => s.code === targetStage);
    if (!validStage) throw new Error(`Giai đoạn ${targetStage} không hợp lệ cho pipeline ${industry}`);

    const prevStage = lead.pipelineStage || lead.status || 'NEW';
    const now = new Date().toISOString();

    lead.pipelineStage = targetStage;
    lead.status = targetStage; // Giữ tương thích status
    lead.statusLabel = validStage.label;
    lead.stageEnteredAt = now;
    lead.updatedAt = now;

    if (!Array.isArray(lead.stageHistory)) lead.stageHistory = [];
    lead.stageHistory.push({
      fromStage: prevStage,
      toStage: targetStage,
      timestamp: now,
      note: note || '',
      staffName: staffName || 'Admin'
    });

    this._saveLeads(leads);

    auditLogger.log({
      actor: staffName || 'Staff',
      action: 'MOVE_PIPELINE_STAGE',
      module: 'CRM_PIPELINE',
      target: lead.posterName || lead.phone,
      status: 'SUCCESS',
      details: { leadId, fromStage: prevStage, toStage: targetStage }
    });

    return {
      success: true,
      lead,
      message: `Đã chuyển sang giai đoạn: ${validStage.label}`
    };
  }

  /**
   * Đặt lịch hẹn (Phỏng vấn ứng viên hoặc Xem căn hộ)
   */
  scheduleAppointment({
    leadId,
    type = 'INTERVIEW', // 'INTERVIEW' hoặc 'VIEWING'
    scheduledAt,
    location,
    notes,
    assignedStaff
  }) {
    if (!leadId) throw new Error('Vui lòng chọn Lead');
    if (!scheduledAt) throw new Error('Vui lòng chọn thời gian lịch hẹn');

    const leads = this._getLeads();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) throw new Error(`Không tìm thấy lead ID ${leadId}`);

    const appt = {
      id: `appt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      leadId,
      customerName: lead.posterName || 'Khách hàng',
      phone: lead.phone || '',
      industry: lead.industry || 'recruitment',
      type: type.toUpperCase(),
      scheduledAt: new Date(scheduledAt).toISOString(),
      location: location || lead.address || 'Tại văn phòng / Địa chỉ căn hộ',
      notes: notes || '',
      assignedStaff: assignedStaff || 'Chuyên viên tư vấn',
      status: 'SCHEDULED', // 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
      createdAt: new Date().toISOString()
    };

    this.appointments.unshift(appt);
    this._saveAppointments();

    // Tự động chuyển stage sang INTERVIEW_SCHEDULED hoặc VIEWING_SCHEDULED
    const targetStage = type.toUpperCase() === 'VIEWING' ? 'VIEWING_SCHEDULED' : 'INTERVIEW_SCHEDULED';
    try {
      this.moveStage({
        leadId,
        targetStage,
        note: `Đặt lịch hẹn: ${appt.location} vào lúc ${appt.scheduledAt}`,
        staffName: assignedStaff
      });
    } catch (e) {
      logger.warn(`[PIPELINE_ENGINE] Không thể tự chuyển stage: ${e.message}`);
    }

    auditLogger.log({
      actor: assignedStaff || 'Staff',
      action: 'SCHEDULE_APPOINTMENT',
      module: 'CRM_PIPELINE',
      target: lead.posterName,
      status: 'SUCCESS',
      details: { appointmentId: appt.id, scheduledAt: appt.scheduledAt, type: appt.type }
    });

    return appt;
  }

  /**
   * Cập nhật trạng thái Lịch hẹn
   */
  updateAppointmentStatus(id, { status, notes }) {
    const appt = this.appointments.find(a => a.id === id);
    if (!appt) throw new Error(`Không tìm thấy lịch hẹn ID ${id}`);

    appt.status = status;
    if (notes) appt.notes = (appt.notes ? appt.notes + '\n' : '') + notes;
    appt.updatedAt = new Date().toISOString();
    this._saveAppointments();

    // Nếu hoàn thành phỏng vấn / xem nhà, tự chuyển stage
    if (status === 'COMPLETED') {
      const nextStage = appt.type === 'VIEWING' ? 'VIEWED' : 'INTERVIEWED';
      try {
        this.moveStage({
          leadId: appt.leadId,
          targetStage: nextStage,
          note: `Hoàn tất lịch hẹn ${appt.type}`,
          staffName: appt.assignedStaff
        });
      } catch (e) {
        logger.warn(`[PIPELINE_ENGINE] Không thể tự chuyển stage: ${e.message}`);
      }
    }

    return appt;
  }

  /**
   * Lấy danh sách lịch hẹn
   */
  getAppointments({ industry, status, date } = {}) {
    let list = [...this.appointments];
    if (industry && industry !== 'ALL') {
      list = list.filter(a => a.industry === industry);
    }
    if (status && status !== 'ALL') {
      list = list.filter(a => a.status === status);
    }
    if (date) {
      list = list.filter(a => a.scheduledAt && a.scheduledAt.startsWith(date));
    }
    return list;
  }
}

module.exports = new PipelineEngine();
