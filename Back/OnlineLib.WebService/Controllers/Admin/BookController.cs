using AutoMapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OnlineLib.Domain.DTO.Book;
using OnlineLib.Interfaces.Managers;
using OnlineLib.WebService.Attributes;
using OnlineLib.WebService.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using OnlineLib.Common.Extensions;
using OnlineLib.Common;
using OnlineLib.Interfaces.Managers.Admin;

namespace OnlineLib.WebService.Controllers.Admin
{
    [Authorize]
    [ApiController]
    [Route("admin/[controller]")]
    public class BookController : BaseController
    {
        private readonly IBookManager bookManager;
        private readonly IMapper mapper;
        private readonly ILogger<BookController> logger;
        private readonly string frontPath;
        private IConfiguration configuration;

        public BookController(
            IBookManager bookManager,
            IMapper mapper,
            ILogger<BookController> logger,
            IConfiguration configuration)
        {
            this.bookManager = bookManager;
            this.mapper = mapper;
            this.logger = logger;
            this.configuration = configuration;

            this.frontPath = this.configuration.GetValue<string>(Constants.FrontPath);
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create(BookDTO DTO)
        {
            DTO.Cover = DTO.Cover.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Books", DTO.Cover) : null;

            await this.bookManager.CreateOrUpdate(DTO);

            this.logger.LogInformation("Book was created");

            return this.Ok(new { message = "Book was created" });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(BookDTO DTO)
        {

            DTO.Cover = DTO.Cover.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Books", DTO.Cover) : null;

            await this.bookManager.CreateOrUpdate(DTO);

            this.logger.LogInformation("Book was updated");

            return this.Ok(new { message = "Book was updated" });
        }

        [HttpGet("GetById")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var book = await this.bookManager.GetById(id);

            this.logger.LogInformation("Return book by id");

            return Ok(book);
        }

        [HttpGet("GetAll")]
        public async Task<IActionResult> GetAll()
        {
            var books = await this.bookManager.GetAll();

            this.logger.LogInformation("Return books");

            return Ok(books);
        }

        [HttpDelete("Delete")]
        public async Task Delete(Guid Id)
        {
            await this.bookManager.Delete(Id);
            this.logger.LogInformation($"Delete book with id {Id}");
        }
    }
}
