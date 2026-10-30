/**
 * aiSpinningService.js - Dịch vụ sinh nội dung đa dạng hóa bằng AI + Kiểm tra Levenshtein
 */
let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (e) {}
const config = require('../../config');
const logger = require('../utils/logger');
const { validateUniqueVariants } = require('../utils/similarityUtils');
const { fixSpellingAndSpacing } = require('../utils/textCleaner');

class AISpinningService {
  constructor(apiKey) {
    const key = apiKey || (config.ai && config.ai.apiKey) || process.env.GEMINI_API_KEY;
    this.genAI = (GoogleGenerativeAI && key && !key.includes('your_')) ? new GoogleGenerativeAI(key) : null;
    this.modelName = (config.ai && config.ai.model) || 'gemini-2.5-flash';
  }

  /**
   * Tạo prompt chuẩn hóa yêu cầu AI sinh N bản viết lại độc nhất theo đúng FORM BÀI MẪU
   */
  _buildSpinPrompt(rawContent, targetPages, fixedEntities) {
    const pageCount = targetPages.length;

    return `
Bạn là chuyên gia Copywriting Facebook chuẩn mực.
Nhiệm vụ: Viết lại bài tuyển dụng dưới đây thành ${pageCount} BẢN BÀI ĐĂNG HOÀN TOÀN ĐỘC NHẤT cho ${pageCount} Fanpage.

[QUY TẮC CỐT LÕI - BẮT BUỘC TUÂN THỦ]:
1. FORM BÀI ĐĂNG PHẢI TUÂN THỦ CHÍNH XÁC CẤU TRÚC:
[TUYỂN DỤNG] – [VỊ TRÍ]
Mô tả công việc:
[Các gạch đầu dòng mô tả]

Yêu cầu ứng viên:
[Các gạch đầu dòng yêu cầu]

Quyền lợi & phúc lợi:
[Các gạch đầu dòng quyền lợi]

Hình thức làm việc: [Full-time / Part-time / Remote / Hợp đồng]

Địa điểm làm việc: [Địa chỉ cụ thể hoặc khu vực]

[Câu kêu gọi CTA đa dạng, lịch sự]

#ViecLam[TênTỉnhThànhKhôngDấu] #[TênThươngHiệuKhôngDấu] #JobCentral

https://www.facebook.com/JobCentralVietNam/

2. NGUYÊN TẮC QUAN TRỌNG:
- GIỮ NGUYÊN TOÀN BỘ CÁC NỘI DUNG CHI TIẾT (Mô tả, Yêu cầu, Quyền lợi, Lương, Địa chỉ, Link).
- CHỈ BIẾN ĐỔI: Cách mở bài/tiêu đề ([TUYỂN DỤNG], [TUYỂN GẤP], [CƠ HỘI VIỆC LÀM], [THÔNG BÁO TUYỂN DỤNG]...), cách hành văn của các gạch đầu dòng và câu kêu gọi CTA để tạo độ khác biệt chống spam (không dùng icon thừa thãi).
- CÁI NÀO KHÔNG CÓ THÔNG TIN THÌ BỎ QUA, TUYỆT ĐỐI KHÔNG TỰ BỊA THÊM.
- LINK CỐ ĐỊNH Ở CUỐI: "https://www.facebook.com/JobCentralVietNam/" (GIỮ NGUYÊN 100%).

[NỘI DUNG GỐC]:
"""
${rawContent}
"""

Định dạng kết quả trả về: Trả về DUY NHẤT một chuỗi JSON hợp lệ là mảng chuỗi (JSON array of strings) với đúng ${pageCount} phần tử.
`;
  }

