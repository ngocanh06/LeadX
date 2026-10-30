/**
 * contentQualityService.js - Bộ Kiểm Định Chất Lượng & Chống Văn Phong AI (Anti-AI Guard)
 * Đảm bảo mọi nội dung xuất ra đều tự nhiên, giàu nhịp điệu con người và chuẩn Brand Voice
 */
const logger = require('../../../core/utils/logger');

// Bộ quy tắc mẫu khuôn sáo rỗng kinh điển của AI tiếng Việt
const UNIVERSAL_AI_CLICHES = [
  { pattern: /bạn có biết(\s+rằng)?/i, label: 'Khuôn mẫu AI: "Bạn có biết..."' },
  { pattern: /trong cuộc sống hiện đại/i, label: 'Khuôn mẫu AI: "Trong cuộc sống hiện đại..."' },
  { pattern: /trong thời đại 4\.0/i, label: 'Khuôn mẫu AI: "Trong thời đại 4.0..."' },
  { pattern: /không chỉ(\s+[\w\s]+)?\s+mà còn/i, label: 'Cấu trúc đối xứng máy móc: "Không chỉ... mà còn..."' },
  { pattern: /hãy cùng(\s+[\w\s]+)?\s+khám phá/i, label: 'Khuôn mẫu AI: "Hãy cùng khám phá..."' },
  { pattern: /chắc hẳn(\s+ai trong chúng ta)?/i, label: 'Khuôn mẫu AI: "Chắc hẳn ai trong chúng ta..."' },
  { pattern: /bạn đã bao giờ tự hỏi/i, label: 'Khuôn mẫu mở bài AI: "Bạn đã bao giờ tự hỏi..."' },
  { pattern: /đừng bỏ lỡ cơ hội vàng/i, label: 'Văn phong quảng cáo lỗi thời: "Cơ hội vàng..."' },
  { pattern: /giải pháp tối ưu/i, label: 'Khuôn sáo văn bản: "Giải pháp tối ưu..."' },
  { pattern: /vô vàn( điều)? lợi ích/i, label: 'Khuôn mẫu AI: "Vô vàn lợi ích..."' },
  { pattern: /hãy bắt đầu ngay hôm nay/i, label: 'Kêu gọi sáo rỗng: "Hãy bắt đầu ngay hôm nay..."' },
  { pattern: /chúng ta không thể phủ nhận/i, label: 'Văn phong nghị luận máy móc: "Không thể phủ nhận..."' },
  { pattern: /điều đặc biệt là/i, label: 'Khuôn mẫu AI: "Điều đặc biệt là..."' },
  { pattern: /có thể bạn chưa biết/i, label: 'Khuôn mẫu AI: "Có thể bạn chưa biết..."' }
];

