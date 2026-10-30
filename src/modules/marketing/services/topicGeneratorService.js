/**
 * topicGeneratorService.js - Dịch Vụ Tạo Đề Tài (Topic Generator) Cho AI Marketing Engine
 * Tự động phân tích Brand Profile, Content Pillars, Audience & Lịch Sử Để Sinh Chủ Đề Độc Đáo
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');
const brandProfileService = require('./brandProfileService');
const brandDnaService = require('./brandDnaService');

let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (e) {}

const TOPICS_FILE = path.join(__dirname, '../../../../data/marketing/topics.json');

class TopicGeneratorService {
  constructor() {
    const key = (config.ai && config.ai.apiKey) || process.env.GEMINI_API_KEY;
    this.genAI = (GoogleGenerativeAI && key && !key.includes('your_')) ? new GoogleGenerativeAI(key) : null;
    this.modelName = (config.ai && config.ai.model) || 'gemini-2.5-flash';
    this._ensureDataFile();
  }

  _ensureDataFile() {
    const dir = path.dirname(TOPICS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(TOPICS_FILE)) {
      fs.writeFileSync(TOPICS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  }

  _readTopics() {
    try {
      this._ensureDataFile();
      return JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8') || '[]');
    } catch (e) {
      return [];
    }
  }

  _writeTopics(topics) {
    this._ensureDataFile();
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2), 'utf8');
  }

  getTopicsByBrand(brandId, status = null) {
    const all = this._readTopics();
    return all.filter(t => t.brandId === brandId && (!status || t.status === status));
  }

  getTopicById(topicId) {
    const all = this._readTopics();
    return all.find(t => t.id === topicId) || null;
  }

  updateTopicStatus(topicId, status) {
    const all = this._readTopics();
    const idx = all.findIndex(t => t.id === topicId);
    if (idx !== -1) {
      all[idx].status = status;
      all[idx].updatedAt = new Date().toISOString();
      this._writeTopics(all);
      return all[idx];
    }
    return null;
  }

  /**
   * Sinh danh sách Topic thông minh
   * @param {Object} params { brandId, pillarId, count, customContext, objective }
   */
  async generateTopics({ brandId, pillarId, count = 6, customContext = '', objective = null }) {
    const profile = brandProfileService.getProfileById(brandId);
    if (!profile) {
      throw new Error(`Không tìm thấy Brand Profile với ID: ${brandId}`);
    }

    const dna = brandDnaService.getBrandDNA(brandId);
    const existingTopics = this.getTopicsByBrand(brandId);
    const existingTitles = existingTopics.map(t => t.title.toLowerCase());

    let selectedPillars = profile.pillars || [];
    if (pillarId) {
      const match = selectedPillars.find(p => p.id === pillarId);
      if (match) selectedPillars = [match];
    }

    let generatedList = [];

    // Thử dùng Gemini AI nếu có key
    if (this.genAI) {
      try {
        generatedList = await this._generateWithGemini({
          profile,
          dna,
          pillars: selectedPillars,
          count: parseInt(count, 10) || 6,
          customContext,
          objective,
          existingTitles
        });
      } catch (geminiErr) {
        logger.warn(`[TopicGenerator] Gemini AI gặp lỗi, chuyển sang Heuristic Engine: ${geminiErr.message}`);
      }
    }

    // Nếu Gemini chưa có hoặc fallback
    if (!generatedList || generatedList.length === 0) {
      generatedList = this._generateWithHeuristic({
        profile,
        pillars: selectedPillars,
        count: parseInt(count, 10) || 6,
        customContext,
        objective,
        existingTitles
      });
    }

    // Lưu vào database topics.json
    const all = this._readTopics();
    const newItems = generatedList.map((item, idx) => ({
      id: `top_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${idx}`,
      brandId: profile.id,
      brandName: profile.brandName,
      pillarId: item.pillarId,
      pillarName: item.pillarName,
      title: item.title,
      angle: item.angle,
      format: item.format || 'Single Post',
      objective: item.objective || objective || 'Engagement',
      suggestedHook: item.suggestedHook || '',
      targetAudienceSegment: item.targetAudienceSegment || profile.targetAudience?.persona || 'Độc giả mục tiêu',
      estimatedEngagementScore: item.estimatedEngagementScore || Math.floor(Math.random() * 15 + 82),
      reason: item.reason || 'Phù hợp với insight người xem và định hướng thương hiệu',
      status: 'suggested',
      createdAt: new Date().toISOString()
    }));

    const combined = [...newItems, ...all];
    this._writeTopics(combined);

    return newItems;
  }

  /**
   * Sinh topic qua Gemini AI với Prompt đo ni đóng giày theo Brand Profile
   */
  async _generateWithGemini({ profile, dna, pillars, count, customContext, objective, existingTitles }) {
    const prompt = `
Bạn là Giám đốc Sáng tạo Nội dung (Content Strategy Director) cho thương hiệu sau:
TÊN THƯƠNG HIỆU: ${profile.brandName}
SLOGAN/TAGLINE: ${profile.tagline || ''}
MÔ TẢ: ${profile.description}
ĐỘC GIẢ MỤC TIÊU: ${JSON.stringify(profile.targetAudience)}
TONE OF VOICE: ${JSON.stringify(profile.toneOfVoice)}
CÁC PILLARS NỘI DUNG: ${JSON.stringify(pillars.map(p => ({ id: p.id, name: p.name, desc: p.description })))}
CÁC TỪ NGỮ CẤM/VĂN PHONG AI BỊ CẤM: ${JSON.stringify(profile.forbiddenPatterns || [])}
BỐI CẢNH/CHỦ ĐỀ ĐẶC BIỆT CỦA NGƯỜI DÙNG: "${customContext || 'Tự nhiên theo mùa & insight đời thường'}"
MỤC TIÊU: "${objective || 'Cân bằng giữa Tương tác, Giá trị kiến thức & Gắn kết cảm xúc'}"

DANH SÁCH ĐỀ TÀI ĐÃ TỪNG LÀM (TRÁNH TRÙNG LẶP HOÀN TOÀN):
${existingTitles.slice(0, 15).join('\n')}

YÊU CẦU:
Hãy tạo chính xác ${count} ĐỀ TÀI (TOPICS) cụ thể, sâu sắc, thực tế và đánh trúng insight độc giả Việt Nam.
Tuyệt đối KHÔNG viết tiêu đề sáo rỗng kiểu AI chung chung (Ví dụ: KHÔNG viết "5 cách sống khỏe", "Bí quyết thành công", "Lợi ích bất ngờ").
Tiêu đề phải tự nhiên, đời thường hoặc khơi gợi sự tò mò chân thực.

Trả về kết quả DUY NHẤT một mảng JSON với cấu trúc:
[
  {
    "pillarId": "ID của pillar tương ứng",
    "pillarName": "Tên pillar",
    "title": "Tiêu đề đề tài súc tích, hấp dẫn",
    "angle": "Góc nhìn độc đáo hoặc cách tiếp cận",
    "format": "Single Post | Carousel Slide | Short Story | Q&A Discussion",
    "objective": "Awareness | Engagement | Education | Storytelling | Conversion",
    "suggestedHook": "Câu mở đầu (Hook) gợi ý 1-2 câu",
    "targetAudienceSegment": "Tập khán giả cụ thể quan tâm nhất",
    "estimatedEngagementScore": 88,
    "reason": "Lý do đề tài này chạm đúng insight"
  }
]
`;

    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 2500 }
    });

    const text = result.response.text();
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return Array.isArray(parsed) ? parsed : [];
  }

  /**
   * Bộ sinh Topic Heuristic thông minh đa dạng ngành nghề (Đảm bảo 100% hoạt động mượt mà)
   */
  _generateWithHeuristic({ profile, pillars, count, customContext, objective, existingTitles }) {
    const brandKey = profile.id.toLowerCase();
    const topicsPool = this._getHeuristicTopicPool(brandKey, profile);

    const results = [];
    const usedTitles = new Set(existingTitles);

    for (let i = 0; i < count; i++) {
      const pillar = pillars[i % pillars.length] || { id: 'pil_default', name: 'Đời Sống & Giá Trị' };
      
      // Tìm chủ đề phù hợp trong pool hoặc sinh động
      let poolCandidates = topicsPool.filter(t => !usedTitles.has(t.title.toLowerCase()));
      if (poolCandidates.length === 0) poolCandidates = topicsPool;

      const pick = poolCandidates[i % poolCandidates.length] || {
        title: `Góc nhìn chân thực về ${profile.brandName} và thói quen hàng ngày`,
        angle: 'Chia sẻ trải nghiệm thực tế từ người trong cuộc',
        format: 'Single Post',
        objective: objective || 'Engagement',
        suggestedHook: `Có những điều giản dị mà phải để ý kỹ mới nhận ra...`,
        targetAudienceSegment: profile.targetAudience?.persona || 'Khán giả trung thành',
        estimatedEngagementScore: Math.floor(Math.random() * 10 + 85),
        reason: 'Đánh trúng sự tò mò và thói quen thường nhật của bạn đọc'
      };

      const customizedTitle = customContext 
        ? `${pick.title} [${customContext}]` 
        : pick.title;

      usedTitles.add(customizedTitle.toLowerCase());

      results.push({
        pillarId: pillar.id,
        pillarName: pillar.name,
        title: customizedTitle,
        angle: pick.angle,
        format: pick.format,
        objective: objective || pick.objective,
        suggestedHook: pick.suggestedHook,
        targetAudienceSegment: pick.targetAudienceSegment,
        estimatedEngagementScore: pick.estimatedEngagementScore,
        reason: pick.reason
      });
    }

    return results;
  }

  /**
   * Ngân hàng Topic mẫu chuyên sâu cho các Brand Profiles mặc định & mở rộng
   */
  _getHeuristicTopicPool(brandKey, profile) {
    if (brandKey.includes('vhfresh') || brandKey.includes('fresh') || brandKey.includes('food')) {
      return [
        {
          title: 'Mẹo phân biệt rau muống sạch tự nhiên với rau kích ngọt ngọn',
          angle: 'Thực tế đi chợ - quan sát từ mắt thấy tay sờ chứ không nói lý thuyết suông',
          format: 'Carousel Slide',
          objective: 'Education',
          suggestedHook: 'Rau muống ngọn mập mạp xanh đen nhìn thì bắt mắt, nhưng mẹo của các bà nội trợ sành sỏi lại nằm ở chỗ khác...',
          targetAudienceSegment: 'Chị em nội trợ và người chăm lo bữa ăn gia đình',
          estimatedEngagementScore: 92,
          reason: 'Đúng nỗi lo sợ mua phải rau bẩn hàng ngày của 90% gia đình thành thị'
        },
        {
          title: 'Bữa cơm 3 món dưới 30 phút cho những tối tăng ca về muộn',
          angle: 'Đồng cảm với người đi làm bận rộn nhưng vẫn thích ăn cơm nhà ấm áp',
          format: 'Single Post',
          objective: 'Engagement',
          suggestedHook: 'Về đến nhà lúc 7 rưỡi tối, mở tủ lạnh mà có sẵn mớ rau đã nhặt với khúc cá tươi là coi như giải tỏa được nửa ngày mệt mỏi.',
          targetAudienceSegment: 'Dân văn phòng bận rộn 25-35 tuổi',
          estimatedEngagementScore: 89,
          reason: 'Giải quyết triệt để bài toán thời gian và bữa ăn ấm cúng'
        },
        {
          title: 'Chuyện người trồng cà chua sạch ở Đà Lạt: Những quả nám vỏ nhưng ngọt thanh',
          angle: 'Kể chuyện người thật việc thật - tại sao quả không bóng loáng lại là quả ngon',
          format: 'Short Story',
          objective: 'Storytelling',
          suggestedHook: 'Nhiều người chê quả cà chua ngoài vỏ hơi nám nhẹ, nhưng cắt đôi ra mới thấy thịt dày cùi và thơm nức mùi đất đỏ.',
          targetAudienceSegment: 'Khách hàng chú trọng chất lượng nguyên bản',
          estimatedEngagementScore: 86,
          reason: 'Xây dựng niềm tin bền vững về nguồn gốc nông sản an toàn'
        },
        {
          title: '3 loại rau củ tuyệt đối không nên cất tủ lạnh nếu chưa biết cách bảo quản',
          angle: 'Sửa thói quen sai lầm phổ biến của các gia đình',
          format: 'Infographic Tips',
          objective: 'Education',
          suggestedHook: 'Có những loại củ cứ tiện tay nhét ngăn mát là chỉ sau 3 hôm đã héo quắt và mất hết vị ngọt tự nhiên...',
          targetAudienceSegment: 'Bà mẹ trẻ mới lập gia đình',
          estimatedEngagementScore: 94,
          reason: 'Mẹo vặt thiết thực, tỷ lệ lưu bài (save) và chia sẻ cực cao'
        },
        {
          title: 'Hôm nay mâm cơm nhà bạn có món canh gì?',
          angle: 'Gợi mở thảo luận nhẹ nhàng, hỏi ý kiến cộng đồng yêu nấu nướng',
          format: 'Q&A Discussion',
          objective: 'Engagement',
          suggestedHook: 'Trời se lạnh thế này, bát canh nóng bốc khói nghi ngút là thứ níu chân mọi thành viên quây quần bên bàn ăn.',
          targetAudienceSegment: 'Cộng đồng yêu ẩm thực gia đình',
          estimatedEngagementScore: 91,
          reason: 'Rào cản bình luận cực thấp, kích thích tương tác tự nhiên'
        },
        {
          title: 'Combo thực phẩm sạch tuần này: Tiết kiệm thời gian sơ chế đến 60%',
          angle: 'Giải pháp tinh tế, không chèo kéo bán hàng gay gắt',
          format: 'Single Post',
          objective: 'Conversion',
          suggestedHook: 'Không cần mất cả buổi sáng cuối tuần chen chúc ngoài chợ, rau củ đã rửa sạch - thịt cá sơ chế sẵn chỉ việc nấu.',
          targetAudienceSegment: 'Gia đình trẻ thành thị bận rộn',
          estimatedEngagementScore: 84,
          reason: 'Khơi gợi nhu cầu mua hàng dựa trên sự tiện lợi thực tế'
        }
      ];
    }

    if (brandKey.includes('ngam') || brandKey.includes('life') || brandKey.includes('mind')) {
      return [
        {
          title: 'Khoảng lặng sau giờ tan tầm: Khi một mình không đồng nghĩa với cô đơn',
          angle: 'Tâm lý học đời thường - thấu cảm với những người cần nạp lại năng lượng',
          format: 'Single Post',
          objective: 'Engagement',
          suggestedHook: 'Đôi khi ngồi lại trong quán nước ven đường 15 phút sau giờ làm không phải vì lười về, mà là để kịp dỡ bỏ những ồn ào trước khi bước vào cửa nhà.',
          targetAudienceSegment: 'Người trẻ đi làm, người hướng nội 22-35 tuổi',
          estimatedEngagementScore: 95,
          reason: 'Chạm trúng cảm xúc thầm kín mà ai cũng từng trải qua nhưng ít khi diễn tả thành lời'
        },
        {
          title: 'Học cách không giải thích bản thân với những người không ở cùng tần số',
          angle: 'Sự trưởng thành điềm tĩnh, bớt hơn thua để giữ tâm trí an yên',
          format: 'Short Story',
          objective: 'Storytelling',
          suggestedHook: 'Hồi đôi mươi, ai hiểu lầm là muốn thanh minh bằng được. Càng đi qua nhiều năm tháng, càng nhận ra im lặng đúng lúc chính là sự giải thoát lớn nhất.',
          targetAudienceSegment: 'Người trưởng thành trên 25 tuổi',
          estimatedEngagementScore: 96,
          reason: 'Tính đồng cảm và tỷ lệ chia sẻ (Share) tản văn cực kỳ cao'
        },
        {
          title: 'Bẫy so sánh trên mạng xã hội: Nhìn vào hậu trường của mình qua sân khấu của người khác',
          angle: 'Góc nhìn phản tỉnh về tâm lý thời đại số',
          format: 'Single Post',
          objective: 'Awareness',
          suggestedHook: 'Chúng ta hay lướt qua một bức ảnh lung linh của ai đó rồi tự trách sao cuộc sống mình lại tẻ nhạt, quên mất rằng chẳng ai đi đăng tải những vết nứt của họ lên mạng.',
          targetAudienceSegment: 'Thế hệ Gen Z & Millennials hay bị overthinking',
          estimatedEngagementScore: 93,
          reason: 'Giúp độc giả gỡ rối áp lực tinh thần một cách nhẹ nhàng'
        },
        {
          title: 'Làm thế nào để nói lời từ chối mà trong lòng không cảm thấy tội lỗi?',
          angle: 'Kỹ năng thiết lập ranh giới cá nhân lành mạnh',
          format: 'Carousel Slide',
          objective: 'Education',
          suggestedHook: 'Người cả nể luôn là người mệt mỏi nhất sau mỗi lần gật đầu đồng ý...',
          targetAudienceSegment: 'Những người hay ngại từ chối trong công việc và quan hệ',
          estimatedEngagementScore: 91,
          reason: 'Đề tài tâm lý ứng dụng có giá trị thực hành cao'
        }
      ];
    }

    if (brandKey.includes('bds') || brandKey.includes('real') || brandKey.includes('estate') || brandKey.includes('home')) {
      return [
        {
          title: 'Chọn căn hộ tầng thấp hay tầng cao: 4 điều ở thực tế mới thấu',
          angle: 'Kinh nghiệm sống thực tế chứ không chỉ nhìn bản vẽ 3D',
          format: 'Carousel Slide',
          objective: 'Education',
          suggestedHook: 'Lúc đi xem nhà ai cũng mê view khoáng đạt ở tầng 30, nhưng đến khi sống đủ 2 năm mới thấy tầng trung lại có những cái tiện không ngờ...',
          targetAudienceSegment: 'Khách hàng mua nhà lần đầu 28-42 tuổi',
          estimatedEngagementScore: 92,
          reason: 'Trúng điểm trăn trở lớn nhất của người mua chung cư'
        },
        {
          title: 'Căn hộ hướng Tây có thực sự nóng như lời đồn?',
          angle: 'Phân tích khoa học kèm giải pháp vật liệu thực tế',
          format: 'Single Post',
          objective: 'Awareness',
          suggestedHook: 'Nhiều người nghe đến hướng Tây là gạt ngay, nhưng nếu biết cách xử lý lam chắn và kính Low-E thì hoàng hôn lại là món quà đắt giá nhất.',
          targetAudienceSegment: 'Nhà đầu tư và người mua nhà tầm trung',
          estimatedEngagementScore: 88,
          reason: 'Phá vỡ định kiến mua nhà bằng kiến thức thực tế'
        },
        {
          title: '3 lỗi thiết kế bếp trong căn hộ khiến không gian bị bí mùi sau 6 tháng',
          angle: 'Góc nhìn công năng sử dụng đời thường',
          format: 'Infographic Tips',
          objective: 'Education',
          suggestedHook: 'Bếp nhìn trên ảnh render rất sang, nhưng đặt sai hướng hút mùi là mỗi lần xào nấu mùi thức ăn ám khắp phòng khách.',
          targetAudienceSegment: 'Gia đình chuẩn bị nhận nhà và làm nội thất',
          estimatedEngagementScore: 94,
          reason: 'Giá trị thực tiễn cực cao, kích thích lưu bài viết'
        }
      ];
    }

    // Default generic pool for any new brand created by user
    return [
      {
        title: `Góc nhìn chuyên sâu: 3 điều ít ai chia sẻ trong lĩnh vực ${profile.brandName}`,
        angle: 'Góc nhìn thẳng thắn từ người làm nghề',
        format: 'Single Post',
        objective: 'Education',
        suggestedHook: 'Có những kinh nghiệm thực tế không nằm trong sách vở mà chỉ những người va vấp lâu năm mới nhận ra...',
        targetAudienceSegment: profile.targetAudience?.persona || 'Khách hàng mục tiêu',
        estimatedEngagementScore: 88,
        reason: 'Xây dựng vị thế chuyên gia và độ tin cậy tự nhiên'
      },
      {
        title: `Phía sau một trải nghiệm hài lòng của khách hàng tại ${profile.brandName}`,
        angle: 'Hậu trường chân thực và sự tận tâm',
        format: 'Short Story',
        objective: 'Storytelling',
        suggestedHook: 'Điều làm nên sự khác biệt không phải là lời hứa to tát, mà là cách chúng mình chăm chút cho từng chi tiết nhỏ nhất.',
        targetAudienceSegment: 'Khách hàng tiềm năng đang phân vân',
        estimatedEngagementScore: 87,
        reason: 'Tạo cảm xúc gắn kết và sự đồng cảm'
      },
      {
        title: `Bạn ưu tiên điều gì nhất khi lựa chọn giải pháp phù hợp cho mình?`,
        angle: 'Hỏi ý kiến cộng đồng, khảo sát insight tự nhiên',
        format: 'Q&A Discussion',
        objective: 'Engagement',
        suggestedHook: 'Mỗi người đều có một tiêu chuẩn riêng khi ra quyết định. Còn với bạn, yếu tố nào là quan trọng số một?',
        targetAudienceSegment: 'Độc giả tương tác',
        estimatedEngagementScore: 90,
        reason: 'Thu thập phản hồi thực tế và tăng lượng comment tự nhiên'
      }
    ];
  }
}

module.exports = new TopicGeneratorService();