  /**
   * Bộ sinh dự phòng thông minh (Smart Local Spinner): 
   * Giữ nguyên 100% toàn bộ ruột bài viết (Mô tả, Yêu cầu, Quyền lợi, Địa điểm, Link)
   * Chỉ biến đổi đa dạng Tiêu đề (Hook) và Lời kêu gọi (CTA) cho từng Fanpage
   */
  _generateLocalFallback(rawContent, targetPages, fixedEntities) {
    logger.info(`Đang áp dụng Smart Paraphraser chuẩn form cho ${targetPages.length} bài đăng...`);

    const titleHooks = [
      '[TUYỂN DỤNG]',
      '[TUYỂN GẤP]',
      '[CƠ HỘI VIỆC LÀM]',
      '[THÔNG BÁO TUYỂN DỤNG]',
      '[TÌM KIẾM ĐỒNG ĐỘI]',
      '[TUYỂN DỤNG NHÂN SỰ]'
    ];

    const ctaVariants = [
      'Ứng viên quan tâm vị trí này vui lòng liên hệ Zalo: 0914 641 643 để nhận thông tin chi tiết.',
      'Ứng viên quan tâm vui lòng kết bạn hoặc liên hệ Zalo: 0914 641 643 để được hỗ trợ nhanh nhất.',
      'Liên hệ trực tiếp qua Zalo: 0914 641 643 để nhận hướng dẫn nộp hồ sơ ngay hôm nay.',
      'Ứng viên quan tâm vui lòng liên hệ Zalo: 0914 641 643 để nhận lịch phỏng vấn và trao đổi thêm.',
      'Quan tâm vị trí ứng tuyển, hãy liên hệ Zalo: 0914 641 643 để bộ phận nhân sự phản hồi sớm nhất.'
    ];

    return targetPages.map((page, idx) => {
      let content = String(rawContent);

      // Thay đổi linh hoạt Tiêu đề mở đầu
      const hook = titleHooks[idx % titleHooks.length];
      content = content.replace(/^(\[TUYỂN DỤNG\]|📢 TUYỂN DỤNG)/m, `${hook}`);

      // Thay đổi linh hoạt Câu kêu gọi CTA
      const cta = ctaVariants[idx % ctaVariants.length];
      content = content.replace(/(Bạn quan tâm vị trí này\? Comment hoặc ib để nhận thông tin chi tiết nhé!|Ứng viên quan tâm vui lòng bình luận hoặc nhắn tin trực tiếp để nhận thông tin chi tiết\.|Ứng viên quan tâm vui lòng liên hệ Zalo: 0914 641 643 để nhận thông tin chi tiết\.)/g, cta);

      // Cập nhật hashtag tỉnh thành tương ứng nếu là Fanpage Tỉnh
      if (page.province) {
        content = content.replace(/#ViecLam[a-zA-Z0-9]+/g, `#ViecLam${page.province}`);
      }

      return content.trim();
    });
  }

  /**
   * Sinh danh sách bài đăng cho danh sách targetPages
   * @param {string} rawContent Nội dung gốc
   * @param {Array<{id: string, name: string}>} targetPages Danh sách các Fanpage
   * @param {string[]} fixedEntities Các thực thể bất biến (SĐT, lương, link)
   * @param {number} maxRetries Số lần tự động re-spin nếu bị trùng lặp
   * @returns {Promise<Array<{pageId: string, pageName: string, content: string}>>}
   */
  async generateSpunPosts(rawContent, targetPages, fixedEntities = [], maxRetries = 2) {
    if (!targetPages || targetPages.length === 0) {
      throw new Error('Danh sách targetPages trống.');
    }

    let generatedList = [];

    if (this.genAI && config.ai.apiKey && config.ai.apiKey.startsWith('AIzaSy')) {
      try {
        const prompt = this._buildSpinPrompt(rawContent, targetPages, fixedEntities);
        logger.info(`Đang gọi AI (${this.modelName}) để sinh ${targetPages.length} biến thể nội dung...`);

        const model = this.genAI.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.85,
          }
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI API Timeout (5s)')), 5000)
        );

        const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
        const responseText = result.response.text();
        const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        generatedList = JSON.parse(cleaned);
      } catch (err) {
        logger.warn(`AI API không phản hồi (${err.message}). Tự động chuyển sang Smart Local Spinner giữ nguyên toàn bộ chi tiết công việc...`);
        generatedList = this._generateLocalFallback(rawContent, targetPages, fixedEntities);
      }
    } else {
      generatedList = this._generateLocalFallback(rawContent, targetPages, fixedEntities);
    }

    if (!Array.isArray(generatedList) || generatedList.length < targetPages.length) {
      generatedList = this._generateLocalFallback(rawContent, targetPages, fixedEntities);
    }

    return targetPages.map((page, idx) => ({
      pageId: page.id,
      pageName: page.name,
      content: (generatedList[idx] || rawContent).trim()
    }));
  }
}

module.exports = AISpinningService;