class ContentQualityService {
  /**
   * Đánh giá chất lượng toàn diện của một bản nháp bài viết
   * @param {string} text - Nội dung bài viết
   * @param {Object} brandProfile - Hồ sơ thương hiệu
   * @param {Object} brandDna - DNA thương hiệu (nếu có)
   * @returns {Object} Kết quả kiểm định chi tiết
   */
  evaluate({ text, brandProfile, brandDna = null }) {
    if (!text || typeof text !== 'string') {
      return {
        overallScore: 0,
        passed: false,
        breakdown: { antiAiScore: 0, brandFitScore: 0, toneFitScore: 0, rhythmScore: 0, engagementScore: 0 },
        flags: [{ type: 'ERROR', message: 'Nội dung bài viết rỗng' }],
        suggestions: ['Vui lòng nhập nội dung cần kiểm định']
      };
    }

    const flags = [];
    const suggestions = [];

    // 1. KIỂM ĐỊNH ANTI-AI VÀ MẪU CẤM (Anti-AI Score)
    let aiClichéCount = 0;
    for (const item of UNIVERSAL_AI_CLICHES) {
      if (item.pattern.test(text)) {
        aiClichéCount++;
        flags.push({
          type: 'WARNING',
          category: 'ANTI_AI',
          message: item.label
        });
      }
    }

    // Kiểm tra Forbidden Patterns từ Brand Profile
    if (brandProfile && Array.isArray(brandProfile.forbiddenPatterns)) {
      for (const pattern of brandProfile.forbiddenPatterns) {
        if (text.toLowerCase().includes(pattern.toLowerCase())) {
          aiClichéCount += 1.5;
          flags.push({
            type: 'WARNING',
            category: 'BRAND_FORBIDDEN',
            message: `Vi phạm quy tắc thương hiệu cấm cụm từ: "${pattern}"`
          });
        }
      }
    }

    // Kiểm tra Forbidden Vocabulary
    if (brandProfile && brandProfile.vocabularyPreferences?.forbiddenTerms) {
      for (const term of brandProfile.vocabularyPreferences.forbiddenTerms) {
        if (text.toLowerCase().includes(term.toLowerCase())) {
          aiClichéCount += 1;
          flags.push({
            type: 'WARNING',
            category: 'FORBIDDEN_VOCAB',
            message: `Phát hiện từ cấm của thương hiệu: "${term}"`
          });
        }
      }
    }

    const antiAiScore = Math.max(10, Math.round(100 - aiClichéCount * 18));

    // 2. NHỊP ĐIỆU CÂU & ĐỘ TỰ NHIÊN (Rhythm & Naturalness)
    const rhythmResult = this._evaluateRhythm(text);
    const rhythmScore = rhythmResult.score;
    if (rhythmResult.flag) {
      flags.push(rhythmResult.flag);
      suggestions.push(rhythmResult.suggestion);
    }

    // 3. MẬT ĐỘ EMOJI & ĐỊNH DẠNG (Emoji & Formatting Check)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojis = text.match(emojiRegex) || [];
    const maxAllowedEmojis = brandProfile?.contentRules?.maxEmojis || 4;

    let toneFitScore = 90;
    if (emojis.length > maxAllowedEmojis) {
      const penalty = (emojis.length - maxAllowedEmojis) * 8;
      toneFitScore = Math.max(30, toneFitScore - penalty);
      flags.push({
        type: 'WARNING',
        category: 'EMOJI_OVERLOAD',
        message: `Mật độ emoji quá cao (${emojis.length} icon, giới hạn thương hiệu là ${maxAllowedEmojis})`
      });
      suggestions.push(`Giảm bớt emoji xuống dưới ${maxAllowedEmojis} icon để giữ vẻ chuyên nghiệp, tự nhiên.`);
    }

    // 4. ĐỘ PHÙ HỢP THƯƠNG HIỆU & TỪ KHÓA (Brand Fit Score)
    let brandFitScore = 85;
    if (brandProfile && brandProfile.vocabularyPreferences?.allowedTerms) {
      const allowed = brandProfile.vocabularyPreferences.allowedTerms;
      const matchedAllowed = allowed.filter(w => text.toLowerCase().includes(w.toLowerCase()));
      if (matchedAllowed.length > 0) {
        brandFitScore = Math.min(100, brandFitScore + matchedAllowed.length * 4);
      }
    }

    // 5. TIỀM NĂNG TƯƠNG TÁC & HOOK (Engagement Score)
    const engagementResult = this._evaluateEngagement(text, brandProfile);
    const engagementScore = engagementResult.score;
    if (engagementResult.flag) {
      flags.push(engagementResult.flag);
    }

    // TÍNH ĐIỂM TỔNG HỢP (Weighted Overall Score)
    // Trọng số: Anti-AI (35%) + Nhịp điệu tự nhiên (25%) + Brand Fit (20%) + Tone (10%) + Tương tác (10%)
    const overallScore = Math.round(
      antiAiScore * 0.35 +
      rhythmScore * 0.25 +
      brandFitScore * 0.20 +
      toneFitScore * 0.10 +
      engagementScore * 0.10
    );

    const passed = overallScore >= 80 && antiAiScore >= 75;

    if (flags.length === 0) {
      suggestions.push('Nội dung đạt chuẩn chất lượng cao, văn phong tự nhiên và đúng định vị thương hiệu.');
    }

    return {
      overallScore,
      passed,
      breakdown: {
        antiAiScore,
        brandFitScore,
        toneFitScore,
        rhythmScore,
        engagementScore
      },
      stats: {
        wordCount: text.trim().split(/\s+/).length,
        sentenceCount: rhythmResult.sentenceCount,
        emojiCount: emojis.length,
        varianceWords: rhythmResult.variance
      },
      flags,
      suggestions
    };
  }

