/**
 * marketingContentService.js - Dịch Vụ Viết Nội Dung Đa Góc Nhìn & Visual Direction
 * Trọng tâm Phase 2: Sinh 3 biến thể (Storytelling, Educational, Conversational) + Định hướng hình ảnh AI
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');
const brandProfileService = require('./brandProfileService');
const brandDnaService = require('./brandDnaService');
const contentQualityService = require('./contentQualityService');

let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (e) {}

const DRAFTS_FILE = path.join(__dirname, '../../../../data/marketing/content_drafts.json');

class MarketingContentService {
  constructor() {
    const key = (config.ai && config.ai.apiKey) || process.env.GEMINI_API_KEY;
    this.genAI = (GoogleGenerativeAI && key && !key.includes('your_')) ? new GoogleGenerativeAI(key) : null;
    this.modelName = (config.ai && config.ai.model) || 'gemini-2.5-flash';
    this._ensureDataFile();
  }

  _ensureDataFile() {
    const dir = path.dirname(DRAFTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DRAFTS_FILE)) {
      fs.writeFileSync(DRAFTS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  }

  _readDrafts() {
    try {
      this._ensureDataFile();
      return JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8') || '[]');
    } catch (e) {
      return [];
    }
  }

  _writeDrafts(drafts) {
    this._ensureDataFile();
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
  }

  getDraftsByBrand(brandId) {
    const all = this._readDrafts();
    return all.filter(d => d.brandId === brandId);
  }

  getDraftById(draftId) {
    const all = this._readDrafts();
    return all.find(d => d.id === draftId) || null;
  }

  updateDraft(draftId, updateData) {
    const all = this._readDrafts();
    const idx = all.findIndex(d => d.id === draftId);
    if (idx === -1) throw new Error('Không tìm thấy bản nháp');

    all[idx] = {
      ...all[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this._writeDrafts(all);
    return all[idx];
  }

  deleteDraft(draftId) {
    const all = this._readDrafts();
    const filtered = all.filter(d => d.id !== draftId);
    this._writeDrafts(filtered);
    return true;
  }

  /**
   * Sinh gói nội dung 3 Góc Nhìn (3 Angles) + Visual Direction cho một chủ đề
   */
  async generateMultiAngleContent({ brandId, topic, customInstruction = '' }) {
    const profile = brandProfileService.getProfileById(brandId);
    if (!profile) throw new Error(`Không tìm thấy Brand Profile với ID: ${brandId}`);

    const dna = brandDnaService.getBrandDNA(brandId);

    let topicTitle = '';
    let topicPillar = '';
    let topicHook = '';

    if (typeof topic === 'object') {
      topicTitle = topic.title || '';
      topicPillar = topic.pillarName || '';
      topicHook = topic.suggestedHook || '';
    } else {
      topicTitle = String(topic);
    }

    let generatedVariants = [];

    // 1. Thử gọi Gemini AI nếu có key
    if (this.genAI) {
      try {
        generatedVariants = await this._generateWithGemini({
          profile,
          dna,
          topicTitle,
          topicPillar,
          topicHook,
          customInstruction
        });
      } catch (err) {
        logger.warn(`[MarketingContentService] Gemini gặp lỗi, chuyển sang Heuristic Copywriting Engine: ${err.message}`);
      }
    }

    // 2. Dự phòng Heuristic Copywriting Engine chuyên sâu
    if (!generatedVariants || generatedVariants.length === 0) {
      generatedVariants = this._generateWithHeuristic({
        profile,
        dna,
        topicTitle,
        topicPillar,
        topicHook,
        customInstruction
      });
    }

    // 3. Kiểm định chất lượng Anti-AI & Brand Voice cho từng biến thể
    const assessedVariants = generatedVariants.map((variant, idx) => {
      let evaluation = contentQualityService.evaluate({
        text: variant.content,
        brandProfile: profile,
        brandDna: dna
      });

      // Nếu chất lượng chưa đạt ngưỡng 80, tự động làm sạch và đánh giá lại
      let finalContent = variant.content;
      if (!evaluation.passed) {
        finalContent = contentQualityService.autoClean(finalContent);
        evaluation = contentQualityService.evaluate({
          text: finalContent,
          brandProfile: profile,
          brandDna: dna
        });
      }

      return {
        id: `var_${Date.now()}_${idx}`,
        angleKey: variant.angleKey,
        angleTitle: variant.angleTitle,
        angleBadge: variant.angleBadge,
        headline: variant.headline || '',
        content: finalContent,
        qualityScore: evaluation.overallScore,
        qualityBreakdown: evaluation.breakdown,
        qualityFlags: evaluation.flags,
        qualitySuggestions: evaluation.suggestions,
        stats: evaluation.stats,
        visualDirection: variant.visualDirection || {
          concept: 'Hình ảnh đời thường phản ánh thông điệp bài viết',
          aiPrompt: 'Authentic Vietnamese daily life photo, natural warm lighting, editorial quality --ar 4:5',
          aspectRatio: '4:5',
          textOverlay: 'Góc Nhìn Thực Tế',
          colorTone: profile.visualStyle?.colors?.[0] || '#10b981'
        }
      };
    });

    // 4. Tạo bản nháp hoàn chỉnh và lưu trữ
    const draftRecord = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      brandId: profile.id,
      brandName: profile.brandName,
      topicTitle,
      topicPillar,
      customInstruction,
      selectedVariantIndex: 0, // Mặc định chọn biến thể 1
      status: 'DRAFT', // 'DRAFT' | 'READY_FOR_APPROVAL' | 'SCHEDULED' | 'PUBLISHED'
      variants: assessedVariants,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const drafts = this._readDrafts();
    drafts.unshift(draftRecord);
    this._writeDrafts(drafts);

    return draftRecord;
  }

  /**
   * Sinh nội dung qua Gemini AI với chuẩn Prompt 3 Angles + Visual Direction
   */
  async _generateWithGemini({ profile, dna, topicTitle, topicPillar, topicHook, customInstruction }) {
    const prompt = `
Bạn là Giám đốc Sáng tạo & Copywriter chuyên nghiệp hàng đầu tại Việt Nam.
Thương hiệu: ${profile.brandName}
Tagline: ${profile.tagline || ''}
Mô tả thương hiệu: ${profile.description}
Khách hàng mục tiêu: ${JSON.stringify(profile.targetAudience)}
Tone of voice: ${JSON.stringify(profile.toneOfVoice)}
Phong cách hành văn: ${JSON.stringify(profile.writingStyle)}
Quy tắc CTA: ${JSON.stringify(profile.ctaRules)}
Quy tắc Hashtag: ${JSON.stringify(profile.hashtagRules)}
CÁC CỤM TỪ CẤM / VĂN PHONG AI BỊ LOẠI TRỪ TUYỆT ĐỐI:
${JSON.stringify(profile.forbiddenPatterns || [])}
- Tuyệt đối không dùng: "Bạn có biết", "Trong cuộc sống hiện đại", "Không chỉ... mà còn...", "Hãy cùng chúng tôi khám phá", "Chắc hẳn ai trong chúng ta", "Vô vàn lợi ích".
- Nhịp điệu câu phải tự nhiên: câu ngắn đắt giá xen kẽ câu dài uyển chuyển. Không dùng icon tràn lan (tối đa 2-3 icon).

CHỦ ĐỀ BÀI VIẾT: "${topicTitle}"
PILLAR NỘI DUNG: "${topicPillar}"
CÂU HOOK GỢI Ý: "${topicHook}"
GHI CHÚ RIÊNG TỪ NGƯỜI DÙNG: "${customInstruction || 'Viết chân thực, đắt giá, đánh trúng tâm lý bạn đọc'}"

YÊU CẦU:
Hãy tạo chính xác 3 BIẾN THỂ NỘI DUNG (3 ANGLES) hoàn toàn khác biệt nhau về cách tiếp cận:

1. GÓC NHÌN A: STORYTELLING / CẢM XÚC (Empathy & Narrative)
- Mở đầu bằng một mẩu chuyện đời thường hoặc một quan sát tinh tế.
- Giọng văn gần gũi, ấm áp, kết nối cảm xúc tự nhiên, chạm đến trải nghiệm thật.

2. GÓC NHÌN B: KIẾN THỨC THỰC TẾ / GIÁ TRỊ (Actionable Value & Educational)
- Trực diện vào vấn đề, đưa ra mẹo hoặc góc nhìn thực chiến, dễ hiểu, áp dụng được ngay.
- Tránh lý thuyết suông, dùng ngôn từ đời thường như người làm nghề chia sẻ cho bạn bè.

3. GÓC NHÌN C: TƯƠNG TÁC & THẢO LUẬN (Conversational & Community Debate)
- Đặt ra vấn đề gợi mở sự tò mò hoặc tranh luận nhẹ nhàng, kêu gọi bạn đọc bày tỏ quan điểm.
- Rào cản bình luận thấp, tự nhiên không gượng gạo.

KÈM THEO MỖI BIẾN THỂ:
1 Định hướng hình ảnh AI (Visual Direction):
- Concept hình ảnh mô tả tiếng Việt
- AI Prompt (tiếng Anh) tối ưu cho Midjourney v6/Flux/DALL-E
- Tỉ lệ khung hình khuyến nghị (4:5 hoặc 1:1)
- Chữ chèn trên ảnh (Text Overlay) 3-5 từ đắt giá

Trả về DUY NHẤT một chuỗi JSON hợp lệ theo định dạng mảng 3 đối tượng:
[
  {
    "angleKey": "storytelling",
    "angleTitle": "Storytelling & Cảm Xúc",
    "angleBadge": "📖 Tự Sự Chân Thật",
    "headline": "Tiêu đề hoặc dòng mở đầu",
    "content": "Toàn văn bài viết hoàn chỉnh kèm CTA và hashtag...",
    "visualDirection": {
      "concept": "Mô tả chi tiết concept ảnh",
      "aiPrompt": "Detailed English prompt for Midjourney --ar 4:5",
      "aspectRatio": "4:5",
      "textOverlay": "Chữ trên ảnh",
      "colorTone": "#10b981"
    }
  },
  {
    "angleKey": "educational",
    "angleTitle": "Kiến Thức Thực Tế",
    "angleBadge": "💡 Giá Trị Thực Chiến",
    "headline": "Tiêu đề hoặc dòng mở đầu",
    "content": "Toàn văn bài viết...",
    "visualDirection": { ... }
  },
  {
    "angleKey": "conversational",
    "angleTitle": "Tương Tác & Thảo Luận",
    "angleBadge": "💬 Khơi Gợi Bình Luận",
    "headline": "Tiêu đề hoặc dòng mở đầu",
    "content": "Toàn văn bài viết...",
    "visualDirection": { ... }
  }
]
`;

    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 3500 }
    });

    const text = result.response.text();
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return Array.isArray(parsed) ? parsed : [];
  }

  /**
   * Bộ sinh Heuristic 3 Angles chuyên nghiệp (Đảm bảo chạy offline hoặc khi không có AI Key)
   */
  _generateWithHeuristic({ profile, dna, topicTitle, topicPillar, topicHook, customInstruction }) {
    const brandId = profile.id.toLowerCase();
    const hashtags = (profile.hashtagRules?.brandHashtags || ['#Marketing', `#${profile.brandName.replace(/\s+/g, '')}`]).join(' ');
    const preferredCta = profile.ctaRules?.preferredPatterns?.[0] || 'Chia sẻ góc nhìn của bạn ở phần bình luận nhé.';

    if (brandId.includes('vhfresh') || brandId.includes('fresh') || brandId.includes('food')) {
      return [
        {
          angleKey: 'storytelling',
          angleTitle: 'Storytelling & Cảm Xúc',
          angleBadge: '📖 Tự Sự Bếp Nhà',
          headline: 'Chuyện đi chợ sớm và mớ rau vừa hái',
          content: `${topicHook || 'Sáng nay ghé chợ sớm, sương còn đọng trên ngọn cải non.'}

Có những hôm đi làm về muộn, bước vào nhà chỉ muốn buông hết mệt mỏi. Mở tủ lạnh thấy mớ rau tươi rói được nhặt sạch sẽ, tự nhiên lòng nhẹ nhõm hẳn.

${topicTitle}: Không cầu kỳ gia vị, chỉ cần luộc nhanh vừa chín tới, giữ trọn vị giòn ngọt thanh tao. Bữa cơm gia đình đôi khi chẳng cần sơn hào hải vị, một đĩa rau luộc xanh mướt chấm bát kho quẹt hay nước mắm tỏi ớt cũng đủ làm ấm cả gian bếp.

${preferredCta}

${hashtags}`,
          visualDirection: {
            concept: 'Góc chụp cận mâm cơm gia đình với đĩa rau luộc xanh mướt bốc khói nhẹ, ánh nắng chiều chiếu xiên qua cửa sổ bếp mộc mạc',
            aiPrompt: 'Cinematic authentic photography of Vietnamese home dinner table, freshly boiled green morning glory vegetables on ceramic plate, steam rising, natural warm window sunlight, rustic wooden table, Fujifilm 35mm tone --ar 4:5 --v 6.0',
            aspectRatio: '4:5',
            textOverlay: 'Vị Ngọt Bữa Cơm Nhà',
            colorTone: '#10b981'
          }
        },
        {
          angleKey: 'educational',
          angleTitle: 'Kiến Thức Thực Tế',
          angleBadge: '💡 Mẹo Nhỏ Vào Bếp',
          headline: 'Mẹo chọn và bảo quản rau củ chuẩn VietGAP',
          content: `${topicTitle}

Nhiều người đi chợ hay chuộng rau quả thật to, bóng bẩy không một tì vết. Nhưng kinh nghiệm của các cô chú làm vườn lâu năm lại khác:

1. Nhìn phần cuống và màu sắc: Rau củ tự nhiên có màu xanh sáng nhạt, cuống còn tươi nhựa chứ không thâm nhũn.
2. Trọng lượng khi cầm trên tay: Quả tươi cầm chắc nịch, nặng tay, cùi dày mọng nước.
3. Độ giòn: Bấm nhẹ thấy giòn ngọt, không xơ ráp.

Chỉ cần để ý 3 chi tiết nhỏ này là bạn đã an tâm chuẩn bị bữa ăn trọn vẹn dinh dưỡng cho cả nhà.

${preferredCta}

${hashtags}`,
          visualDirection: {
            concept: 'Hình ảnh so sánh trực quan cận cảnh rổ rau củ tươi non, giọt nước đọng trên lá, phong cách chụp tạp chí ẩm thực hiện đại',
            aiPrompt: 'Editorial flatlay photography of fresh organic vegetables on clean kitchen counter, water droplets on green leaves, wooden cutting board, bright natural daylight, clean and sharp focus --ar 4:5 --v 6.0',
            aspectRatio: '4:5',
            textOverlay: '3 Mẹo Chọn Rau Sạch',
            colorTone: '#059669'
          }
        },
        {
          angleKey: 'conversational',
          angleTitle: 'Tương Tác & Thảo Luận',
          angleBadge: '💬 Chuyện Trò Bếp Núc',
          headline: 'Bữa nay bếp nhà bạn nấu món gì thế?',
          content: `${topicHook || 'Trời này mà quây quần bên mâm cơm nóng thì còn gì bằng.'}

${topicTitle}: Có nhà thích canh chua thanh mát, có nhà lại chuộng món xào tỏi thơm lừng. Mỗi người một thói quen nêm nếm, nhưng chung quy lại vẫn là cảm giác được ngồi lại cùng những người thân yêu.

Còn bếp nhà bạn hôm nay, món đinh trên bàn ăn là gì? Khoe nhẹ tấm ảnh dưới phần bình luận để team VHFresh học lỏm công thức với nha!

${hashtags}`,
          visualDirection: {
            concept: 'Bức ảnh ấm áp đôi bàn tay đang nhặt rau bên hiên nhà, gợi cảm giác thân thuộc của tuổi thơ và bếp mẹ',
            aiPrompt: 'Cozy candid shot of caring hands preparing fresh green vegetables, warm vintage kitchen aesthetic, soft morning light, emotional storytelling tone --ar 1:1 --v 6.0',
            aspectRatio: '1:1',
            textOverlay: 'Hôm Nay Ăn Gì?',
            colorTone: '#f59e0b'
          }
        }
      ];
    }

    if (brandId.includes('ngam') || brandId.includes('life') || brandId.includes('mind')) {
      return [
        {
          angleKey: 'storytelling',
          angleTitle: 'Storytelling & Cảm Xúc',
          angleBadge: '📖 Tản Văn Sâu Lắng',
          headline: 'Khoảng lặng giữa dòng đời vội vã',
          content: `${topicHook || 'Có những ngày chỉ muốn tắt chuông điện thoại, ngồi yên nghe một bản nhạc cũ.'}

Chúng ta thường mải miết chạy theo những kỳ vọng của người khác mà quên mất tự hỏi bản thân đang cảm thấy thế nào.

${topicTitle}: Đôi khi sự trưởng thành không nằm ở việc bạn làm được bao nhiêu việc lớn, mà là khi bạn học được cách nhẹ nhàng với chính mình sau những chông chênh.

Dừng lại một nhịp thở. Cuộc đời không phải là một cuộc đua mà ai về đích trước cũng là người chiến thắng.

${preferredCta}

${hashtags}`,
          visualDirection: {
            concept: 'Bức ảnh tối giản một tách trà nóng bên khung cửa sổ mờ sương, cuốn sách mở ngỏ, gợi cảm giác bình yên sâu sắc',
            aiPrompt: 'Minimalist cinematic aesthetic photography of warm cup of tea beside rainy window, opened book, thoughtful mood, moody natural soft light, muted film grain --ar 4:5 --v 6.0',
            aspectRatio: '4:5',
            textOverlay: 'Học Cách Chậm Lại',
            colorTone: '#6366f1'
          }
        },
        {
          angleKey: 'educational',
          angleTitle: 'Kiến Thức Thực Tế',
          angleBadge: '💡 Tâm Lý Ứng Dụng',
          headline: 'Nhìn nhận lại ranh giới của sự bận rộn',
          content: `${topicTitle}

Tâm lý học có một khái niệm gọi là "ảo tưởng bận rộn": Khi ta cố lấp đầy từng khoảng trống trong lịch trình chỉ để tránh phải đối diện với cảm giác trống trải bên trong.

Để thoát khỏi vòng xoáy này, hãy thử 2 điều:
- Dành ra 15 phút mỗi ngày không điện thoại, không công việc.
- Tập nói "không" với những cuộc hẹn chỉ vì cả nể.

Giữ cho tâm trí có chỗ trống chính là cách tốt nhất để năng lượng tích cực quay trở lại.

${preferredCta}

${hashtags}`,
          visualDirection: {
            concept: 'Đồ họa tối giản đen trắng thanh lịch, dòng trích dẫn tinh tế giữa không gian thở khoáng đạt',
            aiPrompt: 'Clean minimalist typography poster background, neutral beige and charcoal aesthetic, soft abstract architectural shadow, zen atmosphere --ar 4:5 --v 6.0',
            aspectRatio: '4:5',
            textOverlay: 'Giải Phóng Tâm Trí',
            colorTone: '#475569'
          }
        },
        {
          angleKey: 'conversational',
          angleTitle: 'Tương Tác & Thảo Luận',
          angleBadge: '💬 Lắng Nghe Bạn Đọc',
          headline: 'Điều gì gần đây làm bạn cảm thấy nhẹ lòng nhất?',
          content: `${topicTitle}

Người ta bảo càng lớn, niềm vui càng giản dị. Một buổi sáng thức dậy thấy trời không mưa, một bữa tối ăn cùng người thân, hay đơn giản là hoàn thành xong việc tồn đọng trước hạn.

Còn với bạn, khoảnh khắc nào trong tuần qua khiến bạn mỉm cười nhẹ nhõm nhất? Để lại một dòng ở đây như một trạm dừng nghỉ nhé.

${hashtags}`,
          visualDirection: {
            concept: 'Hình ảnh một góc quán cà phê vắng người vào buổi sớm mai, ánh nắng len qua tán lá chiếu lên mặt bàn gỗ mộc',
            aiPrompt: 'Peaceful quiet coffee shop corner at dawn, sunlight dappling on wooden table, empty chair, slow living aesthetic, nostalgic cinematic --ar 1:1 --v 6.0',
            aspectRatio: '1:1',
            textOverlay: 'Trạm Dừng Nghỉ',
            colorTone: '#8b5cf6'
          }
        }
      ];
    }

    // Default Template for any brand
    return [
      {
        angleKey: 'storytelling',
        angleTitle: 'Storytelling & Cảm Xúc',
        angleBadge: '📖 Góc Nhìn Người Trong Cuộc',
        headline: `Câu chuyện đằng sau ${profile.brandName}`,
        content: `${topicHook || 'Có những điều chỉ khi bắt tay vào làm thật lâu mới thấm thía.'}

${topicTitle}: Phía sau mỗi kết quả tốt đẹp không phải là sự may mắn ngẫu nhiên, mà là sự kiên trì gom nhặt từ từng chi tiết nhỏ mỗi ngày.

Chúng mình tin rằng sự chân thành và chất lượng thực tế sẽ luôn tìm được những người đồng điệu.

${preferredCta}

${hashtags}`,
        visualDirection: {
          concept: 'Hình ảnh không gian làm việc chân thực, chuyên nghiệp và ấm áp, thể hiện sự tận tâm',
          aiPrompt: 'Professional documentary style photography, authentic workplace ambiance, natural warm lighting, genuine human craftsmanship --ar 4:5 --v 6.0',
          aspectRatio: '4:5',
          textOverlay: 'Giá Trị Thực Sự',
          colorTone: '#2563eb'
        }
      },
      {
        angleKey: 'educational',
        angleTitle: 'Kiến Thức Thực Tế',
        angleBadge: '💡 Chia Sẻ Giá Trị',
        headline: `Những điều cần lưu ý về ${topicTitle}`,
        content: `${topicTitle}

Khi tìm kiếm giải pháp phù hợp, đây là 3 yếu tố bạn nên cân nhắc kỹ trước khi quyết định:

1. Tính thực tế và phù hợp với nhu cầu hiện tại.
2. Nguồn gốc rõ ràng và cam kết minh bạch.
3. Sự đồng hành và hỗ trợ lâu dài.

Hi vọng những chia sẻ này sẽ giúp bạn có thêm góc nhìn hữu ích và tự tin hơn.

${preferredCta}

${hashtags}`,
        visualDirection: {
          concept: 'Infographic hiện đại, bố cục rõ ràng, sắc nét với tông màu thương hiệu',
          aiPrompt: 'Clean modern corporate infographic aesthetic, high resolution, minimalist geometric layout, balanced typography space --ar 4:5 --v 6.0',
          aspectRatio: '4:5',
          textOverlay: '3 Yếu Tố Cốt Lõi',
          colorTone: '#0284c7'
        }
      },
      {
        angleKey: 'conversational',
        angleTitle: 'Tương Tác & Thảo Luận',
        angleBadge: '💬 Thảo Luận Mở',
        headline: 'Ý kiến của bạn thì sao?',
        content: `${topicTitle}

Mỗi người trong chúng ta đều có những trải nghiệm và tiêu chuẩn riêng khi đánh giá một vấn đề.

Bạn đồng tình với góc nhìn nào nhất? Hãy để lại bình luận để cùng nhau trao đổi nhé!

${hashtags}`,
        visualDirection: {
          concept: 'Bức ảnh tối giản khơi gợi đối thoại, câu hỏi mở ở vị trí trung tâm',
          aiPrompt: 'Minimalist conceptual conversation photography, clean background, modern aesthetic, vibrant and engaging vibe --ar 1:1 --v 6.0',
          aspectRatio: '1:1',
          textOverlay: 'Cùng Thảo Luận',
          colorTone: '#f59e0b'
        }
      }
    ];
  }
}

module.exports = new MarketingContentService();
