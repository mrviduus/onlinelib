using System;
using System.Collections.Generic;
using OnlineLib.Models.Models.Accounts;

namespace OnlineLib.Interfaces.Managers
{
    public interface IAccountManager
    {
        AuthenticateResponse Authenticate(AuthenticateRequest model, string ipAddress);
        AuthenticateResponse RefreshToken(string token, string ipAddress);
        void RevokeToken(string token, string ipAddress);
        void Register(RegisterRequest model, string origin);
        void VerifyEmail(string token);
        void ForgotPassword(ForgotPasswordRequest model, string origin);
        void ValidateResetToken(ValidateResetTokenRequest model);
        void ResetPassword(ResetPasswordRequest model);
        IEnumerable<AccountResponse> GetAll();
        AccountResponse GetById(Guid id);
        AccountResponse Create(CreateRequest model);
        AccountResponse Update(Guid id, UpdateRequest model);
        void Delete(Guid id);
    }
}
