using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.WebService.Attributes;
using System;
using System.Threading.Tasks;
using OnlineLib.Common.Extensions;
using OnlineLib.WebService.Helpers;

namespace OnlineLib.WebService.Controllers.Admin
{
    [Authorize]
    [ApiController]
    [Route("admin/[controller]")]
    public class CategoryController : BaseController
    {
        private readonly ICategoryManager categoryManager;
        private readonly ILogger<CategoryController> logger;
        private const string ImageFolderName = "Categories";

        public CategoryController(
            ICategoryManager categoryManager,
            ILogger<CategoryController> logger)
        {
            this.categoryManager = categoryManager;
            this.logger = logger;
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create(CategoryDTO categoryDto)
        {
            categoryDto.Icon = SaveImageToServerFolder.Save(ImageFolderName, categoryDto.Icon);

            await this.categoryManager.CreateOrUpdate(categoryDto);

            this.logger.LogInformation("Category was created");

            return this.Ok(new { message = "Category was created" });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(CategoryDTO categoryDto)
        {
            categoryDto.Icon = SaveImageToServerFolder.Save(ImageFolderName, categoryDto.Icon);

            await this.categoryManager.CreateOrUpdate(categoryDto);

            this.logger.LogInformation("Category was updated");

            return this.Ok(new { message = "Category was updated" });
        }

        [HttpGet("GetById")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var category = await this.categoryManager.GetById(id);

            this.logger.LogInformation("Get category by Id");

            return this.Ok(category);
        }

        [HttpGet("GetAll")]
        public async Task<IActionResult> GetAll()
        {
            var categories = await this.categoryManager.GetAll();
            //var tree = categories.GenerateTree(c => c.Id, c => c.ParentId);

            //this.logger.LogInformation("Get all categories - done!");

            //return this.Ok(JsonConvert.SerializeObject(tree));
            this.logger.LogInformation("Get all categories");

            return this.Ok(categories);
        }

        [HttpDelete("Delete")]
        public async Task Delete(Guid id)
        {
            await this.categoryManager.Delete(id);

            this.logger.LogInformation("Category was deleted");
        }
    }
}
