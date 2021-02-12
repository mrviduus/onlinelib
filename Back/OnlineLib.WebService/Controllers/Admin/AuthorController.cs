﻿using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OnlineLib.Domain.DTO.Book;
using OnlineLib.Interfaces.Managers.Admin;
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
    public class AuthorController : BaseController
    {
        private readonly IAuthorManager authorManager;
        private readonly IMapper mapper;
        private readonly ILogger<AuthorController> logger;
        private readonly string frontPath;
        private IConfiguration configuration;

        public AuthorController(
            IAuthorManager authorManager,
            IMapper mapper,
            ILogger<AuthorController> logger,
            IConfiguration configuration)
        {
            this.authorManager = authorManager;
            this.mapper = mapper;
            this.logger = logger;
            this.configuration = configuration;

            this.frontPath = this.configuration.GetValue<string>(Constants.FrontPath);
        }

        [HttpPost("Create")]
        public async Task<IActionResult> Create(AuthorDTO authorDTO)
        {
            authorDTO.Icon = authorDTO.Icon.IsNotNullOrEmpty() ? SaveImageToServerFolder.Save(this.frontPath, "Categories", authorDTO.Icon) : null;

            await this.authorManager.CreateOrUpdate(authorDTO);

            string logMsg = "Author was created";

            this.logger.LogInformation(logMsg);

            return Ok(new { message = logMsg });
        }

        [HttpPost("Update")]
        public async Task<IActionResult> Update(AuthorDTO authorDTO)
        {
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