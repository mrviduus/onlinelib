using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Domain.Models;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.WebService.Attributes;

namespace OnlineLib.WebService.Controllers.Admin
{
    //[Authorize]
    [ApiController]
    [Route("admin/[controller]")]
    public class CategoryController : BaseController
    {
        private readonly ICategoryManager categoryManager;
        private readonly ILogger<CategoryController> logger;

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
            await this.categoryManager.CreateOrUpdate(categoryDto);

            this.logger.LogInformation("Category was created");

            return this.Ok(new { message = "Category was created" });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(CategoryDTO categoryDto)
        {
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

        [HttpGet]
        public async Task<PaginatedList<CategoryDTO>> GetAll(int pageIndex, int pageSize)
        {
            return await this.categoryManager.PaginatedCategory(pageIndex, pageSize);
        }

        [HttpDelete("Delete")]
        public async Task Delete(Guid id)
        {
            await this.categoryManager.Delete(id);

            this.logger.LogInformation("Category was deleted");
        }
    }
}
