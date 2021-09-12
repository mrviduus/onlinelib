using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Domain.DTO.Book
{
    public class BookDTO
    {
        public Guid Id { get; set; }

        public Guid AuthorId { get; set; }

        public Guid CategoryId { get; set; }

        public string Title { get; set; }

        public string Summary { get; set; }

        public string Content { get; set; }

        public DateTime Year { get; set; }

        public string Publisher { get; set; }

        public int Pages { get; set; }

        public string IBSN { get; set; }

        public bool IsPublished { get; set; }

        public int Views { get; set; }

        public string ContentLanguage { get; set; }

        public int Likes { get; set; }
        //For SEO
        public string Cover { get; set; }

        public string PageName { get; set; }

        public string Tags { get; set; }

    }
}
