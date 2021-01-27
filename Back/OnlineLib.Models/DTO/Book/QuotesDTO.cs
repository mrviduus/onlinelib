using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Domain.DTO.Book
{
    public class QuotesDTO
    {
        public Guid Id { get; set; }
        public Guid BookId { get; set; }

        public string Content { get; set; }
    }
}
