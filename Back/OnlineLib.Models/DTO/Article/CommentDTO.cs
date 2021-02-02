using System;

namespace OnlineLib.Models.Dto
{
    public class CommentDTO
    {
        public Guid Id { get; set; }

        public Guid ArticleId { get; set; }

        public string Content { get; set; }

        public Guid? ReplyTo { get; set; }

        public string Author { get; set; }
    }
}