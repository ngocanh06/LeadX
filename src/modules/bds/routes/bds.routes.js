/**
 * bds.routes.js - API Router chuyên trách cho Module Bất Động Sản (Real Estate Engine)
 * Bao gồm:
 * - Quản lý Kho Căn Hộ & Đồng bộ Google Sheets BĐS
 * - Quản lý Danh sách Hội Nhóm Facebook BĐS (Đà Nẵng & Toàn Quốc)
 * - Điều khiển Chiến dịch Đăng bài Căn Hộ Tự Động (BDS Controller)
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const config = require('../../../config');
const apartmentManager = require('../services/apartmentManager');
const bdsGroupManager = require('../services/bdsGroupManager');
const accountManager = require('../../../core/services/accountManager');
const groupPoster = require('../../../core/automation/groupPoster');
const groupVerifier = require('../../recruitment/automation/groupVerifier');
const groupJoiner = require('../../recruitment/automation/groupJoiner');
const groupScraper = require('../../recruitment/automation/groupScraper');

const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
const imagesDir = path.join(rootDir, 'data/images');

// =========================================================
// 1. APARTMENT REPOSITORY & GOOGLE SHEETS
// =========================================================

// Lấy danh sách căn hộ theo bộ lọc
router.get('/apartments', (req, res) => {
  try {
    const filters = {
      city: req.query.city,
      district: req.query.district,
      roomType: req.query.roomType,
      status: req.query.status,
      search: req.query.search,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice
    };
    const list = apartmentManager.getAll(filters);
    const stats = apartmentManager.getStats();
    res.json({
      success: true,
      total: list.length,
      data: list,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thống kê KPI kho căn hộ
router.get('/apartments/stats', (req, res) => {
  try {
    const stats = apartmentManager.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cấu hình Google Sheets cho Căn hộ BĐS
router.get('/apartments/sheet-config', (req, res) => {
  res.json({ success: true, url: apartmentManager.getSheetUrl() });
});

router.post('/apartments/sheet-config', (req, res) => {
  try {
    const { url } = req.body || {};
    apartmentManager.setSheetUrl(url);
    res.json({ success: true, message: 'Đã lưu liên kết Google Sheets Căn hộ!', url: apartmentManager.getSheetUrl() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Đồng bộ trực tiếp từ Google Sheets
router.post('/apartments/sync-sheet', async (req, res) => {
  try {
    const { url } = req.body || {};
    const result = await apartmentManager.syncFromGoogleSheet(url);
    const stats = apartmentManager.getStats();
    res.json({
      success: true,
      message: `Đồng bộ thành công! Tổng cộng ${result.total} căn hộ (${result.addedCount} thêm mới, ${result.updatedCount} cập nhật).`,
      data: result,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `Lỗi đồng bộ Google Sheets: ${err.message}` });
  }
});

// Lấy chi tiết 1 căn hộ
router.get('/apartments/:id', (req, res) => {
  try {
    const apt = apartmentManager.getById(req.params.id);
    if (!apt) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy căn hộ.' });
    }
    res.json({ success: true, data: apt });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Tạo mẫu bài đăng tự động chuẩn SEO từ thông tin căn hộ
router.get('/apartments/:id/template', (req, res) => {
  try {
    const template = apartmentManager.generatePostTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy căn hộ để tạo mẫu bài.' });
    }
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm căn hộ mới thủ công
router.post('/apartments', (req, res) => {
  try {
    const newApt = apartmentManager.add(req.body);
    res.json({
      success: true,
      message: 'Đã thêm căn hộ mới vào kho BĐS!',
      data: newApt,
      stats: apartmentManager.getStats()
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Chỉnh sửa căn hộ
router.put('/apartments/:id', (req, res) => {
  try {
    const updated = apartmentManager.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy căn hộ để cập nhật.' });
    }
    res.json({
      success: true,
      message: 'Đã cập nhật thông tin căn hộ!',
      data: updated,
      stats: apartmentManager.getStats()
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Xóa căn hộ khỏi kho
router.delete('/apartments/:id', (req, res) => {
  try {
    const success = apartmentManager.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy căn hộ cần xóa.' });
    }
    res.json({
      success: true,
      message: 'Đã xóa căn hộ khỏi danh sách!',
      stats: apartmentManager.getStats()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================
// 2. BDS FACEBOOK GROUPS MANAGEMENT
// =========================================================

// Lấy danh sách nhóm BĐS
router.get('/bds/groups', (req, res) => {
  try {
    const { province, district, category, status, search, accountId } = req.query;
    const list = bdsGroupManager.getGroups({ province, district, category, status, search, accountId });
    const stats = bdsGroupManager.getGroupStats(accountId);
    res.json({
      success: true,
      total: list.length,
      data: list,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thống kê nhóm BĐS
router.get('/bds/groups/stats', (req, res) => {
  try {
    const { accountId } = req.query;
    const stats = bdsGroupManager.getGroupStats(accountId);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm 1 nhóm BĐS
router.post('/bds/groups', (req, res) => {
  try {
    const { name, url, province, district, category, members } = req.body || {};
    if (!name || !url) {
      return res.status(400).json({ success: false, message: 'Tên nhóm và liên kết URL là bắt buộc!' });
    }
    const newGroup = bdsGroupManager.addGroup({ name, url, province, district, category, members });
    res.json({ success: true, message: 'Đã thêm nhóm BĐS thành công!', data: newGroup });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm hàng loạt nhóm BĐS từ text/link
router.post('/bds/groups/bulk', (req, res) => {
  try {
    const { rawText, defaultProvince, defaultCategory } = req.body || {};
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng dán danh sách liên kết nhóm!' });
    }
    const result = bdsGroupManager.addGroupsBulk(rawText, defaultProvince, defaultCategory);
    res.json({
      success: true,
      message: `Đã nạp ${result.added} nhóm mới (${result.skipped} bị trùng/bỏ qua)`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật thông tin nhóm BĐS
router.put('/bds/groups/:id', (req, res) => {
  try {
    const updated = bdsGroupManager.updateGroup(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm BĐS.' });
    }
    res.json({ success: true, message: 'Đã cập nhật nhóm BĐS!', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa 1 nhóm BĐS
router.delete('/bds/groups/:id', (req, res) => {
  try {
    const success = bdsGroupManager.deleteGroup(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm BĐS để xóa.' });
    }
    res.json({ success: true, message: 'Đã xóa nhóm BĐS!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa hàng loạt nhóm BĐS theo danh sách ID
router.post('/bds/groups/bulk-delete', (req, res) => {
  try {
    const { ids } = req.body || {};
    const result = bdsGroupManager.deleteGroupsByIds(ids || []);
    res.json({
      success: true,
      message: `Đã xóa ${result.deletedCount} nhóm BĐS thành công!`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Đánh dấu tham gia / rời nhóm BĐS theo tài khoản
router.post('/bds/groups/:id/toggle-membership', (req, res) => {
  try {
    const { isJoined, accountId } = req.body || {};
    const group = bdsGroupManager.updateGroupMembership(req.params.id, isJoined, accountId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm BĐS.' });
    }
    res.json({
      success: true,
      message: isJoined ? 'Đã đánh dấu đã tham gia nhóm!' : 'Đã hủy đánh dấu tham gia nhóm!',
      data: group
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Sao chép trạng thái tham gia nhóm giữa các tài khoản
router.post('/bds/groups/copy-membership', (req, res) => {
  try {
    const { sourceAccountId, targetAccountId } = req.body || {};
    if (!sourceAccountId || !targetAccountId) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn tài khoản nguồn và tài khoản đích!' });
    }
    const result = bdsGroupManager.copyMemberships(sourceAccountId, targetAccountId);
    res.json({
      success: true,
      message: `Đã sao chép trạng thái tham gia sang tài khoản đích thành công!`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Đặt lại (reset) trạng thái nhóm cho tài khoản
router.post('/bds/groups/reset-membership', (req, res) => {
  try {
    const { accountId } = req.body || {};
    const result = bdsGroupManager.resetMemberships(accountId);
    res.json({
      success: true,
      message: 'Đã đặt lại trạng thái tham gia nhóm về Chưa tham gia!',
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Dọn dẹp các nhóm chưa tham gia
router.post('/bds/groups/clean-unjoined', (req, res) => {
  try {
    const { accountId } = req.body || {};
    const result = bdsGroupManager.deleteUnjoinedGroups({ accountId });
    res.json({
      success: true,
      message: `Đã xóa ${result.deletedCount} nhóm chưa tham gia khỏi danh sách!`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa toàn bộ nhóm BĐS
router.post('/bds/groups/clear-all', (req, res) => {
  try {
    const count = bdsGroupManager.clearAll();
    res.json({ success: true, message: `Đã xóa sạch ${count} nhóm BĐS!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================
// 2.2. BDS GROUP AUTOMATION TOOLS (QUÉT NHÓM, XIN VÀO NHÓM, REALTIME VERIFY)
// =========================================================

// Đồng bộ tự động các nhóm BĐS đã tham gia của tài khoản từ Facebook
router.post('/bds/groups/sync-membership', async (req, res) => {
  try {
    const { accountId } = req.body || {};
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id;
    const acc = accountManager.loadAccounts().find(a => a.id === targetAccountId);
    if (!acc) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });

    if (acc.status === 'CHECKPOINT') {
      return res.status(400).json({ success: false, message: 'Tài khoản đang bị Checkpoint, không thể đồng bộ.' });
    }

    const syncRes = await groupVerifier.syncJoinedGroupsFromFacebook(targetAccountId, 'bds');
    const stats = bdsGroupManager.getGroupStats(targetAccountId);
    res.json({
      success: true,
      message: `Đồng bộ nhóm BĐS chuẩn xác từ Facebook thành công! Đã vào: ${syncRes.joinedCount} nhóm | Chưa vào: ${syncRes.unjoinedCount} nhóm.`,
      matchedCount: syncRes.joinedCount,
      unjoinedCount: syncRes.unjoinedCount,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `Lỗi đồng bộ nhóm BĐS: ${err.message}` });
  }
});

// Tính năng kiểm tra trạng thái Real-time từng nhóm BĐS
router.post('/bds/groups/:id/check-realtime', async (req, res) => {
  try {
    const { id } = req.params;
    const { accountId } = req.body || {};
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id;

    const result = await groupVerifier.verifySingleGroup(id, targetAccountId, 'bds');
    const stats = bdsGroupManager.getGroupStats(targetAccountId);

    res.json({
      success: true,
      message: `Đã kiểm tra nhóm BĐS "${result.groupName}": ${result.isJoined ? '✅ ĐÃ THAM GIA' : (result.isPending ? '⏳ ĐANG CHỜ DUYỆT' : '❌ CHƯA VÀO NHÓM')} (${result.note})`,
      data: result,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Tính năng quét kiểm tra Real-time hàng loạt nhóm BĐS
router.post('/bds/groups/verify-batch/start', async (req, res) => {
  try {
    const { groupIds, accountId, delayMin, delayMax } = req.body || {};
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id;

    if (groupVerifier.isRunning) {
      return res.status(400).json({ success: false, message: 'Tiến trình kiểm tra Real-time đang hoạt động. Vui lòng chờ hoàn tất.' });
    }

    // Chạy bất đồng bộ
    groupVerifier.verifyBatchGroups({
      groupIds: Array.isArray(groupIds) ? groupIds : [],
      accountId: targetAccountId,
      delayMin: parseInt(delayMin, 10) || 2,
      delayMax: parseInt(delayMax, 10) || 4,
      groupType: 'bds'
    }).catch(err => {
      console.error('[GroupVerifier BDS] Error:', err.message);
    });

    res.json({
      success: true,
      message: 'Đã khởi động tiến trình quét kiểm tra Real-time toàn bộ nhóm BĐS!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bds/groups/verify-batch/status', (req, res) => {
  res.json({
    success: true,
    data: groupVerifier.getStatus()
  });
});

router.post('/bds/groups/verify-batch/pause', (req, res) => {
  const ok = groupVerifier.pause();
  res.json({ success: ok, message: ok ? 'Đã tạm dừng tiến trình kiểm tra.' : 'Không thể tạm dừng.' });
});

router.post('/bds/groups/verify-batch/resume', (req, res) => {
  const ok = groupVerifier.resume();
  res.json({ success: ok, message: ok ? 'Đang tiếp tục kiểm tra nhóm...' : 'Không thể tiếp tục.' });
});

router.post('/bds/groups/verify-batch/stop', (req, res) => {
  const ok = groupVerifier.stop();
  res.json({ success: ok, message: ok ? 'Đã dừng tiến trình kiểm tra.' : 'Không có tiến trình đang chạy.' });
});

// Tính năng tự động xin vào nhóm BĐS (Auto Group Joiner)
router.post('/bds/groups/join/start', async (req, res) => {
  try {
    const { groupIds, accountId, delayMin, delayMax, autoAnswer } = req.body || {};
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một hội nhóm BĐS để xin tham gia.' });
    }

    const targetAccId = accountId || accountManager.getCurrentAccount()?.id;
    const targetAcc = accountManager.loadAccounts().find(a => a.id === targetAccId);
    if (targetAcc && targetAcc.status === 'CHECKPOINT') {
      return res.status(400).json({
        success: false,
        message: `Tài khoản "${targetAcc.name}" đang bị Facebook yêu cầu xác minh danh tính. Vui lòng hoàn tất xác minh trước khi xin vào nhóm!`
      });
    }

    if (groupJoiner.isRunning) {
      return res.status(400).json({ success: false, message: 'Tiến trình xin vào nhóm đang hoạt động.' });
    }

    // Chạy bất đồng bộ
    groupJoiner.joinGroups({
      groupIds,
      accountId: accountId || null,
      delayMin: parseInt(delayMin, 10) || 15,
      delayMax: parseInt(delayMax, 10) || 30,
      autoAnswer: (autoAnswer || '').trim(),
      groupType: 'bds'
    }).catch(err => {
      console.error('[GroupJoiner BDS] Error:', err.message);
    });

    res.json({
      success: true,
      message: `Đã khởi động Auto-Joiner cho ${groupIds.length} nhóm BĐS đã chọn!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bds/groups/join/pause', (req, res) => {
  const paused = groupJoiner.pause();
  res.json({ success: paused, message: paused ? 'Đã tạm dừng tiến trình.' : 'Không thể tạm dừng.' });
});

router.post('/bds/groups/join/resume', (req, res) => {
  const resumed = groupJoiner.resume();
  res.json({ success: resumed, message: resumed ? 'Đã tiếp tục tiến trình.' : 'Không thể tiếp tục.' });
});

router.post('/bds/groups/join/stop', (req, res) => {
  const stopped = groupJoiner.stop();
  res.json({ success: stopped, message: stopped ? 'Đã gửi lệnh dừng tiến trình.' : 'Không thể dừng.' });
});

router.get('/bds/groups/join/status', (req, res) => {
  res.json({
    success: true,
    data: groupJoiner.getStatus()
  });
});

// Tính năng Quét Nhóm BĐS Tự Động (Auto Group Scraper for BDS)
router.post('/bds/groups/scrape/start', async (req, res) => {
  try {
    const { keyword, province, minMembers, privacyFilter, maxResults } = req.body || {};
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập từ khóa tìm kiếm nhóm BĐS (ví dụ: Thuê căn hộ Đà Nẵng).' });
    }

    if (groupScraper.isScraping) {
      return res.status(400).json({ success: false, message: 'Đang có tiến trình quét nhóm hoạt động. Vui lòng chờ hoàn tất.' });
    }

    groupScraper.scrapeGroups({
      keyword: keyword.trim(),
      province: (province || '').trim(),
      minMembers: parseInt(minMembers, 10) || 0,
      privacyFilter: privacyFilter || 'ALL',
      maxResults: parseInt(maxResults, 10) || 30
    }).catch(err => {
      console.error('[GroupScraper BDS] Error:', err.message);
    });

    res.json({
      success: true,
      message: `Đã khởi động tiến trình quét nhóm BĐS với từ khóa "${keyword}".`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bds/groups/scrape/status', (req, res) => {
  res.json({
    success: true,
    data: groupScraper.getStatus()
  });
});

router.post('/bds/groups/scrape/save', (req, res) => {
  try {
    const { groups } = req.body || {};
    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có hội nhóm nào được chọn để lưu.' });
    }

    const result = bdsGroupManager.addBulkGroups(groups);
    res.json({
      success: true,
      message: `Đã nạp thành công ${result.added} nhóm BĐS mới (${result.updated} nhóm cập nhật) vào kho nhóm BĐS!`,
      added: result.added,
      updated: result.updated,
      total: result.total
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================
// 3. BDS POSTING CAMPAIGN CONTROLLER
// =========================================================

// Khởi chạy chiến dịch đăng tin căn hộ BĐS vào các nhóm
router.post('/bds/campaign/start', async (req, res) => {
  try {
    const { apartmentId, customContent, groupIds, selectedImages, imagePaths, delayConfig } = req.body || {};

    const currentAcc = accountManager.getCurrentAccount();
    if (currentAcc && currentAcc.status === 'CHECKPOINT') {
      return res.status(400).json({
        success: false,
        message: `Tài khoản "${currentAcc.name}" đang bị Facebook yêu cầu xác minh danh tính (Checkpoint 282). Vui lòng hoàn tất xác minh trước khi đăng bài!`
      });
    }

    if (!apartmentId) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn căn hộ cần đăng tin.' });
    }

    const apt = apartmentManager.getById(apartmentId);
    if (!apt) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin căn hộ đã chọn.' });
    }

    const allBdsGroups = bdsGroupManager.loadGroups();
    const targetGroups = groupIds && groupIds.length > 0
      ? allBdsGroups.filter(g => groupIds.includes(g.id))
      : allBdsGroups;

    if (targetGroups.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 Hội nhóm BĐS để đăng bài.' });
    }

    // Soạn nội dung bài đăng
    const postContent = (customContent && customContent.trim())
      ? customContent.trim()
      : apartmentManager.generatePostTemplate(apt.id);

    const priceText = apt.price >= 1000000
      ? `${(apt.price / 1000000).toLocaleString('vi-VN')} Triệu`
      : `${apt.price.toLocaleString('vi-VN')} đ`;

    const postJob = {
      id: apt.id,
      title: apt.title,
      company: 'LeadX Real Estate',
      province: apt.city || 'Đà Nẵng',
      district: apt.district || 'Sơn Trà',
      content: postContent,
      description: postContent,
      requirements: apt.furnitureStatus || 'Full nội thất',
      benefits: (apt.features || []).join(', '),
      salary: priceText,
      contact: `${apt.contact?.phone || '0905123456'} (${apt.contact?.agentName || 'Chuyên Viên BĐS'})`,
      category: 'Bất Động Sản',
      isApartment: true
    };

    // Chuẩn hóa file ảnh nếu có
    let resolvedImages = [];
    if (Array.isArray(imagePaths) && imagePaths.length > 0) {
      resolvedImages = imagePaths.map(p => path.isAbsolute(p) ? p : path.join(imagesDir, p)).filter(fs.existsSync);
    } else if (Array.isArray(selectedImages) && selectedImages.length > 0) {
      resolvedImages = selectedImages.map(img => {
        const fn = typeof img === 'string' ? img : img.filename;
        return path.join(imagesDir, fn);
      }).filter(fs.existsSync);
    }

    // Kích hoạt Puppeteer Poster
    const result = await groupPoster.startCampaign(postJob, targetGroups, resolvedImages, delayConfig);

    // Ghi nhận lượt đăng cho căn hộ
    apartmentManager.recordPost(apt.id);

    // Đánh dấu các nhóm đã đăng
    targetGroups.forEach(g => {
      bdsGroupManager.markGroupPosted(g.id, { title: apt.title });
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bds/campaign/pause', (req, res) => {
  res.json(groupPoster.pauseCampaign());
});

router.post('/bds/campaign/resume', (req, res) => {
  res.json(groupPoster.resumeCampaign());
});

router.post('/bds/campaign/stop', (req, res) => {
  res.json(groupPoster.stopCampaign());
});

router.get('/bds/campaign/status', (req, res) => {
  res.json({
    success: true,
    data: groupPoster.getStatus(),
    logs: groupPoster.getLogs()
  });
});

module.exports = router;
