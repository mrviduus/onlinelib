﻿using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers;
using OnlineLib.Models.Dto;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using OnlineLib.Common.Extensions;
using Newtonsoft.Json;
using Microsoft.Extensions.Logging;
using OnlineLib.WebService.Attributes;
using System.IO;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using Microsoft.Extensions.Configuration;
using OnlineLib.WebService.Helpers;

namespace OnlineLib.WebService.Controllers
{
    [Authorize]
    [ApiController]
    [Route("[controller]")]
    public class AdminController : BaseController
    {
        private readonly IAdminManager adminManager;
        private readonly IMapper mapper;
        private readonly ILogger<AdminController> logger;
        private readonly string frontPath;
        private IConfiguration configuration;

        public AdminController(
            IAdminManager adminManager,
            IMapper mapper,
            ILogger<AdminController> logger,
            IConfiguration configuration)
        {
            this.adminManager = adminManager;
            this.mapper = mapper;
            this.logger = logger;
            this.configuration = configuration;

            this.frontPath = this.configuration.GetValue<string>(Constants.FrontPath);
        }

        [HttpGet("GetCategories")]
        public async Task<IActionResult> GetCategories()
        {
            var categories = await this.adminManager.GetCategories();
            //var tree = categories.GenerateTree(c => c.Id, c => c.ParentId);

            //this.logger.LogInformation("Get all categories - done!");

            //return this.Ok(JsonConvert.SerializeObject(tree));
            return this.Ok(categories);
        }

        [HttpGet("GetCategory")]
        public async Task<IActionResult> GetCategory(Guid id)
        {
            var category = await this.adminManager.GetCategory(id);

            return this.Ok(category);
        }

        [HttpPost("CreateCategory")]
        public async Task<IActionResult> CreateCategory(CategoryDto categoryDto)
        {
            categoryDto.Icon = categoryDto.Icon.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Categories", categoryDto.Icon) : null;

            await this.adminManager.CreateOrUpdateCategory(categoryDto);

            this.logger.LogInformation("Category was created");

            return this.Ok(new { message = "Category was created" });
        }

        [HttpPost("UpdateCategory")]
        public async Task<IActionResult> UpdateCategory(CategoryDto categoryDto)
        {
            await this.adminManager.CreateOrUpdateCategory(categoryDto);

            this.logger.LogInformation("Category was updated");

            return this.Ok(new { message = "Category was updated" });
        }

        [HttpDelete("DeleteCategory")]
        public async Task<IActionResult> DeleteCategory(Guid id)
        {
            await this.adminManager.DeleteCategory(id);

            this.logger.LogInformation("Category was deleted");

            return this.Ok(new { message = "Category was deleted" });
        }

        [HttpPost("CreateArticle")]
        public async Task<IActionResult> CreateArticle(ArticleDto articleDto)
        {
            articleDto.Cover = articleDto.Cover.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Articles", articleDto.Cover) : null;

            await this.adminManager.CreateOrUpdateArticle(articleDto);

            this.logger.LogInformation("Article was created");

            return this.Ok(new { message = "Article was created" });
        }

        [HttpPost("UpdateArticle")]
        public async Task<IActionResult> UpdateArticle(ArticleDto articleDto)
        {
            articleDto.Cover = articleDto.Cover.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Articles", articleDto.Cover) : null;

            await this.adminManager.CreateOrUpdateArticle(articleDto);

            this.logger.LogInformation("Article was updated");

            return this.Ok(new { message = "Article was updated" });
        }

        [HttpGet("GetArticle")]
        public async Task<IActionResult> GetArticle(Guid id)
        {
            var article = await this.adminManager.GetArticle(id);

            this.logger.LogInformation("Return article by Id");

            return Ok(article);
        }

        [HttpGet("GetArticles")]
        public async Task<IActionResult> GetArticles()
        {
            var articles = await this.adminManager.GetArticles();

            this.logger.LogInformation("Return all article");

            return Ok(articles);
        }

        [HttpDelete("DeleteArticle")]
        public async Task<IActionResult> DeleteArticles(Guid id)
        {
            await this.adminManager.DeleteArticle(id);

            this.logger.LogInformation("Article was deleted");

            return Ok(new { message = "Article was deleted" });
        }

        [HttpPost("CreateComment")]
        public async Task<IActionResult> CreateComment(CommentDto commentDto)
        {
            await this.adminManager.CreateOrUpdateComment(commentDto);

            this.logger.LogInformation("Comment was created");

            return Ok(new { message = "Comment was created" });
        }

        [HttpPost("UpdateComment")]
        public async Task<IActionResult> UpdateComment(CommentDto commentDto)
        {
            await this.adminManager.CreateOrUpdateComment(commentDto);

            this.logger.LogInformation("Comment was updated");

            return Ok(new { message = "Comment was updated" });
        }

        [HttpDelete("DeleteComment")]
        public async Task<IActionResult> DeleteComment(List<Guid> ids)
        {
            await this.adminManager.DeleteComments(ids);

            this.logger.LogInformation("Comment was deleted");

            return Ok(new { message = "Comment was deleted" });
        }

        [HttpGet("GetComment")]
        public async Task<IActionResult> GetComment(Guid id)
        {
            var comment = this.adminManager.GetComment(id);

            this.logger.LogInformation("Return comment by id");

            return Ok(comment);
        }

        [HttpGet("GetComments")]
        public async Task<IActionResult> GetComments()
        {
            var comments = this.adminManager.GetComments();

            this.logger.LogInformation("Return all comments");

            return Ok(comments);
        }
    }
}