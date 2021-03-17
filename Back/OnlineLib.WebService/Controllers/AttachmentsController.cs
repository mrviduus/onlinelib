using Microsoft.AspNetCore.Mvc;
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

        [HttpPost("AttachImageFile")]
        public async Task<IActionResult> AttachImageFile(string json)
        {
            return this.Ok();
        }

        [HttpPost("AttachTxtFile")]
        public async Task<IActionResult> AttachTxtFile(Base64TxtFile base64TxtFile)
        {
            string txtString = ConvertBase64ToText.Decode(base64TxtFile.Base64Code);

            return this.Ok(new { message = txtString });
        }

    }
}
