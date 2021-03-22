using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.WebService.Attributes;
using OnlineLib.WebService.Helpers;
using System;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Controllers.Admin
{
    [Authorize]
    [ApiController]
    [Route("admin/[controller]")]
    public class ArticleController : BaseController
    {
        private readonly IArticleManager articleManager;
        private readonly ILogger<ArticleController> logger;

        public ArticleController(
            IArticleManager articleManager,
            ILogger<ArticleController> logger)
        {
            this.articleManager = articleManager;
            this.logger = logger;
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create(ArticleDTO articleDTO)
        {
            await this.articleManager.CreateOrUpdate(articleDTO);

            this.logger.LogInformation("Article was created");

            return this.Ok(new { message = "Article was created" });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(ArticleDTO articleDTO)
        {
            await this.articleManager.CreateOrUpdate(articleDTO);

            this.logger.LogInformation("Article was updated");

            return this.Ok(new { message = "Article was updated" });
        }

        [HttpGet("GetById")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var article = await this.articleManager.GetById(id);

            this.logger.LogInformation("Return article by Id");

            return this.Ok(article);
        }

        [HttpGet("GetAll")]
        public async Task<IActionResult> GetAll()
        {
            var articles = await this.articleManager.GetAll();

            this.logger.LogInformation("Return all article");

            return this.Ok(articles);
        }

        [HttpDelete("Delete")]
        public async Task Delete(Guid id)
        {
            await this.articleManager.Delete(id);

            this.logger.LogInformation("Article was deleted");
        }
    }
}
