import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Folder for the email logo — use `image/email-logo.png`. */
export const EMAIL_IMAGE_DIR = path.join(__dirname, "..", "image")

/** Inline attachment id referenced in HTML as cid:gidtransfer-logo */
export const EMAIL_LOGO_CID = "gidtransfer-logo"

const LOGO_FILENAMES = ["email-logo.png", "email-logo.jpg", "email-logo.jpeg"]

const brandName = () => process.env.RESEND_FROM_NAME?.trim() || "Gidtransfer"

const displayClientName = (clientName, fallback = "A client") =>
    clientName?.trim() || fallback

export const findLocalEmailLogoPath = () => {
    for (const name of LOGO_FILENAMES) {
        const fullPath = path.join(EMAIL_IMAGE_DIR, name)
        if (fs.existsSync(fullPath)) {
            return fullPath
        }
    }
    return null
}

export const hasLocalEmailLogo = () => Boolean(findLocalEmailLogoPath())

const mimeForLogoPath = (logoPath) => {
    const ext = path.extname(logoPath).toLowerCase()
    if (ext === ".png") return "image/png"
    return "image/jpeg"
}

/** Public HTTPS URL when API is reachable by email clients; else inline cid. */
export const getEmailLogoSrc = () => {
    const logoPath = findLocalEmailLogoPath()
    if (!logoPath) return null

    const publicBase = process.env.API_PUBLIC_URL?.trim()
    if (publicBase?.startsWith("https://")) {
        const filename = path.basename(logoPath)
        return `${publicBase.replace(/\/$/, "")}/image/${filename}`
    }

    return `cid:${EMAIL_LOGO_CID}`
}

export const emailLogoUsesCidAttachment = () =>
    getEmailLogoSrc()?.startsWith("cid:") ?? false

/** Resend inline attachment — base64 content when using cid: in HTML. */
export const getEmailLogoAttachment = () => {
    if (!emailLogoUsesCidAttachment()) return null

    const logoPath = findLocalEmailLogoPath()
    if (!logoPath) return null

    return {
        content: fs.readFileSync(logoPath).toString("base64"),
        filename: path.basename(logoPath),
        contentType: mimeForLogoPath(logoPath),
        contentId: EMAIL_LOGO_CID,
    }
}

const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")

/** Gidtransfer brand palette */
const COLORS = {
    maroon: "#500B28",
    ink: "#1A1A1A",
    body: "#4A4A4A",
    muted: "#6B6B6B",
    faint: "#9CA3AF",
    page: "#F3F4F6",
    card: "#FFFFFF",
    divider: "#E5E7EB",
    quoteBg: "#F9FAFB",
}

const FONT =
    "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const brandDisplayName = () => {
    const name = brandName()
    return name.charAt(0).toUpperCase() + name.slice(1)
}

const renderLogo = () => {
    const logoSrc = getEmailLogoSrc()
    if (logoSrc) {
        return `<img src="${logoSrc}" alt="${escapeHtml(brandDisplayName())}" width="160" style="display:block;height:auto;max-width:160px;border:0;" />`
    }

    return `<span style="font-family:${FONT};font-size:18px;font-weight:700;color:${COLORS.maroon};">${escapeHtml(brandDisplayName())}</span>`
}

const sectionLabel = (label) => `
  <p style="margin:0 0 14px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.faint};">
    ${escapeHtml(label)}
  </p>`

