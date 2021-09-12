using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace OnlineLib.Models.Models
{
    public class Article : EntityBase
    {
        public string Title { get; set; }

        [MaxLength(500)]
        public string Summary { get; set; }

        public string HtmlContent { get; set; }

        public string MarkdownContent { get; set; }

        [ForeignKey("CategoryId")]
        public virtual Category Category { get; set; }

        public Guid CategoryId { get; set; }

        // [ForeignKey("ArticleId")]
        //public virtual List<Attachment> Attachments { get; set; }

        [ForeignKey("ArticleId")]
        public virtual List<Comment> Comments { get; set; }

        public bool IsPublished { get; set; }

        public int Views { get; set; }

        public int Likes { get; set; }

        //For SEO
        public string Cover { get; set; }

        public string PageName { get; set; }

        public string ContentLanguage { get; set; }

        public string CreatedBy { get; set; }

        public DateTime CreationTime { get; set; }

        public DateTime LastModifiedTime { get; set; }

        public string ModifiedBy { get; set; }
    }
}
