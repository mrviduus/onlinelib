using System.ComponentModel.DataAnnotations;

namespace OnlineLib.Models.Models.Accounts
{
    public class ValidateResetTokenRequest
    {
        [Required]
        public string Token { get; set; }
    }
}
