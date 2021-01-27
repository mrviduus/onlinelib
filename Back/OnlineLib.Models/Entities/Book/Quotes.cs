using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Domain.Entities.Book
{
    public class Quotes : EntityBase
    {
        public Guid BookId { get; set; }

        public string Content { get; set; }
    }
}
