using Microsoft.AspNetCore.Mvc;

namespace OnlineLib.WebService.Controllers.User
{
    [ApiController]
    [Route("api/[controller]")]
    public class HomeController : BaseController
    {
        [HttpGet("Index")]
        public IActionResult Index()
        {
            return Ok("Welcome to onlineBook");
        }
    }
}
