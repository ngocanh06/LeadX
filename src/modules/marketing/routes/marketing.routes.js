/**
 * marketing.routes.js - API Router Phân Hệ AI Marketing Engine
 */
const express = require('express');
const router = express.Router();
const brandProfileService = require('../services/brandProfileService');
const brandDnaService = require('../services/brandDnaService');

// === 1. BRAND PROFILES (HỒ SƠ THƯƠNG HIỆU & DNA) ===

// Danh sách tất cả Brand Profiles kèm trạng thái DNA
router.get('/brands', (req, res) => {
  try {
    const profiles = brandProfileService.getAllProfiles();
    const enriched = profiles.map(p => {
      const dna = brandDnaService.getBrandDNA(p.id);
      const pastPosts = brandDnaService.getPastPosts(p.id);
      return {
        ...p,
        hasDna: Boolean(dna),
        dnaSummary: dna ? dna.dnaSummary : null,
        dnaMetrics: dna ? dna.metrics : null,
        totalImportedPosts: pastPosts.length
      };
    });
    res.json({ success: true, total: enriched.length, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Chi tiết 1 Brand Profile
router.get('/brands/:id', (req, res) => {
  try {
    const profile = brandProfileService.getProfileById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Brand Profile' });
    }
    const dna = brandDnaService.getBrandDNA(profile.id);
    const pastPosts = brandDnaService.getPastPosts(profile.id);

    res.json({
      success: true,
      data: {
        ...profile,
        dna,
        pastPosts
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Tạo mới Brand Profile
router.post('/brands', (req, res) => {
  try {
    const created = brandProfileService.createProfile(req.body);
    res.json({ success: true, message: 'Đã tạo Brand Profile thành công', data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Cập nhật Brand Profile
router.put('/brands/:id', (req, res) => {
  try {
    const updated = brandProfileService.updateProfile(req.params.id, req.body);
    res.json({ success: true, message: 'Đã cập nhật Brand Profile', data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Xóa Brand Profile
router.delete('/brands/:id', (req, res) => {
  try {
    brandProfileService.deleteProfile(req.params.id);
    res.json({ success: true, message: 'Đã xóa Brand Profile thành công' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Cập nhật ma trận Content Pillars
router.post('/brands/:id/pillars', (req, res) => {
  try {
    const pillars = brandProfileService.updatePillars(req.params.id, req.body.pillars);
    res.json({ success: true, message: 'Đã cập nhật ma trận Content Pillars', data: pillars });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Thêm bài viết mẫu (Example Post)
router.post('/brands/:id/examples', (req, res) => {
  try {
    const examples = brandProfileService.addExamplePost(req.params.id, req.body.text);
    res.json({ success: true, message: 'Đã thêm bài viết mẫu', data: examples });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Xóa bài viết mẫu
router.delete('/brands/:id/examples/:index', (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const examples = brandProfileService.deleteExamplePost(req.params.id, index);
    res.json({ success: true, message: 'Đã xóa bài viết mẫu', data: examples });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Phân tích bài viết cũ & trích xuất Brand Writing DNA
router.post('/brands/:id/analyze-posts', (req, res) => {
  try {
    const { posts } = req.body;
    const dna = brandDnaService.analyzePastPosts(req.params.id, posts);
    res.json({
      success: true,
      message: 'Đã trích xuất thành công Brand Writing DNA từ bài viết cũ',
      data: dna
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Lấy DNA đã phân tích
router.get('/brands/:id/dna', (req, res) => {
  try {
    const dna = brandDnaService.getBrandDNA(req.params.id);
    res.json({ success: true, data: dna });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 2. TOPIC GENERATOR (SINH ĐỀ TÀI THÔNG MINH) ===
const topicGeneratorService = require('../services/topicGeneratorService');

// Lấy danh sách đề tài của thương hiệu
router.get('/topics', (req, res) => {
  try {
    const { brandId, status } = req.query;
    if (!brandId) return res.status(400).json({ success: false, message: 'Thiếu brandId' });
    const topics = topicGeneratorService.getTopicsByBrand(brandId, status);
    res.json({ success: true, total: topics.length, data: topics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Sinh đề tài tự động theo Pillars & Brand Profile
router.post('/topics/generate', async (req, res) => {
  try {
    const { brandId, pillarId, count, customContext, objective } = req.body;
    if (!brandId) return res.status(400).json({ success: false, message: 'Thiếu brandId' });

    const topics = await topicGeneratorService.generateTopics({
      brandId,
      pillarId,
      count,
      customContext,
      objective
    });

    res.json({
      success: true,
      message: `Đã sinh thành công ${topics.length} đề tài mới`,
      data: topics
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật trạng thái đề tài
router.put('/topics/:id/status', (req, res) => {
  try {
    const updated = topicGeneratorService.updateTopicStatus(req.params.id, req.body.status);
    if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy topic' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 3. CONTENT QUALITY & ANTI-AI EVALUATION ===
const contentQualityService = require('../services/contentQualityService');

// Kiểm định chất lượng bài viết Anti-AI
router.post('/quality/evaluate', (req, res) => {
  try {
    const { text, brandId } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'Thiếu nội dung text' });

    let brandProfile = null;
    let brandDna = null;
    if (brandId) {
      brandProfile = brandProfileService.getProfileById(brandId);
      brandDna = brandDnaService.getBrandDNA(brandId);
    }

    const evaluation = contentQualityService.evaluate({
      text,
      brandProfile,
      brandDna
    });

    res.json({ success: true, data: evaluation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 4. CONTENT STUDIO & 3-ANGLES GENERATION ===
const marketingContentService = require('../services/marketingContentService');

// Sinh nội dung 3 Góc Nhìn (Storytelling, Educational, Conversational) + Visual Direction
router.post('/content/generate-angles', async (req, res) => {
  try {
    const { brandId, topic, customInstruction } = req.body;
    if (!brandId || !topic) {
      return res.status(400).json({ success: false, message: 'Thiếu brandId hoặc topic' });
    }

    const draft = await marketingContentService.generateMultiAngleContent({
      brandId,
      topic,
      customInstruction
    });

    res.json({
      success: true,
      message: 'Đã sinh thành công 3 biến thể nội dung kèm Visual Direction',
      data: draft
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Danh sách bản nháp
router.get('/content/drafts', (req, res) => {
  try {
    const { brandId } = req.query;
    if (!brandId) return res.status(400).json({ success: false, message: 'Thiếu brandId' });
    const drafts = marketingContentService.getDraftsByBrand(brandId);
    res.json({ success: true, total: drafts.length, data: drafts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Chi tiết bản nháp
router.get('/content/drafts/:id', (req, res) => {
  try {
    const draft = marketingContentService.getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ success: false, message: 'Không tìm thấy bản nháp' });
    res.json({ success: true, data: draft });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật bản nháp (sửa nội dung, đổi biến thể chọn, hoặc đổi trạng thái)
router.put('/content/drafts/:id', (req, res) => {
  try {
    const updated = marketingContentService.updateDraft(req.params.id, req.body);
    res.json({ success: true, message: 'Đã cập nhật bản nháp', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa bản nháp
router.delete('/content/drafts/:id', (req, res) => {
  try {
    marketingContentService.deleteDraft(req.params.id);
    res.json({ success: true, message: 'Đã xóa bản nháp thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

