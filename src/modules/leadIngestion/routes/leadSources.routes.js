/**
 * leadSources.routes.js - REST API Controller Quản Lý Nguồn Dữ Liệu Lead (Lead Sources)
 * -------------------------------------------------------------------------------------
 * Tuân thủ Section 23 & 29 Master Prompt
 */
const express = require('express');
const router = express.Router();
const leadSourceManager = require('../services/leadSourceManager');
const leadIngestionPipeline = require('../services/leadIngestionPipeline');
const ingestionJobQueue = require('../services/ingestionJobQueue');
const auditLogger = require('../../../core/services/auditLogger');

// 1. Lấy danh sách toàn bộ nguồn dữ liệu
router.get('/', (req, res) => {
  try {
    const sources = leadSourceManager.getAll();
    res.json({ success: true, data: sources });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Thêm nguồn dữ liệu mới
router.post('/', (req, res) => {
  try {
    const newSource = leadSourceManager.addSource(req.body);
    auditLogger.log({
      actor: 'Admin',
      action: 'ADD_LEAD_SOURCE',
      module: 'LEAD_INGESTION',
      target: newSource.name,
      status: 'SUCCESS',
      details: newSource
    });
    res.status(201).json({ success: true, data: newSource });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Lấy thông tin chi tiết một nguồn
router.get('/:id', (req, res) => {
  try {
    const source = leadSourceManager.getById(req.params.id);
    if (!source) return res.status(404).json({ success: false, error: 'Không tìm thấy nguồn' });
    res.json({ success: true, data: source });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Cập nhật cấu hình nguồn
router.patch('/:id', (req, res) => {
  try {
    const updated = leadSourceManager.updateSource(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Xóa nguồn
router.delete('/:id', (req, res) => {
  try {
    const removed = leadSourceManager.removeSource(req.params.id);
    auditLogger.log({
      actor: 'Admin',
      action: 'REMOVE_LEAD_SOURCE',
      module: 'LEAD_INGESTION',
      target: removed.name,
      status: 'SUCCESS',
      details: { id: req.params.id }
    });
    res.json({ success: true, message: 'Đã xóa nguồn dữ liệu thành công', data: removed });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 6. Kích hoạt đồng bộ ngay cho 1 nguồn (Sync Now)
router.post('/:id/sync', async (req, res) => {
  try {
    const result = await leadIngestionPipeline.syncSource(req.params.id, req.body);
    res.json({ success: true, message: `Đồng bộ nguồn ${result.sourceName} thành công!`, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Tạm dừng nguồn (Pause)
router.post('/:id/pause', (req, res) => {
  try {
    const paused = leadSourceManager.pauseSource(req.params.id);
    res.json({ success: true, data: paused });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Tiếp tục nguồn (Resume)
router.post('/:id/resume', (req, res) => {
  try {
    const resumed = leadSourceManager.resumeSource(req.params.id);
    res.json({ success: true, data: resumed });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 9. Lấy nhật ký đồng bộ của nguồn
router.get('/:id/logs', (req, res) => {
  try {
    const logs = ingestionJobQueue.getLogs(30, req.params.id);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
