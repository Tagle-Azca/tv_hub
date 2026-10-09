import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

type ReportEmailData = {
  _id?: { toString(): string };
  reason: string;
  description: string;
  status: string;
  createdAt: Date;
  evidenceUrls: string[];
  resolvedAt?: Date | null;
};

let transporterPromise: Promise<Transporter> | undefined;
let usesEthereal = false;

async function getTransporter(): Promise<Transporter> {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (env.nodeEnv === 'test') {
      return nodemailer.createTransport({ jsonTransport: true });
    }

    if (env.smtpHost) {
      usesEthereal = false;
      return nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,
        auth: env.smtpUser && env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined
      });
    }

    usesEthereal = true;
    const account = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass }
    });
  })();

  return transporterPromise;
}

async function sendWithTransporter(message: SendMailOptions): Promise<void> {
  const transporter = await getTransporter();
  const info = await transporter.sendMail(message);

  if (usesEthereal) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log(`Email preview: ${previewUrl}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date: Date): string {
  return date.toLocaleString('en-US', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });
}

function buildMessage(title: string, intro: string, rows: Array<[string, string]>): { text: string; html: string } {
  const text = [intro, '', ...rows.map(([label, value]) => `${label}: ${value}`)].join('\n');
  const htmlRows = rows
    .map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const html = `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p><table cellpadding="6">${htmlRows}</table>`;
  return { text, html };
}

export async function sendReportCreatedEmail(report: ReportEmailData, channelName: string): Promise<void> {
  // TODO V6 MAIL 1
  // Construye la notificación de Report creado con los datos recibidos: canal,
  // reason, descripción, status y fecha de creación. Define un asunto adecuado
  // y usa el helper de transporte existente para enviarla con Nodemailer.
  const rows: Array<[string, string]> = [
    ['Channel', channelName],
    ['Reason', report.reason],
    ['Description', report.description],
    ['Status', report.status],
    ['Created at', formatDate(report.createdAt)]
  ];
  if (report._id) rows.unshift(['Report', report._id.toString()]);
  if (report.evidenceUrls.length > 0) rows.push(['Evidence', report.evidenceUrls.join(', ')]);

  const { text, html } = buildMessage('New report created', 'A new channel report was submitted.', rows);
  await sendWithTransporter({
    from: env.smtpFrom,
    to: env.reportNotificationEmail,
    subject: `[TV Hub] New report: ${channelName} (${report.reason})`,
    text,
    html
  });
}

export async function sendReportResolvedEmail(report: ReportEmailData, channelName: string, recipient: string): Promise<void> {
  // TODO V6 MAIL 2
  // Construye la notificación de Report resuelto para el destinatario recibido.
  // Incluye información relevante como identificador, canal, status final y
  // fecha de resolución, además de datos del administrador si están disponibles.
  // Reutiliza el helper de transporte y el preview de Ethereal ya disponibles.
  const rows: Array<[string, string]> = [
    ['Channel', channelName],
    ['Reason', report.reason],
    ['Description', report.description],
    ['Final status', report.status],
    ['Created at', formatDate(report.createdAt)]
  ];
  if (report._id) rows.unshift(['Report', report._id.toString()]);
  if (report.resolvedAt) rows.push(['Resolved at', formatDate(report.resolvedAt)]);

  const { text, html } = buildMessage(
    'Your report was resolved',
    `Support resolved your report about ${channelName}. Thank you for letting us know.`,
    rows
  );
  await sendWithTransporter({
    from: env.smtpFrom,
    to: recipient,
    subject: `[TV Hub] Your report about ${channelName} was resolved`,
    text,
    html
  });
}
