using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.WebService.Attributes;
using OnlineLib.WebService.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using OnlineLib.Common.Extensions;

namespace OnlineLib.WebService.Controllers.Admin
{
    [Authorize]
    [ApiController]
    [Route("admin/[controller]")]
    public class ArticleController : BaseController
    {
        private readonly IArticleManager articleManager;
        private readonly IMapper mapper;
        private readonly ILogger<ArticleController> logger;
        private readonly string frontPath;
        private IConfiguration configuration;

        public ArticleController(
            IArticleManager articleManager,
            IMapper mapper,
            ILogger<ArticleController> logger,
            IConfiguration configuration)
        {
            this.articleManager = articleManager;
            this.mapper = mapper;
            this.logger = logger;
            this.configuration = configuration;

            this.frontPath = this.configuration.GetValue<string>(Constants.FrontPath);
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create(ArticleDTO articleDto)
        {
            articleDto.Cover = articleDto.Cover.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Articles", articleDto.Cover) : null;

            await this.articleManager.CreateOrUpdate(articleDto);

            this.logger.LogInformation("Article was created");

            return this.Ok(new { message = "Article was created" });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(ArticleDTO articleDto)
        {
            articleDto.Cover = articleDto.Cover.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Articles", articleDto.Cover) : null;

            await this.articleManager.CreateOrUpdate(articleDto);

            this.logger.LogInformation("Article was updated");

            return this.Ok(new { message = "Article was updated" });
        }

        [HttpGet("GetById")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var article = await this.articleManager.GetById(id);

            this.logger.LogInformation("Return article by Id");

            return Ok(article);
        }

        [HttpGet("GetAll")]
        public async Task<IActionResult> GetAll()
        {
            var articles = await this.articleManager.GetAll();

            this.logger.LogInformation("Return all article");

            return Ok(articles);
        }

        [HttpDelete("Delete")]
        public async Task Delete(Guid id)
        {
            await this.articleManager.Delete(id);

            this.logger.LogInformation("Article was deleted");
        }
    }
}
