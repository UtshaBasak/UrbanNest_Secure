import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'utsha.basak.v2@gmail.com',
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

/**
 * Send an OTP email.
 * @param {string} toEmail – recipient email
 * @param {string} otp – the OTP code
 * @param {string} purpose – 'signup' | 'forgot-password' | 'email-change' | '2fa-login'
 */
export async function sendOtpEmail(toEmail, otp, purpose) {
  const purposeLabels = {
    'signup': 'Email Verification',
    'forgot-password': 'Password Reset',
    'email-change': 'Email Change Verification',
    '2fa-login': 'Two-Factor Authentication',
  };
  const label = purposeLabels[purpose] || 'Verification';

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #0891b2, #06b6d4); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">UrbanNest</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">${label}</p>
      </div>
      <div style="padding: 32px 24px;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Your verification code is:
        </p>
        <div style="background: #f0fdfa; border: 2px dashed #0891b2; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0891b2; font-family: 'Courier New', monospace;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0 0 8px;">
          This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin: 16px 0 0;">
          If you did not request this code, please ignore this email.
        </p>
      </div>
      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} UrbanNest. All rights reserved.</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"UrbanNest" <${process.env.EMAIL_USER || 'utsha.basak.v2@gmail.com'}>`,
    to: toEmail,
    subject: `Your OTP for UrbanNest ${label} is here!`,
    html,
  };

  try {
    await getTransporter().sendMail(mailOptions);
    console.log(`[EmailService] OTP sent to ${toEmail} for ${purpose}`);
  } catch (error) {
    console.error('[EmailService] Failed to send email:', error.message);
    throw new Error('Failed to send verification email. Please try again.');
  }
}

export default { sendOtpEmail };
