using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OnlineLib.Domain.DTO;
using OnlineLib.WebService.Attributes;
using OnlineLib.WebService.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class AttachmentsController : BaseController
    {
        private readonly ILogger<AttachmentsController> logger;

        public AttachmentsController(ILogger<AttachmentsController> logger)
        {
            this.logger = logger;
        }

        [HttpPost("AttachImageFile")]
        public async Task<IActionResult> AttachImageFile(Base64ImgFile base64ImgFile)
        {
            string path = SaveImageToServerFolder.Save(base64ImgFile);

            this.logger.LogInformation($"Img added to server by path: {path}");

            return this.Ok(new { message = path });
        }

        [HttpPost("AttachTxtFile")]
        public async Task<IActionResult> AttachTxtFile(Base64TxtFile base64TxtFile)
        {
            string txtString = ConvertBase64ToText.Decode(base64TxtFile.Base64Code);

            this.logger.LogInformation("Text file converted to string success");

            return this.Ok(new { message = txtString });
        }

    }
}
