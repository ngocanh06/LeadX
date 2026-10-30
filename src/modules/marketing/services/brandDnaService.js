/**
 * brandDnaService.js - Phân Tích Bài Viết Cũ & Trích Xuất Brand Writing DNA
 * Giúp AI hiểu sâu sắc văn phong, ngữ điệu, nhịp điệu tự nhiên của từng Fanpage
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');
const brandProfileService = require('./brandProfileService');

class BrandDnaService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.dnaFile = path.resolve(this.rootDir, 'data/marketing/brand_dna.json');
    this.postsFile = path.resolve(this.rootDir, 'data/marketing/past_posts.json');

    this._ensureDirs();
    this.dnaStore = this._loadJson(this.dnaFile, {});
    this.postsStore = this._loadJson(this.postsFile, {});
  }

  _ensureDirs() {
    const dir = path.dirname(this.dnaFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _loadJson(filePath, defaultValue = {}) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) || defaultValue;
      }
    } catch (err) {
      logger.error(`[BRAND_DNA] Lỗi nạp ${filePath}: ${err.message}`);
    }
    return defaultValue;
  }

  _saveJson(filePath, data) {
    try {
      this._ensureDirs();
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[BRAND_DNA] Lỗi lưu ${filePath}: ${err.message}`);
    }
  }

  /**
   * Lấy Brand Writing DNA của một Brand Profile
   */
  getBrandDNA(brandProfileId) {
    return this.dnaStore[brandProfileId] || null;
  }

  /**
   * Lấy danh sách bài viết cũ đã nạp của một Brand Profile
   */
  getPastPosts(brandProfileId) {
    return this.postsStore[brandProfileId] || [];
  }

  /**
   * Phân tích danh sách bài viết cũ để trích xuất Brand Writing DNA
   * @param {string} brandProfileId 
   * @param {Array<string|Object>} posts - Danh sách chuỗi bài viết hoặc object { text, date }
   */
  analyzePastPosts(brandProfileId, rawPosts = []) {
    const profile = brandProfileService.getProfileById(brandProfileId);
    if (!profile) throw new Error(`Không tìm thấy Brand Profile với ID: ${brandProfileId}`);

    if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
      throw new Error('Vui lòng cung cấp ít nhất 1 bài viết mẫu để phân tích văn phong.');
    }

    // Chuẩn hóa danh sách bài viết
    const cleanPosts = rawPosts.map(p => {
      const text = typeof p === 'string' ? p : (p.text || p.content || p.postText || '');
      return text.trim();
    }).filter(t => t.length > 20);

    if (cleanPosts.length === 0) {
      throw new Error('Nội dung các bài viết quá ngắn hoặc không hợp lệ để phân tích.');
    }

    // Lưu danh sách bài viết
    if (!this.postsStore[brandProfileId]) this.postsStore[brandProfileId] = [];
    cleanPosts.forEach(text => {
      if (!this.postsStore[brandProfileId].some(existing => existing.text === text)) {
        this.postsStore[brandProfileId].unshift({
          id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          text,
          importedAt: new Date().toISOString()
        });
      }
    });
    this._saveJson(this.postsFile, this.postsStore);

    // BẮT ĐẦU PHÂN TÍCH THỐNG KÊ NGÔN NGỮ & NHỊP ĐIỆU (LINGUISTIC & RHYTHMIC ANALYSIS)
    let totalWords = 0;
    let totalSentences = 0;
    let totalParagraphs = 0;
    const allHooks = [];
    const allCtas = [];
    const emojiCounts = {};
    let totalEmojis = 0;
    let totalHashtags = 0;
    const wordFrequency = {};
    const sentenceLengths = [];

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const hashtagRegex = /#[\p{L}\p{N}_]+/gu;

    cleanPosts.forEach(text => {
      // 1. Phân đoạn & câu
      const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
      totalParagraphs += paragraphs.length;

      // Câu mở đầu (Hook)
      if (paragraphs.length > 0) {
        const firstSentence = paragraphs[0].split(/[.?!]\s+/)[0];
        if (firstSentence) allHooks.push(firstSentence.trim());
      }

      // Câu kêu gọi kết bài (CTA)
      if (paragraphs.length > 0) {
        const lastPara = paragraphs[paragraphs.length - 1];
        allCtas.push(lastPara.trim());
      }

      // 2. Phân tích câu
      const sentences = text.split(/[.?!…]+/).map(s => s.trim()).filter(s => s.length > 3);
      totalSentences += sentences.length;

      sentences.forEach(s => {
        const words = s.split(/\s+/).filter(Boolean);
        sentenceLengths.push(words.length);
      });

      // 3. Phân tích từ
      const words = text.toLowerCase().replace(/[.,!?:;()\[\]"'/\\-]/g, ' ').split(/\s+/).filter(w => w.length > 1);
      totalWords += words.length;

      words.forEach(w => {
        wordFrequency[w] = (wordFrequency[w] || 0) + 1;
      });

      // 4. Emoji & Hashtags
      const emojis = text.match(emojiRegex) || [];
      totalEmojis += emojis.length;
      emojis.forEach(e => { emojiCounts[e] = (emojiCounts[e] || 0) + 1; });

      const hashtags = text.match(hashtagRegex) || [];
      totalHashtags += hashtags.length;
    });

    const postCount = cleanPosts.length;
    const avgWordsPerPost = Math.round(totalWords / postCount);
    const avgSentencesPerPost = Math.round(totalSentences / postCount);
    const avgWordsPerSentence = sentenceLengths.length > 0 ? (totalWords / sentenceLengths.length).toFixed(1) : 12;
    const avgEmojisPerPost = (totalEmojis / postCount).toFixed(1);
    const avgHashtagsPerPost = (totalHashtags / postCount).toFixed(1);

    // Đo độ biến thiên độ dài câu (Human Rhythm Score: 0 - 100)
    // Người viết thật luôn có câu rất ngắn xen kẽ câu dài (độ lệch chuẩn cao). AI thường có câu dài đều nhau (độ lệch chuẩn thấp).
    let variance = 0;
    if (sentenceLengths.length > 1) {
      const mean = totalWords / sentenceLengths.length;
      const sumDiffSquares = sentenceLengths.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0);
      variance = Math.sqrt(sumDiffSquares / sentenceLengths.length);
    }
    const humanRhythmScore = Math.min(98, Math.max(65, Math.round(60 + variance * 4)));

    // Formality Level (Độ trang trọng từ 1 đến 10)
    let formalMarkers = 0;
    let casualMarkers = 0;
    const formalKeywords = ['kính gửi', 'trân trọng', 'chúng tôi xin thông báo', 'quy định', 'cam kết', 'tiêu chuẩn'];
    const casualKeywords = ['nhé', 'nha', 'á', 'ơi', 'ha', 'mình', 'bữa nay', 'thôi', 'gì đâu', 'hen'];

    const fullCorp = cleanPosts.join(' ').toLowerCase();
    formalKeywords.forEach(k => { if (fullCorp.includes(k)) formalMarkers += 2; });
    casualKeywords.forEach(k => { if (fullCorp.includes(k)) casualMarkers += 3; });

    let formalityScore = 5;
    if (casualMarkers > formalMarkers) formalityScore = Math.max(2, 6 - Math.round(casualMarkers / 2));
    else if (formalMarkers > casualMarkers) formalityScore = Math.min(9, 5 + Math.round(formalMarkers / 2));

    // Top Hook Patterns
    const topHooks = allHooks.slice(0, 5);
    const topCtas = allCtas.slice(0, 4);

    // Trích xuất các quy tắc viết tóm tắt
    const extractedRules = [
      `Độ dài bài lý tưởng: ${avgWordsPerPost} từ (~${avgSentencesPerPost} câu)`,
      `Nhịp điệu câu tự nhiên: Trung bình ${avgWordsPerSentence} từ/câu, có độ biến thiên cao (Điểm tự nhiên: ${humanRhythmScore}/100)`,
      `Mức độ thân mật: ${formalityScore <= 4 ? 'Thân thiện, gần gũi như trò chuyện đời thường' : (formalityScore >= 7 ? 'Chuyên nghiệp, chuẩn mực' : 'Hài hòa, lịch thiệp')}`,
      `Mật độ biểu tượng cảm xúc: ~${avgEmojisPerPost} emoji/bài, không lạm dụng`,
      `Mật độ hashtag: ~${avgHashtagsPerPost} hashtag/bài đặt ở cuối nội dung`
    ];

    const brandDna = {
      brandProfileId,
      brandName: profile.brandName,
      totalPostsAnalyzed: postCount,
      lastAnalyzedAt: new Date().toISOString(),
      metrics: {
        avgWordsPerPost,
        avgSentencesPerPost,
        avgWordsPerSentence: parseFloat(avgWordsPerSentence),
        humanRhythmScore,
        formalityScore,
        avgEmojisPerPost: parseFloat(avgEmojisPerPost),
        avgHashtagsPerPost: parseFloat(avgHashtagsPerPost)
      },
      hooks: topHooks,
      ctas: topCtas,
      topEmojis: Object.keys(emojiCounts).slice(0, 5),
      extractedRules,
      dnaSummary: `Giọng văn đặc trưng mang tính ${profile.toneOfVoice?.primary || 'chân thực'}. Cấu trúc câu nhịp nhàng, trung bình ${avgWordsPerPost} từ, ưu tiên sự tự nhiên và kết nối người đọc.`
    };

    this.dnaStore[brandProfileId] = brandDna;
    this._saveJson(this.dnaFile, this.dnaStore);

    logger.info(`[BRAND_DNA] Đã trích xuất thành công Brand Writing DNA cho: ${profile.brandName} (${postCount} bài)`);
    return brandDna;
  }
}

module.exports = new BrandDnaService();
