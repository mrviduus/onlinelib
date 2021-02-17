using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Domain.DTO.Book;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.WebService.Attributes;
using OnlineLib.WebService.Helpers;
using System;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Controllers.Admin
{
    [Authorize]
    [ApiController]
    [Route("admin/[controller]")]
    public class AuthorController : BaseController
    {
        private readonly IAuthorManager authorManager;
        private readonly ILogger<AuthorController> logger;
        private const string ImageFolderName = "Authors";

        public AuthorController(
            IAuthorManager authorManager,
            ILogger<AuthorController> logger)
        {
            this.authorManager = authorManager;
            this.logger = logger;
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create(AuthorDTO authorDTO)
        {
            authorDTO.Icon = SaveImageToServerFolder.Save(ImageFolderName, authorDTO.Icon);

            await this.authorManager.CreateOrUpdate(authorDTO);

            string logMsg = "Author was created";

            this.logger.LogInformation(logMsg);

            return Ok(new { message = logMsg });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(AuthorDTO authorDTO)
        {
            authorDTO.Icon = SaveImageToServerFolder.Save(ImageFolderName, authorDTO.Icon);

            await this.authorManager.CreateOrUpdate(authorDTO);

            string logMsg = "Update was created";

            this.logger.LogInformation(logMsg);

            return Ok(new { message = logMsg });
        }

        [HttpGet("GetById")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var author = await this.authorManager.GetById(id);

            this.logger.LogInformation("Return author by id");

            return Ok(author);
        }

        [HttpGet("GetAll")]
        public async Task<IActionResult> GetAll()
        {
            var authors = await this.authorManager.GetAll();

            this.logger.LogInformation("Return authors");

            return Ok(authors);
        }

        [HttpDelete("Delete")]
        public async Task Delete(Guid id)
        {
            await this.authorManager.Delete(id);

            this.logger.LogInformation("Author was deleted");
        }
    }
}
