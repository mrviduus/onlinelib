using System.ComponentModel.DataAnnotations;

namespace OnlineLib.Models.Models.Accounts
{
    public class ForgotPasswordRequest
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; }
    }
}
