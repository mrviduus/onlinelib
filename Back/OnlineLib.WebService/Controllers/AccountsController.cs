using AutoMapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers;
using OnlineLib.Models.Entities;
using OnlineLib.Models.Models.Accounts;
using OnlineLib.WebService.Attributes;
using System;
using System.Collections.Generic;

namespace OnlineLib.WebService.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class AccountsController : BaseController
    {
        private readonly IAccountManager accountService;
        private readonly IMapper mapper;
        private readonly ILogger<AccountsController> logger;

        public AccountsController(
            IAccountManager accountService,
            IMapper mapper,
            ILogger<AccountsController> logger)
        {
            this.accountService = accountService;
            this.mapper = mapper;
            this.logger = logger;
        }

        [HttpPost("authenticate")]
        public ActionResult<AuthenticateResponse> Authenticate(AuthenticateRequest model)
        {
            var response = this.accountService.Authenticate(model, ipAddress());
            this.setTokenCookie(response.RefreshToken);

            this.logger.LogInformation("User logged in successfully.");

            return this.Ok(response);
        }

        [HttpPost("refresh-token")]
        public ActionResult<AuthenticateResponse> RefreshToken()
        {
            var refreshToken = Request.Cookies["refreshToken"];
            var response = this.accountService.RefreshToken(refreshToken, ipAddress());
            this.setTokenCookie(response.RefreshToken);

            this.logger.LogInformation("RefreshToken in successfully.");

            return this.Ok(response);
        }

        [Authorize]
        [HttpPost("revoke-token")]
        public IActionResult RevokeToken(RevokeTokenRequest model)
        {
            // accept token from request body or cookie
            var token = model.Token ?? Request.Cookies["refreshToken"];

            if (string.IsNullOrEmpty(token))
            {
                this.logger.LogWarning("Token is required");

                return this.BadRequest(new { message = "Token is required" });
            }

            // users can revoke their own tokens and admins can revoke any tokens
            if (!this.Account.OwnsToken(token) && Account.Role != Role.Admin)
            {
                this.logger.LogWarning("Unauthorized");

                return this.Unauthorized(new { message = "Unauthorized" });
            }

            this.accountService.RevokeToken(token, this.ipAddress());

            this.logger.LogInformation("Token revoked");

            return this.Ok(new { message = "Token revoked" });
        }

        [HttpPost("register")]
        public IActionResult Register(RegisterRequest model)
        {
            this.accountService.Register(model, Request.Headers["origin"]);

            this.logger.LogInformation("Registration successful");

            return this.Ok(new { message = "Registration successful, please check your email for verification instructions" });
        }

        [HttpPost("verify-email")]
        public IActionResult VerifyEmail(VerifyEmailRequest model)
        {
            this.accountService.VerifyEmail(model.Token);

            this.logger.LogInformation("Verification successful");

            return this.Ok(new { message = "Verification successful, you can now login" });
        }

        [HttpPost("forgot-password")]
        public IActionResult ForgotPassword(ForgotPasswordRequest model)
        {
            this.accountService.ForgotPassword(model, Request.Headers["origin"]);

            this.logger.LogInformation("fogot password, email was sended");

            return this.Ok(new { message = "Please check your email for password reset instructions" });
        }

        [HttpPost("validate-reset-token")]
        public IActionResult ValidateResetToken(ValidateResetTokenRequest model)
        {
            this.accountService.ValidateResetToken(model);

            this.logger.LogInformation("Token is valid");

            return this.Ok(new { message = "Token is valid" });
        }

        [HttpPost("reset-password")]
        public IActionResult ResetPassword(ResetPasswordRequest model)
        {
            this.accountService.ResetPassword(model);

            this.logger.LogInformation("Password reset successful");

            return this.Ok(new { message = "Password reset successful, you can now login" });
        }

        [Authorize(Role.Admin)]
        [HttpGet]
        public ActionResult<IEnumerable<AccountResponse>> GetAll()
        {
            var accounts = this.accountService.GetAll();
            this.logger.LogInformation("get all users");
            return this.Ok(accounts);
        }

        [Authorize]
        [HttpGet("{id:Guid}")]
        public ActionResult<AccountResponse> GetById(Guid id)
        {
            // users can get their own account and admins can get any account
            if (id != this.Account.Id && this.Account.Role != Role.Admin)
            {
                this.logger.LogWarning("Unauthorized");

                return this.Unauthorized(new { message = "Unauthorized" });
            }

            var account = this.accountService.GetById(id);

            this.logger.LogInformation("Get user by Id is success");

            return this.Ok(account);
        }

        [Authorize(Role.Admin)]
        [HttpPost]
        public ActionResult<AccountResponse> Create(CreateRequest model)
        {
            var account = this.accountService.Create(model);

            this.logger.LogInformation("Account was created");

            return this.Ok(account);
        }

        [Authorize]
        [HttpPut("{id:Guid}")]
        public ActionResult<AccountResponse> Update(Guid id, UpdateRequest model)
        {
            // users can update their own account and admins can update any account
            if (id != this.Account.Id && this.Account.Role != Role.Admin)
            {
                this.logger.LogWarning("Unauthorized");
                return this.Unauthorized(new { message = "Unauthorized" });
            }

            // only admins can update role
            if (this.Account.Role != Role.Admin)
            {
                model.Role = null;
            }

            var account = this.accountService.Update(id, model);

            this.logger.LogInformation("Account was updated.");

            return this.Ok(account);
        }

        [Authorize]
        [HttpDelete("{id:Guid}")]
        public IActionResult Delete(Guid id)
        {
            // users can delete their own account and admins can delete any account
            if (id != Account.Id && Account.Role != Role.Admin)
            {
                this.logger.LogWarning("Unauthorized");

                return Unauthorized(new { message = "Unauthorized" });
            }

            this.accountService.Delete(id);

            this.logger.LogInformation("Account deleted successfully");

            return this.Ok(new { message = "Account deleted successfully" });
        }

        //helper methods
        private void setTokenCookie(string token)
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Expires = DateTime.UtcNow.AddDays(7),
            };
            this.Response.Cookies.Append("refreshToken", token, cookieOptions);
        }

        private string ipAddress()
        {
            if (this.Request.Headers.ContainsKey("X-Forwarded-For"))
            {
                return this.Request.Headers["X-Forwarded-For"];
            }
            else
            {
                return this.HttpContext.Connection.RemoteIpAddress.MapToIPv4().ToString();
            }
        }
    }
}
