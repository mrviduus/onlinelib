using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace OnlineLib.Models.Models
{
    public class Comment : EntityBase
    {
        public Guid ArticleId { get; set; }

        public string Content { get; set; }

        public virtual List<Comment> Replies { get; set; }

        public Guid? ReplyTo { get; set; }

        public string CreatedBy { get; set; }

        public DateTime CreationTime { get; set; }

        public DateTime LastModifiedTime { get; set; }

        public string ModifiedBy { get; set; }
    }
}
