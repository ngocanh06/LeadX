/**
 * candidateEmailWorkflow.js - Quy Trình Email Tự Động Hóa Dành Cho Ứng Viên (Candidate Email Workflow)
 * Tuân thủ Section 8 Master Prompt Auto Email:
 * - Tiếp nhận hồ sơ (Acknowledgement): Tự động phản hồi xác nhận khi có ứng viên mới.
 * - Mời phỏng vấn (Interview Invitation): Gửi thư mời chuyên nghiệp kèm địa điểm, giờ hẹn, người liên hệ.
 * - Nhắc lịch phỏng vấn (Interview Reminder): Tự động nhắc nhở trước 24 giờ.
 * - Gắn vết trực tiếp vào CRM Timeline của ứng viên.
 */
const logger = require('../../../core/utils/logger');
const auditLogger = require('../../../core/services/auditLogger');
const emailTemplateService = require('../../../core/services/emailTemplateService');
const emailQueueService = require('../../../core/services/emailQueueService');

class CandidateEmailWorkflow {
  /**
   * Gửi thư tiếp nhận hồ sơ ứng tuyển
   */
  sendAcknowledgement({
    candidateName,
    candidateEmail,
    jobTitle = 'Chuyên viên Kinh Doanh',
    companyName = 'LeadX & Đối Tác Doanh Nghiệp',
    location = 'Đà Nẵng',
    contactPhone = '0971946725',
    leadId = null,
    providerId = null
  }) {
    if (!candidateEmail || !candidateEmail.includes('@')) {
      throw new Error('Email ứng viên không hợp lệ.');
    }

    const variables = {
      candidateName: candidateName || 'Bạn',
      jobTitle,
      companyName,
      location,
      submittedAt: new Date().toLocaleString('vi-VN'),
      contactPhone
    };

    const rendered = emailTemplateService.renderTemplate('tmpl_candidate_ack', variables);

    const idempotencyKey = `ack_${leadId || candidateEmail}_${jobTitle.replace(/\s+/g, '')}`;

    const job = emailQueueService.addEmailJob({
      providerId,
      to: candidateEmail,
      toName: candidateName,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      category: 'candidate',
      leadId,
      idempotencyKey
    });

    auditLogger.log({
      actor: 'CandidateWorkflow',
      action: 'TRIGGER_CANDIDATE_ACK',
      module: 'EMAIL_WORKFLOW',
      target: candidateEmail,
      status: 'SUCCESS',
      details: { jobId: job.id, jobTitle, candidateName }
    });

    return job;
  }

  /**
   * Gửi thư mời phỏng vấn
   */
  sendInterviewInvitation({
    candidateName,
    candidateEmail,
    jobTitle = 'Nhân viên Kinh Doanh',
    companyName = 'LeadX Platform',
    interviewTime,
    interviewLocation = 'Tầng 5, Tòa nhà LeadX Đà Nẵng',
    interviewerName = 'Hội Đồng Tuyển Dụng',
    contactPhone = '0971946725',
    leadId = null,
    appointmentId = null,
    providerId = null
  }) {
    if (!candidateEmail || !candidateEmail.includes('@')) {
      throw new Error('Email ứng viên không hợp lệ.');
    }
    if (!interviewTime) {
      throw new Error('Thời gian phỏng vấn không được để trống.');
    }

    const variables = {
      candidateName: candidateName || 'Ứng viên',
      jobTitle,
      companyName,
      interviewTime,
      interviewLocation,
      interviewerName,
      contactPhone
    };

    const rendered = emailTemplateService.renderTemplate('tmpl_interview_invite', variables);

    const idempotencyKey = `invite_${appointmentId || leadId || candidateEmail}_${new Date(interviewTime).getTime() || Date.now()}`;

    const job = emailQueueService.addEmailJob({
      providerId,
      to: candidateEmail,
      toName: candidateName,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      category: 'candidate',
      leadId,
      idempotencyKey
    });

    auditLogger.log({
      actor: 'CandidateWorkflow',
      action: 'TRIGGER_INTERVIEW_INVITE',
      module: 'EMAIL_WORKFLOW',
      target: candidateEmail,
      status: 'SUCCESS',
      details: { jobId: job.id, interviewTime, location: interviewLocation }
    });

    return job;
  }

  /**
   * Gửi thư nhắc lịch phỏng vấn trước 24 giờ
   */
  sendInterviewReminder({
    candidateName,
    candidateEmail,
    jobTitle = 'Ứng Tuyển',
    interviewTime,
    interviewLocation = 'Tại Văn Phòng LeadX',
    contactPhone = '0971946725',
    leadId = null,
    appointmentId = null,
    scheduledAt = null,
    providerId = null
  }) {
    if (!candidateEmail || !candidateEmail.includes('@')) {
      throw new Error('Email ứng viên không hợp lệ.');
    }

    const variables = {
      candidateName: candidateName || 'Bạn',
      jobTitle,
      interviewTime,
      interviewLocation,
      contactPhone
    };

    const rendered = emailTemplateService.renderTemplate('tmpl_interview_reminder', variables);

    const idempotencyKey = `reminder_${appointmentId || leadId || candidateEmail}`;

    const job = emailQueueService.addEmailJob({
      providerId,
      to: candidateEmail,
      toName: candidateName,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      category: 'candidate',
      leadId,
      scheduledAt,
      idempotencyKey
    });

    auditLogger.log({
      actor: 'CandidateWorkflow',
      action: 'TRIGGER_INTERVIEW_REMINDER',
      module: 'EMAIL_WORKFLOW',
      target: candidateEmail,
      status: 'SUCCESS',
      details: { jobId: job.id, interviewTime }
    });

    return job;
  }
}

module.exports = new CandidateEmailWorkflow();
