using Microsoft.AspNetCore.Mvc;

namespace OnlineLib.WebService.Controllers.User
{
    public class HomeController : BaseController
    {
        public IActionResult Index()
        {
            return Ok("Welcome to onlineBook");
        }
    }
}
