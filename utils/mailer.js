// mailer.js
const nodemailer = require("nodemailer");

/**
 * Create reusable transporter object using SMTP transport
 * Supports Gmail, Outlook, or custom SMTP services
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  secure: true, // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER, // your email address
    pass: process.env.SMTP_PASS, // your email password or app password
  },
});

/**
 * Send an email
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Subject line
 * @param {string} options.text - Plain text body
 * @param {string} [options.html] - Optional HTML body
 */
async function sendMail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log("Email sent:", info.messageId);
    return { success: true, info };
  } catch (err) {
    console.error("Email error:", err);
    return { success: false, error: err };
  }
}

module.exports = { sendMail };