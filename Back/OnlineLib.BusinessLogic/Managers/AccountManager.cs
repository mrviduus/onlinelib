using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AutoMapper;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using OnlineLib.Common.Exceptions;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers;
using OnlineLib.Models.Entities;
using OnlineLib.Models.Models.Accounts;
using OnlineLib.Models.Models.Settings;
using BC = BCrypt.Net.BCrypt;

namespace OnlineLib.BusinessLogic.Managers
{
    public class AccountManager : IAccountManager
    {
        private readonly IUnitOfWork Uow;
        private readonly IMapper mapper;
        private readonly AppSettings appSettings;
        private readonly IEmailManager emailManager;

        public AccountManager(
            IUnitOfWork Uow,
            IMapper mapper,
            IOptions<AppSettings> appSettings,
            IEmailManager emailManager)
        {
            this.Uow = Uow;
            this.mapper = mapper;
            this.appSettings = appSettings.Value;
            this.emailManager = emailManager;
        }

        public AuthenticateResponse Authenticate(AuthenticateRequest model, string ipAddress)
        {
            var account = this.Uow.AccountRepository.Get(x => x.Email == model.Email).SingleOrDefault();

            if (account == null || !account.IsVerified || !BC.Verify(model.Password, account.PasswordHash))
            {
                throw new AppException("Email or password is incorrect");
            }

            // authentication successful so generate jwt and refresh tokens
            var jwtToken = this.GenerateJwtToken(account);
            var refreshToken = this.GenerateRefreshToken(ipAddress);
            account.RefreshTokens.Add(refreshToken);

            // remove oldrefresh token from account
            this.RemoveOldRefreshTokens(account);

            // save changes to db
            this.Uow.AccountRepository.Update(account);
            this.Uow.Save();

            var response = this.mapper.Map<AuthenticateResponse>(account);
            response.JwtToken = jwtToken;
            response.RefreshToken = refreshToken.Token;
            return response;
        }

        public AccountResponse Create(CreateRequest model)
        {
            // validate
            if (this.Uow.AccountRepository.Get(x => x.Email == model.Email).Any())
            {
                throw new AppException($"Email '{model.Email}' is already registered");
            }

            // map model to new account object
            var account = this.mapper.Map<Account>(model);
            account.Created = DateTime.UtcNow;
            account.Verified = DateTime.UtcNow;

            // hash password
            account.PasswordHash = BC.HashPassword(model.Password);

            // save account
            this.Uow.AccountRepository.Insert(account);
            this.Uow.Save();
            return this.mapper.Map<AccountResponse>(account);
        }

        public void Delete(Guid id)
        {
            var account = GetAccount(id);
            this.Uow.AccountRepository.Delete(account);
            this.Uow.Save();
        }

        public void ForgotPassword(ForgotPasswordRequest model, string origin)
        {
            var account = this.Uow.AccountRepository.Get(x => x.Email == model.Email).SingleOrDefault();

            // always return ok response to prevent email enumeration
            if (account == null)
            {
                return;
            }

            // create reset token that expires after 1 day
            account.ResetToken = this.RandomTokenString();
            account.ResetTokenExpires = DateTime.UtcNow.AddDays(1);

            this.Uow.AccountRepository.Update(account);
            this.Uow.Save();

            // send email
            this.SendPasswordResetEmail(account, origin);
        }

        public IEnumerable<AccountResponse> GetAll()
        {
            var accounts = this.Uow.AccountRepository.Get();
            return this.mapper.Map<IList<AccountResponse>>(accounts);
        }

        public AccountResponse GetById(Guid id)
        {
            var account = this.GetAccount(id);
            return this.mapper.Map<AccountResponse>(account);
        }

