using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Text;
using OnlineLib.Interfaces.Managers;
using OnlineLib.Models.Models.Settings;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.BusinessLogic.Managers
{
    public class EmailManager : IEmailManager
    {
        private readonly AppSettings appSettings;

        public EmailManager(IOptions<AppSettings> appSettings)
        {
            this.appSettings = appSettings.Value;
        }

        public void Send(string to, string subject, string html, string from = null)
        {
            // create message
            var email = new MimeMessage();
            email.From.Add(MailboxAddress.Parse(from ?? this.appSettings.EmailFrom));
            email.To.Add(MailboxAddress.Parse(to));
            email.Subject = subject;
            email.Body = new TextPart(TextFormat.Html) { Text = html };

            // send email
            using var smtp = new SmtpClient();
            smtp.Connect(this.appSettings.SmtpHost, this.appSettings.SmtpPort, SecureSocketOptions.StartTls);
            smtp.Authenticate(this.appSettings.SmtpUser, this.appSettings.SmtpPass);
            smtp.Send(email);
            smtp.Disconnect(true);
        }
    }
}