const quoteBlock = (text) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr>
      <td style="background:${COLORS.quoteBg};border-left:4px solid ${COLORS.maroon};padding:16px 20px;">
        <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.ink};font-style:italic;">
          ${escapeHtml(text)}
        </p>
      </td>
    </tr>
  </table>`

const detailCard = (rows) => {
    const cells = rows
        .map(
            (row, index) => `
      <tr>
        <td style="padding:10px 0;${index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.divider};` : ""}font-family:${FONT};font-size:13px;color:${COLORS.muted};width:80px;vertical-align:top;">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding:10px 0;${index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.divider};` : ""}font-family:${FONT};font-size:14px;font-weight:600;color:${COLORS.ink};vertical-align:top;">
          ${escapeHtml(row.value)}
        </td>
      </tr>`
        )
        .join("")

    return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr>
      <td style="background:${COLORS.quoteBg};border:1px solid ${COLORS.divider};padding:8px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${cells}
        </table>
      </td>
    </tr>
  </table>`
}

const introLine = (studioName, html) => `
  <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.65;color:${COLORS.body};">
    Hi <strong style="color:${COLORS.ink};">${escapeHtml(studioName || "there")}</strong>, ${html}
  </p>`

const bodyParagraph = (html) => `
  <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.65;color:${COLORS.body};">
    ${html}
  </p>`

const layout = ({
    label,
    title,
    subtitle,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    secondaryCtaLabel,
    secondaryCtaUrl,
}) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.page};font-family:${FONT};color:${COLORS.ink};-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLORS.card};border:1px solid ${COLORS.divider};border-radius:4px;overflow:hidden;">
            <tr>
              <td style="height:3px;background:${COLORS.maroon};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:36px 40px 32px;">
                <div style="padding-bottom:32px;">
                  ${renderLogo()}
                </div>
                ${label ? sectionLabel(label) : ""}
                <h1 style="margin:0 0 10px;font-family:${FONT};font-size:26px;font-weight:700;line-height:1.3;color:${COLORS.ink};">
                  ${escapeHtml(title)}
                </h1>
                ${
                    subtitle
                        ? `<p style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(subtitle)}</p>`
                        : `<div style="height:8px;font-size:0;line-height:0;">&nbsp;</div>`
                }
                <div style="font-family:${FONT};">
                  ${bodyHtml}
                </div>
                ${
                    ctaLabel && ctaUrl
                        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px;">
                  <tr>
                    <td style="border-radius:6px;background:${COLORS.maroon};">
                      <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:6px;">
                        ${escapeHtml(ctaLabel)} &rarr;
                      </a>
                    </td>
                    ${
                        secondaryCtaLabel && secondaryCtaUrl
                            ? `<td style="padding-left:12px;">
                      <a href="${escapeHtml(secondaryCtaUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;font-weight:600;color:${COLORS.maroon};text-decoration:none;border-radius:6px;border:1px solid ${COLORS.maroon};">
                        ${escapeHtml(secondaryCtaLabel)} &rarr;
                      </a>
                    </td>`
                            : ""
                    }
                  </tr>
                </table>`
                        : ""
                }
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:36px;">
                  <tr>
                    <td style="border-top:1px solid ${COLORS.divider};padding-top:20px;">
                      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.faint};text-align:left;">
                        &copy; ${new Date().getFullYear()} ${escapeHtml(brandDisplayName())} &middot; <a href="https://gidtransfer.com" target="_blank" style="color:${COLORS.faint};text-decoration:none;">gidtransfer.com</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

export const bookingConfirmationEmail = ({
    studioName,
    bookingTitle,
    clientName,
    startsAtLabel,
    location,
    amountLabel,
    calendarUrl,
}) => {
    const client = displayClientName(clientName, "a client")
    const title = `New booking with ${client}`
    const bodyHtml = `
      ${introLine(studioName, "a new session has been added to your calendar. Here are the details:")}
      ${detailCard([
          { label: "Client", value: client },
          { label: "Booking", value: bookingTitle },
          { label: "When", value: startsAtLabel },
          ...(location ? [{ label: "Where", value: location }] : []),
          ...(amountLabel ? [{ label: "Amount", value: amountLabel }] : []),
      ])}
      ${bodyParagraph("A calendar invite is attached to this email. You can also add it directly to Google Calendar.")}
    `

    return {
        subject: title,
        html: layout({
            label: "Booking confirmation",
            title,
            subtitle: `Booking: ${bookingTitle}`,
            bodyHtml,
            ctaLabel: calendarUrl ? "Add to Google Calendar" : undefined,
            ctaUrl: calendarUrl,
        }),
        text: `New booking with ${client}\nWhen: ${startsAtLabel}${location ? `\nWhere: ${location}` : ""}${amountLabel ? `\nAmount: ${amountLabel}` : ""}\nBooking: ${bookingTitle}${calendarUrl ? `\nAdd to Google Calendar: ${calendarUrl}` : ""}\n\nA calendar invite (.ics) is attached.`,
    }
}

export const bookingReminderEmail = ({
    studioName,
    bookingTitle,
    clientName,
    startsAtLabel,
    location,
    calendarUrl,
    reminderType = "day",
}) => {
    const client = displayClientName(clientName, "your client")
    const isHourReminder = reminderType === "hour"
    const leadLabel = isHourReminder ? "in 1 hour" : "tomorrow"
    const title = `Shoot ${leadLabel} with ${client}`
    const intro = isHourReminder
        ? "your session starts in about an hour. Here are the details:"
        : "your session is tomorrow. Here are the details:"
    const bodyHtml = `
      ${introLine(studioName, intro)}
      ${detailCard([
          { label: "Client", value: client },
          { label: "Booking", value: bookingTitle },
          { label: "When", value: startsAtLabel },
          ...(location ? [{ label: "Where", value: location }] : []),
      ])}
      ${bodyParagraph("A calendar invite is attached to this email. You can also add it directly to Google Calendar.")}
    `

    return {
        subject: title,
        html: layout({
            label: isHourReminder ? "Shoot reminder — 1 hour" : "Shoot reminder — 1 day",
            title,
            subtitle: `Booking: ${bookingTitle}`,
            bodyHtml,
            ctaLabel: calendarUrl ? "Add to Google Calendar" : undefined,
            ctaUrl: calendarUrl,
        }),
        text: `Shoot ${leadLabel} with ${client}\nWhen: ${startsAtLabel}${location ? `\nWhere: ${location}` : ""}\nBooking: ${bookingTitle}${calendarUrl ? `\nAdd to Google Calendar: ${calendarUrl}` : ""}\n\nA calendar invite (.ics) is attached.`,
    }
}

