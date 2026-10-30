/**
 * employerEmailWorkflow.js - Quy Trình Email Tự Động Hóa Doanh Nghiệp & Khách Hàng (Employer Email Workflow)
 * Tuân thủ Section 9 Master Prompt Auto Email:
 * - Tiếp cận tự động (Outreach B2B): Chào giải pháp tuyển dụng tới các doanh nghiệp tìm thấy qua cào nhóm.
 * - Gửi báo giá gói dịch vụ (Quotation): Gửi bảng giá gói đẩy tin Top, Combo tuyển dụng theo tháng.
 * - Chào giỏ hàng BĐS (Real Estate Rental Quote): Báo giá và giới thiệu căn hộ cho khách thuê tiềm năng.
 * - Tích hợp CRM Timeline khách hàng.
 */
const logger = require('../../../core/utils/logger');
const auditLogger = require('../../../core/services/auditLogger');
const emailTemplateService = require('../../../core/services/emailTemplateService');
const emailQueueService = require('../../../core/services/emailQueueService');

class EmployerEmailWorkflow {
  /**
   * Gửi email tiếp cận B2B chào giải pháp tuyển dụng
   */
  sendOutreachEmail({
    companyName,
    recipientEmail,
    recipientName = 'Ban Giám Đốc / Phòng Nhân Sự',
    jobTitle = 'Nhân sự',
    location = 'Hồ Chí Minh & Hà Nội',
    contactPhone = '0971946725',
    leadId = null,
    providerId = null
  }) {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new Error('Email doanh nghiệp không hợp lệ.');
    }

    const variables = {
      companyName: companyName || 'Quý Doanh Nghiệp',
      jobTitle,
      location,
      contactPhone
    };

    const rendered = emailTemplateService.renderTemplate('tmpl_employer_outreach', variables);

    const cleanCompany = (companyName || '').replace(/[^a-zA-Z0-9]/g, '');
    const idempotencyKey = `outreach_${cleanCompany}_${recipientEmail}`;

    const job = emailQueueService.addEmailJob({
      providerId,
      to: recipientEmail,
      toName: recipientName,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      category: 'employer',
      leadId,
      idempotencyKey
    });

    auditLogger.log({
      actor: 'EmployerWorkflow',
      action: 'TRIGGER_EMPLOYER_OUTREACH',
      module: 'EMAIL_WORKFLOW',
      target: recipientEmail,
      status: 'SUCCESS',
      details: { jobId: job.id, companyName, jobTitle }
    });

    return job;
  }

  /**
   * Gửi bảng báo giá dịch vụ tuyển dụng
   */
  sendQuotationEmail({
    companyName,
    recipientEmail,
    recipientName = 'Phòng Mua Hàng / Nhân Sự',
    promoValidUntil = null,
    contactPhone = '0971946725',
    leadId = null,
    providerId = null
  }) {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new Error('Email doanh nghiệp không hợp lệ.');
    }

    // Mặc định khuyến mãi đến cuối tháng
    const validUntilDate = promoValidUntil || new Date(Date.now() + 15 * 86400000).toLocaleDateString('vi-VN');

    const variables = {
      companyName: companyName || 'Quý Khách Hàng',
      promoValidUntil: validUntilDate,
      contactPhone
    };

    const rendered = emailTemplateService.renderTemplate('tmpl_employer_quotation', variables);

    const cleanCompany = (companyName || '').replace(/[^a-zA-Z0-9]/g, '');
    const idempotencyKey = `quote_${cleanCompany}_${recipientEmail}`;

    const job = emailQueueService.addEmailJob({
      providerId,
      to: recipientEmail,
      toName: recipientName,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      category: 'employer',
      leadId,
      idempotencyKey
    });

    auditLogger.log({
      actor: 'EmployerWorkflow',
      action: 'TRIGGER_EMPLOYER_QUOTATION',
      module: 'EMAIL_WORKFLOW',
      target: recipientEmail,
      status: 'SUCCESS',
      details: { jobId: job.id, companyName }
    });

    return job;
  }

  /**
   * Gửi báo giá & thông tin căn hộ BĐS cho khách thuê
   */
  sendBdsPropertyQuote({
    clientName,
    recipientEmail,
    propertyTitle = 'Căn Hộ 1PN - 2PN Sơn Trà',
    rentalPrice = '8.5 triệu/tháng',
    area = '55m²',
    location = 'Sơn Trà, Đà Nẵng',
    furniture = 'Full nội thất cao cấp',
    contactPhone = '0971946725',
    leadId = null,
    providerId = null
  }) {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new Error('Email khách hàng không hợp lệ.');
    }

    const variables = {
      clientName: clientName || 'Quý Khách',
      propertyTitle,
      rentalPrice,
      area,
      location,
      furniture,
      contactPhone
    };

    const rendered = emailTemplateService.renderTemplate('tmpl_bds_quote', variables);

    const idempotencyKey = `bds_quote_${clientName || ''}_${recipientEmail}_${propertyTitle.substring(0, 15)}`;

    const job = emailQueueService.addEmailJob({
      providerId,
      to: recipientEmail,
      toName: clientName,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      category: 'bds',
      leadId,
      idempotencyKey
    });

    auditLogger.log({
      actor: 'EmployerWorkflow',
      action: 'TRIGGER_BDS_QUOTE',
      module: 'EMAIL_WORKFLOW',
      target: recipientEmail,
      status: 'SUCCESS',
      details: { jobId: job.id, propertyTitle, clientName }
    });

    return job;
  }
}

module.exports = new EmployerEmailWorkflow();