        public AuthenticateResponse RefreshToken(string token, string ipAddress)
        {
            var (refreshToken, account) = this.GetRefreshToken(token);

            // replace old refresh token with a new one and save
            var newRefreshToken = this.GenerateRefreshToken(ipAddress);
            refreshToken.Revoked = DateTime.UtcNow;
            refreshToken.RevokedByIp = ipAddress;
            refreshToken.ReplacedByToken = newRefreshToken.Token;
            account.RefreshTokens.Add(newRefreshToken);

            this.RemoveOldRefreshTokens(account);

            this.Uow.AccountRepository.Update(account);
            this.Uow.Save();

            // generate new jwt
            var jwtToken = this.GenerateJwtToken(account);

            var response = this.mapper.Map<AuthenticateResponse>(account);
            response.JwtToken = jwtToken;
            response.RefreshToken = newRefreshToken.Token;
            return response;
        }

        public void Register(RegisterRequest model, string origin)
        {
            // validate
            if (this.Uow.AccountRepository.Get(x => x.Email == model.Email).Any())
            {
                // send already registered error in email to prevent account enumeration
                this.SendAlreadyRegisteredEmail(model.Email, origin);
                return;
            }

            // map model to new account object
            var account = this.mapper.Map<Account>(model);

            // first registered account is an admin
            var isFirstAccount = this.Uow.AccountRepository.IsFirstAccount();

            account.Role = isFirstAccount ? Role.Admin : Role.User;
            account.Created = DateTime.UtcNow;
            account.VerificationToken = this.RandomTokenString();

            // hash password
            account.PasswordHash = BC.HashPassword(model.Password);

            // save account
            this.Uow.AccountRepository.Insert(account);
            this.Uow.Save();

            // send email
            this.SendVerificationEmail(account, origin);
        }

        public void ResetPassword(ResetPasswordRequest model)
        {
            var account = this.Uow.AccountRepository.Get(x =>
                x.ResetToken == model.Token &&
                x.ResetTokenExpires > DateTime.UtcNow)
            .SingleOrDefault();

            // getBytoken
            if (account == null)
            {
                throw new AppException("Invalid token");
            }

            // update password and remove reset token
            account.PasswordHash = BC.HashPassword(model.Password);
            account.PasswordReset = DateTime.UtcNow;
            account.ResetToken = null;
            account.ResetTokenExpires = null;

            this.Uow.AccountRepository.Update(account);
            this.Uow.Save();
        }

        public void RevokeToken(string token, string ipAddress)
        {
            var (refreshToken, account) = this.GetRefreshToken(token);

            // revoke token and save
            refreshToken.Revoked = DateTime.UtcNow;
            refreshToken.RevokedByIp = ipAddress;

            this.Uow.AccountRepository.Update(account);
            this.Uow.Save();
        }

        public AccountResponse Update(Guid id, UpdateRequest model)
        {
            var account = this.GetAccount(id);

            // validate
            if (account.Email != model.Email && this.Uow.AccountRepository.Get(x => x.Email == model.Email).Any())
            {
                throw new AppException($"Email '{model.Email}' is already taken");
            }

            // hash password if it was entered
            if (!string.IsNullOrEmpty(model.Password))
            {
                account.PasswordHash = BC.HashPassword(model.Password);
            }

            // copy model to account and save
            this.mapper.Map(model, account);
            account.Updated = DateTime.UtcNow;
            this.Uow.AccountRepository.Update(account);
            this.Uow.Save();

            return this.mapper.Map<AccountResponse>(account);
        }

        public void ValidateResetToken(ValidateResetTokenRequest model)
        {
            var account = this.Uow.AccountRepository.Get(x =>
                x.ResetToken == model.Token &&
                x.ResetTokenExpires > DateTime.UtcNow).SingleOrDefault();

            if (account == null)
            {
                throw new AppException("Invalid token");
            }
        }

        public void VerifyEmail(string token)
        {
            var account = this.Uow.AccountRepository.Get(x => x.VerificationToken == token).SingleOrDefault();

            if (account == null)
            {
                throw new AppException("Verification failed");
            }

            account.Verified = DateTime.UtcNow;
            account.VerificationToken = null;

            this.Uow.AccountRepository.Update(account);
            this.Uow.Save();
        }

