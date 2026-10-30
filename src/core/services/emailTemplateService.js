/**
 * emailTemplateService.js - Quản Lý Bản Mẫu Email Chuyên Nghiệp (Email Templates Studio)
 * Tuân thủ Section 7 Master Prompt Auto Email:
 * - Hệ thống mẫu email HTML chuẩn Responsive cho Tuyển dụng & BĐS.
 * - Bộ nội suy biến thông minh {{variable}} (Tên ứng viên, Công ty, Ngày phỏng vấn, Địa chỉ, Báo giá, Link Zalo).
 * - Lưu trữ bền vững tại data/email_templates.json.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');

const DEFAULT_TEMPLATES = [
  {
    id: 'tmpl_candidate_ack',
    name: 'Thư Tiếp Nhận Hồ Sơ Ứng Tuyển',
    category: 'candidate',
    subject: '【LeadX】Xác Nhận Đã Nhận Hồ Sơ Ứng Tuyển Vị Trí {{jobTitle}} - {{candidateName}}',
    bodyText: 'Kính gửi {{candidateName}},\n\nLeadX đã nhận được hồ sơ ứng tuyển của bạn cho vị trí {{jobTitle}}.\nBộ phận tuyển dụng đang tiến hành đánh giá năng lực và sẽ liên hệ lại với bạn trong vòng 24 - 48 giờ làm việc.\n\nThông tin tiếp nhận:\n- Vị trí: {{jobTitle}}\n- Khu vực làm việc: {{location}}\n- Hotline hỗ trợ: {{contactPhone}}\n\nTrân trọng,\nPhòng Tuyển Dụng & Phát Triển Nhân Tài LeadX',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background: #2563eb; padding: 24px; text-align: center; color: #ffffff;">
    <h2 style="margin: 0; font-size: 20px;">XÁC NHẬN TIẾP NHẬN HỒ SƠ</h2>
    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Hệ Thống Quản Lý Tuyển Dụng & Nhân Tài LeadX</p>
  </div>
  <div style="padding: 24px;">
    <p>Kính gửi <strong>{{candidateName}}</strong>,</p>
    <p>Cảm ơn bạn đã quan tâm và nộp hồ sơ ứng tuyển vị trí <strong>{{jobTitle}}</strong> tại {{companyName}}.</p>
    <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Thông Tin Ứng Tuyển:</strong></p>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569;">
        <li>Vị trí: <strong>{{jobTitle}}</strong></li>
        <li>Doanh nghiệp: <strong>{{companyName}}</strong></li>
        <li>Khu vực: <strong>{{location}}</strong></li>
        <li>Thời gian ghi nhận: <strong>{{submittedAt}}</strong></li>
      </ul>
    </div>
    <p>Hội đồng tuyển dụng đang tiến hành đánh giá chi tiết năng lực chuyên môn của bạn. Nếu hồ sơ phù hợp, chúng tôi sẽ liên hệ trực tiếp qua điện thoại hoặc gửi thư mời phỏng vấn trong vòng <strong>24 - 48 giờ</strong>.</p>
    <p>Mọi thắc mắc cần hỗ trợ, bạn vui lòng liên hệ hotline: <strong>{{contactPhone}}</strong> (Zalo/Call).</p>
    <p style="margin-top: 24px;">Chúc bạn một ngày làm việc hiệu quả và nhiều năng lượng!</p>
    <p style="margin: 0; font-weight: bold; color: #2563eb;">Phòng Tuyển Dụng & Phát Triển Nguồn Nhân Lực</p>
  </div>
  <div style="background: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
    LeadX Platform • Nền Tảng Marketing Automation & CRM Doanh Nghiệp
  </div>
</div>`,
    variables: ['candidateName', 'jobTitle', 'companyName', 'location', 'submittedAt', 'contactPhone'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'tmpl_interview_invite',
    name: 'Thư Mời Phỏng Vấn Chính Thức',
    category: 'candidate',
    subject: '【Thư Mời Phỏng Vấn】Vị Trí {{jobTitle}} - Ứng Viên {{candidateName}}',
    bodyText: 'Kính gửi {{candidateName}},\n\nChúc mừng bạn đã vượt qua vòng sơ loại hồ sơ. LeadX trân trọng kính mời bạn tham gia buổi phỏng vấn trực tiếp.\n\nThông tin buổi phỏng vấn:\n- Thời gian: {{interviewTime}}\n- Địa điểm / Hình thức: {{interviewLocation}}\n- Người liên hệ: {{interviewerName}} - {{contactPhone}}\n\nVui lòng xác nhận sự có mặt của bạn bằng cách phản hồi lại email này hoặc liên hệ qua SĐT trên.\n\nTrân trọng!',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background: #0284c7; padding: 24px; text-align: center; color: #ffffff;">
    <h2 style="margin: 0; font-size: 20px;">THƯ MỜI PHỎNG VẤN CHÍNH THỨC</h2>
    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Vị trí tuyển dụng: {{jobTitle}}</p>
  </div>
  <div style="padding: 24px;">
    <p>Kính gửi <strong>{{candidateName}}</strong>,</p>
    <p>Sau khi xem xét hồ sơ năng lực của bạn, chúng tôi rất ấn tượng với kinh nghiệm và định hướng phát triển của bạn. Đại diện {{companyName}} trân trọng mời bạn tham gia buổi phỏng vấn trao đổi chi tiết về công việc.</p>
    
    <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 18px; margin: 20px 0;">
      <h4 style="margin: 0 0 12px 0; color: #0369a1; font-size: 15px;">Chi Tiết Lịch Hẹn Phỏng Vấn:</h4>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; width: 130px; color: #64748b;"><strong>⏰ Thời gian:</strong></td>
          <td style="padding: 6px 0; font-weight: bold; color: #0284c7;">{{interviewTime}}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><strong>📍 Địa điểm / Hình thức:</strong></td>
          <td style="padding: 6px 0; font-weight: bold;">{{interviewLocation}}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><strong>👤 Người phỏng vấn:</strong></td>
          <td style="padding: 6px 0;">{{interviewerName}}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><strong>📞 Hotline hỗ trợ:</strong></td>
          <td style="padding: 6px 0; font-weight: bold; color: #0284c7;">{{contactPhone}}</td>
        </tr>
      </table>
    </div>

    <p><strong>Lưu ý chuẩn bị:</strong></p>
    <ul style="font-size: 13px; color: #475569; padding-left: 20px;">
      <li>Mang theo 01 bản CV cứng (nếu phỏng vấn trực tiếp tại văn phòng).</li>
      <li>Vui lòng có mặt/online trước giờ hẹn <strong>10 phút</strong>.</li>
    </ul>

    <p>Vui lòng <strong>phản hồi lại email này</strong> (hoặc nhắn tin qua Zalo số {{contactPhone}}) để xác nhận sự có mặt của bạn.</p>
    <p style="margin-top: 24px;">Rất mong được gặp gỡ và trao đổi trực tiếp cùng bạn!</p>
  </div>
</div>`,
    variables: ['candidateName', 'jobTitle', 'companyName', 'interviewTime', 'interviewLocation', 'interviewerName', 'contactPhone'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'tmpl_interview_reminder',
    name: 'Thư Nhắc Lịch Phỏng Vấn Trước 24 Giờ',
    category: 'candidate',
    subject: '【Nhắc Lịch】Buổi Phỏng Vấn Vị Trí {{jobTitle}} Vào Ngày Mai ({{interviewTime}})',
    bodyText: 'Kính gửi {{candidateName}},\n\nLeadX xin nhắc bạn lịch hẹn phỏng vấn cho vị trí {{jobTitle}} diễn ra vào ngày mai:\n- Thời gian: {{interviewTime}}\n- Địa điểm: {{interviewLocation}}\n- Hotline: {{contactPhone}}\n\nChúc bạn có một buổi phỏng vấn thành công tốt đẹp!',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background: #f59e0b; padding: 20px; text-align: center; color: #ffffff;">
    <h3 style="margin: 0; font-size: 18px;">NHẮC HẸN PHỎNG VẤN (NGÀY MAI)</h3>
  </div>
  <div style="padding: 24px;">
    <p>Chào <strong>{{candidateName}}</strong>,</p>
    <p>LeadX xin gửi thông báo nhắc bạn về buổi hẹn phỏng vấn vị trí <strong>{{jobTitle}}</strong> sẽ diễn ra vào ngày mai:</p>
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 14px; margin: 16px 0; font-size: 14px;">
      <p style="margin: 4px 0;">⏰ <strong>Thời gian:</strong> <span style="color: #b45309; font-weight: bold;">{{interviewTime}}</span></p>
      <p style="margin: 4px 0;">📍 <strong>Địa điểm:</strong> {{interviewLocation}}</p>
      <p style="margin: 4px 0;">📞 <strong>Hotline:</strong> {{contactPhone}}</p>
    </div>
    <p>Nếu có bất kỳ sự thay đổi đột xuất nào về lịch trình, bạn vui lòng thông báo sớm qua hotline để công ty sắp xếp hỗ trợ bạn tốt nhất nhé.</p>
    <p>Chúc bạn tự tin và đạt kết quả tốt nhất!</p>
  </div>
</div>`,
    variables: ['candidateName', 'jobTitle', 'interviewTime', 'interviewLocation', 'contactPhone'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'tmpl_employer_outreach',
    name: 'Thư Tiếp Cận Doanh Nghiệp Tuyển Dụng (B2B Outreach)',
    category: 'employer',
    subject: '【Giải Pháp Tuyển Dụng】Cung Ứng Nhân Sự Đẩy Nhanh Cho {{companyName}}',
    bodyText: 'Kính gửi Ban Giám Đốc / Bộ Phận Nhân Sự {{companyName}},\n\nChúng tôi được biết quý doanh nghiệp đang có nhu cầu tuyển gấp các vị trí nhân sự. LeadX là nền tảng tự động hóa tuyển dụng đa kênh kết nối hơn 157+ Hội nhóm Facebook và hệ thống 34 Fanpage toàn quốc.\n\nChúng tôi xin gửi giải pháp tiếp cận 10.000+ ứng viên tiềm năng đúng chuyên môn chỉ trong 48h.\nHotline tư vấn: {{contactPhone}}\n\nTrân trọng!',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background: #1e40af; padding: 24px; text-align: center; color: #ffffff;">
    <h2 style="margin: 0; font-size: 20px;">GIẢI PHÁP TIẾP CẬN ỨNG VIÊN ĐA KÊNH</h2>
    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Tối Ưu Chi Phí Tuyển Dụng Cho {{companyName}}</p>
  </div>
  <div style="padding: 24px;">
    <p>Kính gửi Quý Doanh Nghiệp <strong>{{companyName}}</strong>,</p>
    <p>Qua theo dõi thị trường lao động tại khu vực <strong>{{location}}</strong>, LeadX được biết Quý công ty đang có nhu cầu bổ sung nhân sự cho vị trí <strong>{{jobTitle}}</strong>.</p>
    <p>Thay vì mất nhiều tuần chờ đợi hồ sơ thụ động từ các trang việc làm truyền thống với chi phí đắt đỏ, <strong>LeadX Engine</strong> mang đến giải pháp tiếp cận chủ động:</p>
    
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.8;">
        <li>🚀 <strong>Phủ sóng đồng thời:</strong> Mạng lưới 157+ Hội Nhóm Tuyển Dụng Facebook & 34 Fanpage khu vực.</li>
        <li>🎯 <strong>Trí tuệ nhân tạo (Lead AI):</strong> Tự động lọc ứng viên có SĐT thật, đúng độ tuổi và kinh nghiệm yêu cầu.</li>
        <li>⚡ <strong>Hiệu quả thần tốc:</strong> Nhận danh sách 10 - 25 ứng viên sẵn sàng đi làm ngay trong 48 giờ.</li>
      </ul>
    </div>

    <p>Chúng tôi rất mong có cơ hội gửi bản báo giá chi tiết và trao đổi phương án cung ứng nhân sự phù hợp nhất cho Quý công ty.</p>
    <div style="text-align: center; margin: 25px 0;">
      <a href="tel:{{contactPhone}}" style="background: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
        📞 Kết Nối Tư Vấn Ngay: {{contactPhone}}
      </a>
    </div>
    <p style="font-size: 13px; color: #64748b;">Trân trọng,<br><strong>Đội Ngũ Giải Pháp Doanh Nghiệp LeadX</strong></p>
  </div>
</div>`,
    variables: ['companyName', 'location', 'jobTitle', 'contactPhone'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'tmpl_employer_quotation',
    name: 'Báo Giá Gói Dịch Vụ Đẩy Tin & Tuyển Dụng',
    category: 'employer',
    subject: '【Bảng Báo Giá】Gói Dịch Vụ Tuyển Dụng & Đẩy Tin Top Cho {{companyName}}',
    bodyText: 'Kính gửi {{companyName}},\n\nLeadX trân trọng gửi Quý doanh nghiệp bảng báo giá các gói dịch vụ tuyển dụng hiệu quả cao:\n1. Gói Đăng Tin Tiêu Chuẩn (7 ngày): 1.500.000 đ\n2. Gói Đẩy Tin VIP & Ghim Top Nhóm (15 ngày): 3.500.000 đ\n3. Gói Combo Tuyển Dụng Toàn Diện Theo Tháng: 7.000.000 đ\n\nLiên hệ hotline: {{contactPhone}} để nhận ưu đãi chiết khấu 10% trong tháng này.',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background: #16a34a; padding: 24px; text-align: center; color: #ffffff;">
    <h2 style="margin: 0; font-size: 20px;">BẢNG BÁO GIÁ DỊCH VỤ TUYỂN DỤNG</h2>
    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Dành riêng cho Quý khách: {{companyName}}</p>
  </div>
  <div style="padding: 24px;">
    <p>Kính gửi Quý Khách Hàng <strong>{{companyName}}</strong>,</p>
    <p>LeadX trân trọng gửi bảng giá các gói giải pháp tuyển dụng tối ưu chi phí và cam kết tiếp cận ứng viên:</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
      <thead>
        <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
          <th style="padding: 10px; text-align: left;">Gói Dịch Vụ</th>
          <th style="padding: 10px; text-align: center;">Thời Gian</th>
          <th style="padding: 10px; text-align: right;">Đơn Giá</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px;">
            <strong>Gói Tiêu Chuẩn</strong><br>
            <span style="font-size: 12px; color: #64748b;">Đăng tin trên 15 nhóm & hệ thống Fanpage</span>
          </td>
          <td style="padding: 10px; text-align: center;">07 Ngày</td>
          <td style="padding: 10px; text-align: right; font-weight: bold; color: #16a34a;">1.500.000 đ</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0; background: #f0fdf4;">
          <td style="padding: 10px;">
            <strong style="color: #15803d;">Gói Đẩy Tin VIP (Ưa chuộng)</strong><br>
            <span style="font-size: 12px; color: #64748b;">Ghim Top đầu nhóm + Đẩy tin 3 lần/ngày</span>
          </td>
          <td style="padding: 10px; text-align: center;">15 Ngày</td>
          <td style="padding: 10px; text-align: right; font-weight: bold; color: #15803d; font-size: 14px;">3.500.000 đ</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px;">
            <strong>Gói Combo Toàn Diện</strong><br>
            <span style="font-size: 12px; color: #64748b;">Bao trọn gói đến khi tuyển đủ nhân sự</span>
          </td>
          <td style="padding: 10px; text-align: center;">30 Ngày</td>
          <td style="padding: 10px; text-align: right; font-weight: bold; color: #16a34a;">7.000.000 đ</td>
        </tr>
      </tbody>
    </table>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; font-size: 13px; color: #166534;">
      🎁 <strong>Ưu đãi đặc biệt:</strong> Tặng kèm 01 bài PR Fanpage Tuyển Dụng và giảm ngay <strong>10%</strong> khi thanh toán trước ngày <strong>{{promoValidUntil}}</strong>.
    </div>

    <p style="margin-top: 20px;">Hotline tư vấn và ký kết hợp đồng: <strong>{{contactPhone}}</strong></p>
  </div>
</div>`,
    variables: ['companyName', 'promoValidUntil', 'contactPhone'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'tmpl_bds_quote',
    name: 'Báo Giá & Chào Thuê Căn Hộ Bất Động Sản',
    category: 'bds',
    subject: '【Báo Giá Căn Hộ】Thông Tin & Hình Ảnh Thực Tế Căn Hộ {{propertyTitle}}',
    bodyText: 'Kính gửi Quý Khách {{clientName}},\n\nLeadX Real Estate xin gửi thông tin chi tiết căn hộ {{propertyTitle}}:\n- Giá thuê: {{rentalPrice}}\n- Diện tích: {{area}}\n- Vị trí: {{location}}\n- Nội thất: {{furniture}}\n\nXem nhà trực tiếp vui lòng liên hệ: {{contactPhone}}.\nTrân trọng!',
    bodyHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background: #ea580c; padding: 24px; text-align: center; color: #ffffff;">
    <h2 style="margin: 0; font-size: 20px;">THÔNG TIN CĂN HỘ CHO THUÊ</h2>
    <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">{{propertyTitle}}</p>
  </div>
  <div style="padding: 24px;">
    <p>Chào <strong>{{clientName}}</strong>,</p>
    <p>Theo nhu cầu thuê căn hộ của bạn tại khu vực <strong>{{location}}</strong>, LeadX gửi bạn thông số chi tiết của căn hộ vừa trống:</p>

    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; width: 120px; color: #9a3412;"><strong>💰 Giá thuê:</strong></td>
          <td style="padding: 6px 0; font-weight: bold; color: #c2410c; font-size: 15px;">{{rentalPrice}}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #9a3412;"><strong>📐 Diện tích:</strong></td>
          <td style="padding: 6px 0; font-weight: bold;">{{area}}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #9a3412;"><strong>📍 Vị trí:</strong></td>
          <td style="padding: 6px 0;">{{location}}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #9a3412;"><strong>🛋️ Nội thất:</strong></td>
          <td style="padding: 6px 0;">{{furniture}}</td>
        </tr>
      </table>
    </div>

    <p>Căn hộ có thể dọn vào ở ngay. Để được hỗ trợ mở cửa xem nhà trực tiếp hôm nay, bạn vui lòng liên hệ chuyên viên qua hotline: <strong>{{contactPhone}}</strong>.</p>
  </div>
</div>`,
    variables: ['clientName', 'propertyTitle', 'rentalPrice', 'area', 'location', 'furniture', 'contactPhone'],
    createdAt: new Date().toISOString()
  }
];

class EmailTemplateService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/email_templates.json');
    this.templates = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.templates = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || [];
        if (!Array.isArray(this.templates) || this.templates.length === 0) {
          this.templates = DEFAULT_TEMPLATES;
          this._save();
        }
      } else {
        this.templates = DEFAULT_TEMPLATES;
        this._save();
      }
    } catch (err) {
      logger.error(`[EMAIL_TEMPLATE] Lỗi nạp email_templates.json: ${err.message}`);
      this.templates = DEFAULT_TEMPLATES;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.templates, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[EMAIL_TEMPLATE] Lỗi ghi email_templates.json: ${err.message}`);
    }
  }

  getTemplates({ category, search } = {}) {
    let list = [...this.templates];
    if (category && category !== 'ALL') {
      list = list.filter(t => t.category === category);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => 
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.subject && t.subject.toLowerCase().includes(q))
      );
    }
    return list;
  }

  getTemplateById(id) {
    return this.templates.find(t => t.id === id) || null;
  }

  createTemplate({ name, category = 'candidate', subject, bodyText, bodyHtml, variables = [] }) {
    if (!name || !name.trim()) throw new Error('Tên mẫu email không được để trống.');
    if (!subject || !subject.trim()) throw new Error('Tiêu đề email không được để trống.');
    if (!bodyHtml || !bodyHtml.trim()) throw new Error('Nội dung HTML email không được để trống.');

    const newTmpl = {
      id: `tmpl_${category}_${Date.now().toString(36)}`,
      name: name.trim(),
      category,
      subject: subject.trim(),
      bodyText: bodyText ? bodyText.trim() : '',
      bodyHtml: bodyHtml.trim(),
      variables: Array.isArray(variables) ? variables : [],
      createdAt: new Date().toISOString()
    };

    this.templates.unshift(newTmpl);
    this._save();

    auditLogger.log({
      actor: 'EmailTemplateService',
      action: 'CREATE_EMAIL_TEMPLATE',
      module: 'EMAIL_ENGINE',
      target: newTmpl.name,
      status: 'SUCCESS',
      details: { templateId: newTmpl.id, category }
    });

    return newTmpl;
  }

  updateTemplate(id, updateData = {}) {
    const idx = this.templates.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Không tìm thấy mẫu email ID ${id}`);

    const existing = this.templates[idx];
    const updated = {
      ...existing,
      ...updateData,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };

    this.templates[idx] = updated;
    this._save();

    auditLogger.log({
      actor: 'EmailTemplateService',
      action: 'UPDATE_EMAIL_TEMPLATE',
      module: 'EMAIL_ENGINE',
      target: updated.name,
      status: 'SUCCESS',
      details: { templateId: id }
    });

    return updated;
  }

  deleteTemplate(id) {
    const idx = this.templates.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Không tìm thấy mẫu email ID ${id}`);

    const tmpl = this.templates[idx];
    this.templates.splice(idx, 1);
    this._save();

    auditLogger.log({
      actor: 'EmailTemplateService',
      action: 'DELETE_EMAIL_TEMPLATE',
      module: 'EMAIL_ENGINE',
      target: tmpl.name,
      status: 'WARNING',
      details: { templateId: id }
    });

    return { success: true, message: `Đã xóa mẫu email ${tmpl.name}` };
  }

  /**
   * Nội suy biến vào nội dung email (Subject, Text, HTML)
   * @param {string|Object} templateOrId
   * @param {Object} variables
   */
  renderTemplate(templateOrId, variables = {}) {
    const tmpl = typeof templateOrId === 'string' ? this.getTemplateById(templateOrId) : templateOrId;
    if (!tmpl) throw new Error('Mẫu email không tồn tại');

    const replaceVars = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, varName) => {
        return variables[varName] !== undefined && variables[varName] !== null ? variables[varName] : '';
      });
    };

    return {
      subject: replaceVars(tmpl.subject),
      bodyText: replaceVars(tmpl.bodyText),
      bodyHtml: replaceVars(tmpl.bodyHtml)
    };
  }
}

module.exports = new EmailTemplateService();
