using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Helpers
{
    public static class SaveImageToServerFolder
    {/// <summary>
     /// Parse and save image in server folder.
     /// </summary>
     /// <param name="frontPath">The path to the folder.</param>
     /// <param name="imgFolder">Folder name</param>
     /// <param name="fileNameAndData">Json with data.</param>
     /// <returns>String with path.</returns>
        public static string Save(string frontPath, string imgFolder, string fileNameAndData)
        {
            var json = JObject.Parse(fileNameAndData);
            var fileName = (string)json["fileName"];
            var fileBase64 = (string)json["fileBase64"];

            var matchGroups = Regex.Match(fileBase64, @"data:image/(?<type>.+?),(?<data>.+)").Groups;
            var base64Data = matchGroups["data"].Value;
            var binData = Convert.FromBase64String(base64Data);
            var folderName = Path.Combine("assets", "Images", imgFolder);
            var pathToSave = Path.Combine(frontPath, folderName, fileName);
            System.IO.File.WriteAllBytes(pathToSave, binData);

            var dbPath = Path.Combine(folderName, fileName);

            return dbPath;
        }
    }
}
