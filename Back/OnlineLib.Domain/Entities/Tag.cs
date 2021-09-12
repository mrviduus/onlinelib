using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Models.Models
{
    public enum TagType
    {
        Public,
        Shared,
        Private
    }
    public class Tag : EntityBase
    {
       public string Name { get; set; }

        public TagType TagType { get; set; }
    }
}
