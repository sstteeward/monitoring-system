// Email Service for SIL Monitoring System
// Manages email dispatch for student notifications (e.g. company approval/rejection).

interface EmailParams {
  to_email: string;
  student_name: string;
  company_name: string;
  status: 'approved' | 'rejected';
}

export const emailService = {
  /**
   * Sends an email notification to the student when their company request is approved.
   */
  async sendCompanyApprovalEmail(toEmail: string, studentName: string, companyName: string): Promise<boolean> {
    return this.sendEmail({
      to_email: toEmail,
      student_name: studentName,
      company_name: companyName,
      status: 'approved'
    });
  },

  /**
   * Sends an email notification to the student when their company request is rejected.
   */
  async sendCompanyRejectionEmail(toEmail: string, studentName: string, companyName: string): Promise<boolean> {
    return this.sendEmail({
      to_email: toEmail,
      student_name: studentName,
      company_name: companyName,
      status: 'rejected'
    });
  },

  /**
   * Dispatch engine supporting EmailJS REST API and console simulation fallback.
   */
  async sendEmail(params: EmailParams): Promise<boolean> {
    const { to_email, student_name, company_name, status } = params;
    
    const emailJsServiceId = (import.meta.env.VITE_EMAILJS_SERVICE_ID as string) || '';
    const emailJsTemplateId = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string) || '';
    const emailJsPublicKey = (import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string) || '';

    console.log('[EmailService] Config check:', {
      hasServiceId: !!emailJsServiceId,
      hasTemplateId: !!emailJsTemplateId,
      hasPublicKey: !!emailJsPublicKey,
      to_email,
      student_name,
      company_name,
      status
    });

    if (emailJsServiceId && emailJsTemplateId && emailJsPublicKey) {
      const messageText = status === 'approved'
        ? `Great news! Your request to add the company "${company_name}" has been approved. You can now access your dashboard and start logging your OJT hours.`
        : `Your request to add the company "${company_name}" was rejected by the coordinator. Please select an existing company or request a different one.`;

      const payload = {
        service_id: emailJsServiceId,
        template_id: emailJsTemplateId,
        user_id: emailJsPublicKey,
        template_params: {
          to_email,
          student_name,
          company_name,
          status_text: status === 'approved' ? 'APPROVED' : 'REJECTED',
          message: messageText
        }
      };

      console.log('[EmailService] Sending via EmailJS with payload:', JSON.stringify(payload, null, 2));

      try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log(`[EmailService] EmailJS response: status=${response.status}, body="${responseText}"`);

        if (!response.ok) {
          console.error(`[EmailService] EmailJS API error: HTTP ${response.status} - ${responseText}`);
          return false;
        }

        console.log(`[EmailService] ✅ Email sent successfully to ${to_email}`);
        return true;
      } catch (error) {
        console.error(`[EmailService] ❌ Network error sending email:`, error);
        return false;
      }
    }

    // Fallback: Mock simulation (no EmailJS keys configured)
    console.warn('[EmailService] ⚠️ EmailJS not configured — using console simulation.');
    const subject = status === 'approved' 
      ? `🎉 Company Request Approved: ${company_name}`
      : `⚠️ Company Request Update: ${company_name}`;

    const body = status === 'approved'
      ? `Hello ${student_name},\n\nYour request to add the company "${company_name}" has been approved by the coordinator! You can now log into your dashboard and begin recording your OJT hours.\n\nBest regards,\nSIL Monitoring Team`
      : `Hello ${student_name},\n\nYour request to add the company "${company_name}" was reviewed and rejected by the coordinator. Please check the coordinator's feedback, select an existing company, or submit a new request.\n\nBest regards,\nSIL Monitoring Team`;

    console.group(`[Email Simulation] Sent Email to ${to_email}`);
    console.log(`To:      ${to_email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);
    console.groupEnd();

    return true;
  }
};