  /**
   * Đánh giá phương sai độ dài câu để phát hiện sự đơn điệu kiểu máy móc
   */
  _evaluateRhythm(text) {
    const rawSentences = text
      .split(/[.!?\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    if (rawSentences.length < 2) {
      return {
        score: 75,
        sentenceCount: rawSentences.length,
        variance: 0,
        flag: { type: 'INFO', message: 'Bài viết ngắn hoặc chỉ có 1 đoạn đơn' },
        suggestion: 'Thêm ngắt câu hoặc chia sẻ góc nhìn chi tiết hơn để tăng chiều sâu'
      };
    }

    const lengths = rawSentences.map(s => s.split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = Math.sqrt(lengths.reduce((sum, len) => sum + Math.pow(len - avg, 2), 0) / lengths.length);

    // Con người thường có câu ngắn 4-7 từ xen kẽ câu dài 15-25 từ (variance > 4)
    // Máy AI thường viết các câu đều chằn chặn 14-18 từ (variance < 3)
    let score = 85;
    let flag = null;
    let suggestion = '';

    if (variance >= 5.0) {
      score = 95; // Nhịp điệu con người rất tự nhiên
    } else if (variance >= 3.5) {
      score = 88;
    } else if (variance >= 2.0) {
      score = 75;
      flag = {
        type: 'WARNING',
        category: 'MONOTONOUS_RHYTHM',
        message: `Độ dài các câu quá đồng đều (Phương sai: ${variance.toFixed(1)}). Văn phong có nguy cơ bị cứng kiểu máy dịch.`
      };
      suggestion = 'Nên xen kẽ một vài câu ngắn đắt giá (3-7 từ) giữa các câu diễn giải dài để tạo nhịp thở tự nhiên.';
    } else {
      score = 60;
      flag = {
        type: 'WARNING',
        category: 'ROBOTIC_RHYTHM',
        message: `Nhịp điệu câu đều chằn chặn như lập trình (Phương sai: ${variance.toFixed(1)}).`
      };
      suggestion = 'Tách các câu quá dài và đệm thêm câu cảm thán hoặc câu hỏi ngắn để bài viết sinh động.';
    }

    return {
      score,
      sentenceCount: rawSentences.length,
      variance: parseFloat(variance.toFixed(1)),
      flag,
      suggestion
    };
  }

  /**
   * Đánh giá Hook & CTA
   */
  _evaluateEngagement(text, brandProfile) {
    const firstLines = text.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
    let score = 85;
    let flag = null;

    // Kiểm tra câu đầu tiên có phải là lời chào máy móc không
    if (/^(chào các bạn|xin chào mọi người|hello cả nhà)/i.test(firstLines)) {
      score -= 10;
      flag = {
        type: 'INFO',
        category: 'WEAK_HOOK',
        message: 'Mở đầu bằng lời chào quen thuộc có thể làm giảm tỷ lệ dừng ngón tay (stop-scroll rate).'
      };
    }

    // Kiểm tra CTA cấm
    if (brandProfile && brandProfile.ctaRules?.forbiddenPatterns) {
      for (const forbiddenCta of brandProfile.ctaRules.forbiddenPatterns) {
        if (text.toUpperCase().includes(forbiddenCta.toUpperCase())) {
          score -= 15;
          flag = {
            type: 'WARNING',
            category: 'FORBIDDEN_CTA',
            message: `Lời kêu gọi CTA vi phạm quy định thương hiệu: "${forbiddenCta}"`
          };
        }
      }
    }

    return { score, flag };
  }

  /**
   * Tự động làm sạch văn phong AI (Auto-Refine Cliches)
   */
  autoClean(text) {
    let cleaned = text;

    // Thay thế một số cụm từ AI kinh điển bằng lối diễn đạt tự nhiên
    cleaned = cleaned.replace(/bạn có biết rằng\s*/gi, '');
    cleaned = cleaned.replace(/trong cuộc sống hiện đại,?\s*/gi, 'Ngày thường, ');
    cleaned = cleaned.replace(/trong thời đại 4\.0,?\s*/gi, 'Thời buổi này, ');
    cleaned = cleaned.replace(/hãy cùng chúng tôi khám phá\s*/gi, 'Cùng xem ');
    cleaned = cleaned.replace(/chắc hẳn ai trong chúng ta cũng\s*/gi, 'Nhiều người trong mình ');
    cleaned = cleaned.replace(/không chỉ ([\w\s]+) mà còn/gi, 'Vừa $1, lại còn');

    return cleaned;
  }
}

module.exports = new ContentQualityService();
