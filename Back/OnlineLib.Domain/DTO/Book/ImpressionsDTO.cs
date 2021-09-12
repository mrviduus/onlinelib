using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Domain.DTO.Book
{
    public class ImpressionsDTO
    {
        public Guid Id { get; set; }

        public Guid BookId { get; set; }

        public string Content { get; set; }

        public Guid? ReplyTo { get; set; }

        public string Author { get; set; }
    }
}
