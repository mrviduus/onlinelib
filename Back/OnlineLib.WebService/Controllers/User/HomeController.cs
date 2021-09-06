using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers.Admin;

namespace OnlineLib.WebService.Controllers.User
{
    [ApiController]
    [Route("api/[controller]")]
    public class HomeController : ControllerBase
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

            return this.Ok(books);
        }

        [HttpGet("GetBookById")]
        public async Task<IActionResult> GetBookById(Guid id)
        {
            var book = await this.bookManager.GetById(id);

            this.logger.LogInformation($"Return book {book.Title} with  id {book.Id}" );

            return this.Ok(book);
        }
    }
}
