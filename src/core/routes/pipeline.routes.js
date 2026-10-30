/**
 * pipeline.routes.js - API Định Tuyến Pipeline Kép & Phân Bổ Doanh Thu
 * Section 15 & 16 Master Prompt
 */
const express = require('express');
const router = express.Router();
const pipelineEngine = require('../services/pipelineEngine');
const revenueAttributionService = require('../services/revenueAttributionService');

// 1. Lấy cấu hình các Stage
router.get('/stages', (req, res) => {
  try {
    const { industry } = req.query;
    const stages = pipelineEngine.getPipelineStages(industry);
    res.json({ success: true, data: stages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Lấy dữ liệu Kanban Board
router.get('/kanban', (req, res) => {
  try {
    const { industry } = req.query;
    const board = pipelineEngine.getKanbanBoard(industry);
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Di chuyển Stage của Lead
router.post('/move', (req, res) => {
  try {
    const { leadId, targetStage, note, staffName } = req.body;
    const result = pipelineEngine.moveStage({ leadId, targetStage, note, staffName });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Quản lý Lịch hẹn (Appointments)
router.get('/appointments', (req, res) => {
  try {
    const { industry, status, date } = req.query;
    const list = pipelineEngine.getAppointments({ industry, status, date });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/appointments', (req, res) => {
  try {
    const appt = pipelineEngine.scheduleAppointment(req.body);
    res.status(201).json({ success: true, data: appt });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/appointments/:id/status', (req, res) => {
  try {
    const { status, notes } = req.body;
    const appt = pipelineEngine.updateAppointmentStatus(req.params.id, { status, notes });
    res.json({ success: true, data: appt });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Báo cáo Phân Bổ Doanh Thu (Revenue Attribution)
router.get('/attribution', (req, res) => {
  try {
    const report = revenueAttributionService.getAttributionReport();
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
