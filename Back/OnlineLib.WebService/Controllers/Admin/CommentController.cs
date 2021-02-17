using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.WebService.Attributes;
using System;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Controllers.Admin
{
    [Authorize]
    [ApiController]
    [Route("admin/[controller]")]
    public class CommentController : BaseController
    {
        private readonly ICommentManager commentManager;
        private readonly ILogger<CommentController> logger;

        public CommentController(
            ICommentManager commentManager,
            IMapper mapper,
            ILogger<CommentController> logger,
            IConfiguration configuration)
        {
            this.commentManager = commentManager;
            this.logger = logger;
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create(CommentDTO commentDto)
        {
            await this.commentManager.CreateOrUpdate(commentDto);

            this.logger.LogInformation("Comment was created");

            return Ok(new { message = "Comment was created" });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(CommentDTO commentDto)
        {
            await this.commentManager.CreateOrUpdate(commentDto);

            this.logger.LogInformation("Comment was updated");

            return Ok(new { message = "Comment was updated" });
        }

        [HttpGet("GetById")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var comment = await this.commentManager.GetById(id);

            this.logger.LogInformation("Return comment by id");

            return Ok(comment);
        }

        [HttpGet("GetAll")]
        public async Task<IActionResult> GetAll()
        {
            var comments = await this.commentManager.GetAll();

            this.logger.LogInformation("Return all comments");

            return Ok(comments);
        }

        [HttpDelete("Delete")]
        public async Task Delete(Guid id)
        {
            await this.commentManager.Delete(id);

            this.logger.LogInformation("Comment was deleted");
        }
    }
}
