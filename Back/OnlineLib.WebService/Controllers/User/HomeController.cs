using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers.Admin;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Controllers.User
{
    [ApiController]
    [Route("api/[controller]")]
    public class HomeController : BaseController
    {
        private readonly IBookManager bookManager;
        private readonly ILogger<HomeController> logger;

        public HomeController(
        IBookManager bookManager,
        ILogger<HomeController> logger)
        {
            this.bookManager = bookManager;
            this.logger = logger;
        }

        [HttpGet("GetAllBooks")]
        public async Task<IActionResult> GetAllBooks()
        {
            var books = await this.bookManager.GetAll();

            this.logger.LogInformation("Return books");

            return Ok(books);
        }
    }
}
