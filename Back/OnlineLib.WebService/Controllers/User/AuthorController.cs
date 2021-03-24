using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers.Admin;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Controllers.User
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthorController : BaseController
    {
        private readonly IAuthorManager authorManager;
        private readonly ILogger<AuthorController> logger;

        public AuthorController(
        IAuthorManager authorManager,
        ILogger<AuthorController> logger)
        {
            this.authorManager = authorManager;
            this.logger = logger;
        }

        [HttpGet("GetById")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var author = await this.authorManager.GetById(id);

            this.logger.LogInformation($"Return author by id {id}");

            return this.Ok(author);
        }

        [HttpGet("GetAll")]
        public async Task<IActionResult> GetAll()
        {
            var authors = await this.authorManager.GetAll();

            this.logger.LogInformation("Return authors");

            return this.Ok(authors);
        }
    }
}
