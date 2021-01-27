using OnlineLib.Models.Entities;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace OnlineLib.Domain.Entities.Book
{
    public class Book : EntityBase
    {
        [ForeignKey("AuthorId")]
        public Author Author { get; set; }

        public Guid AuthorId { get; set; }

        [ForeignKey("CategoryId")]
        public virtual Category Category { get; set; }

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

        [ForeignKey("BookId")]
        public virtual List<Impressions> Impressions { get; set; }

        [ForeignKey("BookId")]
        public virtual List<Quotes> Quotes { get; set; }

    }
}