export const galleryClientCommentEmail = ({
    studioName,
    galleryName,
    clientName,
    comment,
    actionUrl,
}) => {
    const client = displayClientName(clientName)
    const title = `${client} left a comment`
    const bodyHtml = `
      ${introLine(studioName, "your client left a comment on the gallery you shared with them.")}
      ${quoteBlock(comment)}
    `

    return {
        subject: `${client} commented on ${galleryName}`,
        html: layout({
            label: "Client comment",
            title,
            subtitle: `On gallery: ${galleryName}`,
            bodyHtml,
            ctaLabel: "Open gallery",
            ctaUrl: actionUrl,
        }),
        text: `${client} commented on ${galleryName}: ${comment}\n${actionUrl}`,
    }
}

export const galleryFinalFlaggedEmail = ({
    studioName,
    galleryName,
    clientName,
    comment,
    actionUrl,
}) => {
    const client = displayClientName(clientName)
    const title = `${client} flagged an image`
    const bodyHtml = `
      ${introLine(studioName, "your client flagged a final delivery image in a gallery you shared with them.")}
      ${comment ? quoteBlock(comment) : ""}
    `

    return {
        subject: `${client} flagged an image in ${galleryName}`,
        html: layout({
            label: "Flagged image",
            title,
            subtitle: `On gallery: ${galleryName}`,
            bodyHtml,
            ctaLabel: "Review flagged image",
            ctaUrl: actionUrl,
        }),
        text: `${client} flagged an image in ${galleryName}.${comment ? ` Comment: ${comment}` : ""}\n${actionUrl}`,
    }
}

export const gallerySelectionsSubmittedEmail = ({
    studioName,
    galleryName,
    clientName,
    selectionCount,
    actionUrl,
}) => {
    const client = displayClientName(clientName, "Your client")
    const title = `${client} submitted selections`
    const photoLabel = selectionCount === 1 ? "photo" : "photos"
    const bodyHtml = `
      ${introLine(studioName, `your client finished selecting ${selectionCount} ${photoLabel} from a gallery you shared with them.`)}
    `

    return {
        subject: `${client} submitted selections for ${galleryName}`,
        html: layout({
            label: "Selections submitted",
            title,
            subtitle: `On gallery: ${galleryName}`,
            bodyHtml,
            ctaLabel: "View selections",
            ctaUrl: actionUrl,
        }),
        text: `${client} submitted ${selectionCount} selection(s) for ${galleryName}.\n${actionUrl}`,
    }
}

export const emailVerificationOtpEmail = ({ code }) => {
    const title = "Verify your email"
    const bodyHtml = `
      ${bodyParagraph("Enter this code in the app to finish creating your account:")}
      <p style="margin:0 0 24px;font-family:${FONT};font-size:32px;font-weight:700;letter-spacing:0.35em;color:${COLORS.maroon};">
        ${escapeHtml(code)}
      </p>
      ${bodyParagraph(`This code expires in <strong>15 minutes</strong>. If you didn't create an account, you can safely ignore this email.`)}
    `

    return {
        subject: `${brandName()} verification code`,
        html: layout({
            label: "Account security",
            title,
            subtitle: "Your 6-digit verification code",
            bodyHtml,
        }),
        text: `Your verification code is ${code}. It expires in 15 minutes.`,
    }
}

export const passwordResetEmail = ({ resetUrl }) => {
    const title = "Reset your password"
    const bodyHtml = `
      ${introLine("there", "we received a request to reset your password.")}
      ${bodyParagraph(`This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.`)}
    `

    return {
        subject: `${brandName()} password reset`,
        html: layout({
            label: "Account security",
            title,
            subtitle: "Password reset request",
            bodyHtml,
            ctaLabel: "Reset password",
            ctaUrl: resetUrl,
        }),
        text: `Reset your password: ${resetUrl}`,
    }
}

export const testNotificationEmail = ({ studioName }) => {
    const title = "Notifications are working"
    const bodyHtml = `
      ${introLine(studioName, `your ${escapeHtml(brandDisplayName())} photographer notification emails are set up and ready.`)}
    `

    return {
        subject: `${brandName()} email test`,
        html: layout({
            label: "Test email",
            title,
            subtitle: "Everything looks good on our end.",
            bodyHtml,
        }),
        text: `Hi ${studioName || "there"}, your ${brandName()} email notifications are working.`,
    }
}
