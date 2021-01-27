using System;

namespace OnlineLib.Models.Dto
{
    public class ArticleDto
    {
        public Guid Id { get; set; }

        public string Title { get; set; }

        public string Summary { get; set; }

        public string HtmlContent { get; set; }

        public string MarkdownContent { get; set; }

        public Guid CategoryId { get; set; }

        public string Author { get; set; }

        public string Tags { get; set; }

        public bool IsPublished { get; set; }

        public DateTime CreationTime { get; set; }

        public string PageName { get; set; }

        public string Cover { get; set; }

        public string ContentLanguage { get; set; }

        public int Views { get; set; }

        public int Likes { get; set; }

        public int CommentsCount { get; set; }
    }
}