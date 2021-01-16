using System.ComponentModel.DataAnnotations;

namespace OnlineLib.Models.Models.Accounts
{
    public class VerifyEmailRequest
    {
        [Required]
        public string Token { get; set; }
    }
}
