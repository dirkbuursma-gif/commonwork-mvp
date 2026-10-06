export type EmailPurpose =
  | 'recipient_consent_required'
  | 'connector_action_required'
  | 'requester_updated'
  | 'introduction_ready'
  | 'introduction_declined'
  | 'introduction_expired'
  | 'followup_requested'
  | 'connector_replaced'
  | 'conversation_completed'
  | 'privacy_request_received'
  | 'privacy_request_status_updated'
  | 'report_received';

export interface EmailTemplateInput {
  purpose: EmailPurpose;
  appBaseUrl: string;
  introductionId: string | null;
  privacyRequestId: string | null;
  reportId: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const templates: Record<EmailPurpose, { subject: string; heading: string; body: string; button: string }> = {
  recipient_consent_required: {
    subject: 'An introduction needs your response',
    heading: 'An introduction needs your response',
    body: 'A member has requested a professional introduction. Sign in to review the request and decide whether to proceed.',
    button: 'Review introduction',
  },
  connector_action_required: {
    subject: 'An introduction needs your help',
    heading: 'An introduction needs your help',
    body: 'You have been asked to facilitate a professional introduction. Sign in to review the request.',
    button: 'Review request',
  },
  requester_updated: {
    subject: 'There is an update on your introduction',
    heading: 'There is an update on your introduction',
    body: 'Sign in to review the latest update to your introduction request.',
    button: 'Review update',
  },
  introduction_ready: {
    subject: 'Your introduction is ready',
    heading: 'Your introduction is ready',
    body: 'The required participants have consented. Sign in to review the introduction and any released contact methods.',
    button: 'View introduction',
  },
  introduction_declined: {
    subject: 'Your introduction request will not proceed',
    heading: 'Your introduction request will not proceed',
    body: 'The introduction will not proceed. Sign in to review its status.',
    button: 'View status',
  },
  introduction_expired: {
    subject: 'Your introduction request has expired',
    heading: 'Your introduction request has expired',
    body: 'The introduction request expired before it was completed. Sign in to review its status.',
    button: 'View status',
  },
  followup_requested: {
    subject: 'Share private follow-up about an introduction',
    heading: 'Share private follow-up',
    body: 'When you are ready, sign in to share private feedback about your conversation.',
    button: 'Share follow-up',
  },
  connector_replaced: {
    subject: 'Your facilitation assignment changed',
    heading: 'Your facilitation assignment changed',
    body: 'The requester selected another facilitator. You no longer need to take action on this introduction.',
    button: 'Open Commonwork',
  },
  conversation_completed: {
    subject: 'Your conversation follow-up is complete',
    heading: 'Conversation follow-up is complete',
    body: 'Both participants completed the private follow-up. Thank you for closing the loop.',
    button: 'Open Commonwork',
  },
  privacy_request_received: {
    subject: 'Your privacy request was received',
    heading: 'Your privacy request was received',
    body: 'Your request is recorded for review. Sign in to see its current status.',
    button: 'View request status',
  },
  privacy_request_status_updated: {
    subject: 'Your privacy request was updated',
    heading: 'Your privacy request was updated',
    body: 'There is an update to your privacy request. Sign in to review its status.',
    button: 'View request status',
  },
  report_received: {
    subject: 'Your private report was received',
    heading: 'Your private report was received',
    body: 'Your report is recorded for review. Sign in to Commonwork if you need to revisit the introduction.',
    button: 'Open Commonwork',
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function baseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('APP_BASE_URL must use HTTPS outside local development.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function actionUrl(input: EmailTemplateInput): URL {
  const url = baseUrl(input.appBaseUrl);
  if (input.purpose === 'privacy_request_received' || input.purpose === 'privacy_request_status_updated') {
    url.pathname = '/profiles/me';
    return url;
  }
  if (input.purpose === 'report_received') {
    url.pathname = input.introductionId ? `/introductions/${encodeURIComponent(input.introductionId)}` : '/introductions';
    return url;
  }
  if (input.purpose === 'connector_replaced') {
    url.pathname = '/introductions';
    return url;
  }
  if (input.introductionId) {
    url.pathname = `/introductions/${encodeURIComponent(input.introductionId)}`;
    return url;
  }
  url.pathname = '/today';
  return url;
}

export function renderTransactionalEmail(input: EmailTemplateInput): RenderedEmail {
  const template = templates[input.purpose];
  if (!template) throw new Error('Unsupported transactional email purpose.');
  const href = actionUrl(input).toString();
  const safeHref = escapeHtml(href);
  const safeHeading = escapeHtml(template.heading);
  const safeBody = escapeHtml(template.body);
  const safeButton = escapeHtml(template.button);

  return {
    subject: template.subject,
    text: `${template.heading}\n\n${template.body}\n\n${template.button}: ${href}\n\nCommonwork`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6f3;color:#24312c;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #d9e1dc"><p style="margin:0 0 24px;color:#167052;font-size:13px;font-weight:700;letter-spacing:.06em">COMMONWORK</p><h1 style="font-size:24px;line-height:1.3">${safeHeading}</h1><p style="font-size:16px;line-height:1.6">${safeBody}</p><p style="margin:28px 0"><a href="${safeHref}" style="display:inline-block;padding:12px 18px;background:#176b50;color:#fff;text-decoration:none;font-weight:700">${safeButton}</a></p><p style="font-size:13px;color:#64736c">Sign in to Commonwork to view private details. This email does not include request notes, evidence, or contact information.</p></main></body></html>`,
  };
}