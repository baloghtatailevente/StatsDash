// mailer.js
const { Resend } = require("resend");

/**
 * Resend client
 * Uses RESEND_API_KEY from environment variables
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send an email
 * Interface is kept IDENTICAL so no other code needs to change
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Subject line
 * @param {string} options.text - Plain text body
 * @param {string} [options.html] - Optional HTML body
 */
async function sendMail({ to, subject, text, html }) {
  try {
    const info = await resend.emails.send({
      from: "StatsDash <noreply@statsdash.hu>",
      to,
      subject,
      text,
      html,
    });

    console.log("Email sent:", info.id);
    return { success: true, info };
  } catch (err) {
    console.error("Email error:", err);
    return { success: false, error: err };
  }
}

module.exports = { sendMail };