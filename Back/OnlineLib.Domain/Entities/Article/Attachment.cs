using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Models.Models
{
    public class Attachment : EntityBase
    {
        public string Name { get; set; }

        public long? Size { get; set; }

        public string ContentType { get; set; }

        public byte [] Content { get; set; }

        public string RbsInfo { get; set; }
    }
}