        // helper methods
        private Account GetAccount(Guid id)
        {
            var account = this.Uow.AccountRepository.GetByID(id);
            if (account == null)
            {
                throw new KeyNotFoundException("Account not found");
            }

            return account;
        }

        private (RefreshToken, Account) GetRefreshToken(string token)
        {
            var account = this.Uow.AccountRepository.Get(u => u.RefreshTokens.Any(t => t.Token == token)).SingleOrDefault();
            if (account == null)
            {
                throw new AppException("Invalid token");
            }

            var refreshToken = account.RefreshTokens.Single(x => x.Token == token);
            if (!refreshToken.IsActive)
            {
                throw new AppException("Invalid token");
            }

            return (refreshToken, account);
        }

        private string GenerateJwtToken(Account account)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.ASCII.GetBytes(this.appSettings.Secret);
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[] { new Claim("id", account.Id.ToString()) }),
                Expires = DateTime.UtcNow.AddMinutes(15),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        private RefreshToken GenerateRefreshToken(string ipAddress)
        {
            return new RefreshToken
            {
                Token = RandomTokenString(),
                Expires = DateTime.UtcNow.AddDays(7),
                Created = DateTime.UtcNow,
                CreatedByIp = ipAddress
            };
        }

        private void RemoveOldRefreshTokens(Account account)
        {
            account.RefreshTokens.RemoveAll(x =>
                !x.IsActive &&
                x.Created.AddDays(this.appSettings.RefreshTokenTTL) <= DateTime.UtcNow);
        }

        private string RandomTokenString()
        {
            using var rngCryptoServiceProvider = new RNGCryptoServiceProvider();
            var randomBytes = new byte[40];
            rngCryptoServiceProvider.GetBytes(randomBytes);
            // convert random bytes to hex string
            return BitConverter.ToString(randomBytes).Replace("-", "");
        }

        private void SendVerificationEmail(Account account, string origin)
        {
            string message;
            if (!string.IsNullOrEmpty(origin))
            {
                var verifyUrl = $"{origin}/account/verify-email?token={account.VerificationToken}";
                message = $@"<p>Please click the below link to verify your email address:</p>
                             <p><a href=""{verifyUrl}"">{verifyUrl}</a></p>";
            }
            else
            {
                message = $@"<p>Please use the below token to verify your email address with the <code>/accounts/verify-email</code> api route:</p>
                             <p><code>{account.VerificationToken}</code></p>";
            }

            this.emailManager.Send(
                to: account.Email,
                subject: "Sign-up Verification API - Verify Email",
                html: $@"<h4>Verify Email</h4>
                         <p>Thanks for registering!</p>
                         {message}"
            );
        }

        private void SendAlreadyRegisteredEmail(string email, string origin)
        {
            string message;
            if (!string.IsNullOrEmpty(origin))
                message = $@"<p>If you don't know your password please visit the <a href=""{origin}/account/forgot-password"">forgot password</a> page.</p>";
            else
                message = "<p>If you don't know your password you can reset it via the <code>/accounts/forgot-password</code> api route.</p>";

            this.emailManager.Send(
                to: email,
                subject: "Sign-up Verification API - Email Already Registered",
                html: $@"<h4>Email Already Registered</h4>
                         <p>Your email <strong>{email}</strong> is already registered.</p>
                         {message}"
            );
        }

        private void SendPasswordResetEmail(Account account, string origin)
        {
            string message;
            if (!string.IsNullOrEmpty(origin))
            {
                var resetUrl = $"{origin}/account/reset-password?token={account.ResetToken}";
                message = $@"<p>Please click the below link to reset your password, the link will be valid for 1 day:</p>
                             <p><a href=""{resetUrl}"">{resetUrl}</a></p>";
            }
            else
            {
                message = $@"<p>Please use the below token to reset your password with the <code>/accounts/reset-password</code> api route:</p>
                             <p><code>{account.ResetToken}</code></p>";
            }

            this.emailManager.Send(
                to: account.Email,
                subject: "Sign-up Verification API - Reset Password",
                html: $@"<h4>Reset Password Email</h4>
                         {message}"
            );
        }
    }
}
